import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NutritionProfile {
  id: string;
  height_cm: number;
  weight_lbs: number;
  age_years: number;
  activity_level: string;
  bf_type: string;
  weight_goal: string;
  calorie_goal: number;
  water_goal_oz: number;
}

interface NutritionLog {
  id: string;
  meal_type: string;
  description: string | null;
  calories: number | null;
  water_oz: number | null;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVITY_OPTIONS = [
  { key: 'sedentary', label: 'Sedentary',         sub: 'Little or no exercise' },
  { key: 'light',     label: 'Lightly Active',    sub: 'Light exercise 1–3 days/week' },
  { key: 'moderate',  label: 'Moderately Active', sub: 'Moderate exercise 3–5 days/week' },
  { key: 'active',    label: 'Very Active',        sub: 'Hard exercise 6–7 days/week' },
];

const BF_OPTIONS = [
  { key: 'exclusive', label: 'Exclusively Breastfeeding', sub: 'All feeds from breast or pump' },
  { key: 'combo',     label: 'Combo Feeding',             sub: 'Mix of breast milk and formula' },
  { key: 'none',      label: 'Not Breastfeeding',         sub: 'Formula only or weaned' },
];

const GOAL_OPTIONS = [
  { key: 'lose',     label: 'Lose Weight',     sub: 'Gentle deficit — safe for breastfeeding' },
  { key: 'maintain', label: 'Maintain Weight', sub: 'Eat to sustain current weight' },
  { key: 'gain',     label: 'Gain Weight',     sub: 'Extra energy for recovery or low supply' },
];

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function calcGoals(
  heightFt: number, heightIn: number, weightLbs: number, age: number,
  activity: string, bfType: string, goal: string,
): { calorie_goal: number; water_goal_oz: number; height_cm: number } {
  const heightCm = (heightFt * 12 + heightIn) * 2.54;
  const weightKg = weightLbs * 0.453592;
  // Mifflin-St Jeor (female)
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  const factors: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
  let tdee = bmr * (factors[activity] ?? 1.375);
  if (bfType === 'exclusive') tdee += 500;
  else if (bfType === 'combo') tdee += 300;
  let calorieGoal: number;
  if (goal === 'lose') calorieGoal = Math.max(1800, Math.round(tdee - 400));
  else if (goal === 'gain') calorieGoal = Math.round(tdee + 250);
  else calorieGoal = Math.round(tdee);
  // Water: 0.5 oz per lb + BF bonus, rounded to nearest cup (8 oz)
  let waterOz = weightLbs * 0.5;
  if (bfType === 'exclusive') waterOz += 16;
  else if (bfType === 'combo') waterOz += 8;
  waterOz = Math.round(waterOz / 8) * 8;
  return { calorie_goal: calorieGoal, water_goal_oz: waterOz, height_cm: heightCm };
}

// ─── Style helpers ─────────────────────────────────────────────────────────────

function inputStyle(c: Colors) {
  return {
    backgroundColor: c.card,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.separator,
    padding: 14,
    fontSize: 15,
    color: c.textPrimary,
  };
}
function primaryBtn(c: Colors) {
  return { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' as const };
}
const primaryBtnText = { fontSize: 15, fontWeight: '700' as const, color: '#fff' };

function optionCard(c: Colors) {
  return {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    backgroundColor: c.card, borderRadius: 12, padding: 16,
    borderWidth: 1.5, borderColor: c.separator, gap: 12,
  };
}
function optionCardSelected(c: Colors) {
  return { borderColor: c.primary, backgroundColor: c.cardBlush };
}
function sectionCard(c: Colors) {
  return { backgroundColor: c.card, borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: c.separator };
}
function waterBtn(c: Colors) {
  return {
    backgroundColor: c.cardBlue, borderRadius: 12, paddingVertical: 10,
    alignItems: 'center' as const, borderWidth: 1.5, borderColor: c.blue,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NutritionTracker({ userId }: { userId: string | null }) {
  const c = useColors();

  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile]   = useState<NutritionProfile | null>(null);
  const [logs, setLogs]         = useState<NutritionLog[]>([]);
  const [loading, setLoading]   = useState(true);

  // Setup wizard
  const [showSetup, setShowSetup] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [heightFt, setHeightFt]   = useState('');
  const [heightIn, setHeightIn]   = useState('');
  const [weight, setWeight]       = useState('');
  const [age, setAge]             = useState('');
  const [activity, setActivity]   = useState('');
  const [bfType, setBfType]       = useState('');
  const [goalChoice, setGoalChoice] = useState('');
  const [saving, setSaving]       = useState(false);

  // Add meal modal
  const [showMealModal, setShowMealModal] = useState(false);
  const [mealType, setMealType]           = useState<MealType>('breakfast');
  const [mealDesc, setMealDesc]           = useState('');
  const [mealCal, setMealCal]             = useState('');
  const [addingMeal, setAddingMeal]       = useState(false);

  const [addingWater, setAddingWater]   = useState(false);
  const [customWater, setCustomWater]   = useState('');

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [{ data: profileData }, { data: logData }] = await Promise.all([
        supabase.from('nutrition_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('nutrition_logs').select('*').eq('user_id', userId).eq('log_date', todayISO()),
      ]);
      setProfile(profileData ?? null);
      setLogs(logData ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ─── Derived values ───────────────────────────────────────────────────────

  const totalCalories = useMemo(
    () => logs.reduce((sum, l) => sum + (l.calories ?? 0), 0), [logs]);

  const totalWaterOz = useMemo(
    () => logs.reduce((sum, l) => sum + (l.water_oz ?? 0), 0), [logs]);

  const mealGroups = useMemo(() => {
    const g: Record<string, NutritionLog[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    logs.forEach(l => { if (l.meal_type in g) g[l.meal_type].push(l); });
    return g;
  }, [logs]);

  const caloriePercent = profile ? Math.min(1, totalCalories / profile.calorie_goal) : 0;
  const waterCups      = totalWaterOz / 8;
  const waterGoalCups  = (profile?.water_goal_oz ?? 80) / 8;
  const waterPercent   = profile ? Math.min(1, totalWaterOz / profile.water_goal_oz) : 0;

  // ─── Actions ──────────────────────────────────────────────────────────────

  function openSetup() {
    if (profile) {
      const totalInches = Math.round(profile.height_cm / 2.54);
      setHeightFt(String(Math.floor(totalInches / 12)));
      setHeightIn(String(totalInches % 12));
      setWeight(String(profile.weight_lbs));
      setAge(String(profile.age_years));
      setActivity(profile.activity_level);
      setBfType(profile.bf_type);
      setGoalChoice(profile.weight_goal);
    } else {
      setHeightFt(''); setHeightIn(''); setWeight(''); setAge('');
      setActivity(''); setBfType(''); setGoalChoice('');
    }
    setSetupStep(0);
    setShowSetup(true);
  }

  async function saveProfile() {
    if (!userId) return;
    const ft = parseInt(heightFt) || 0;
    const ins = parseInt(heightIn) || 0;
    const wt = parseFloat(weight) || 0;
    const ag = parseInt(age) || 0;
    if (!ft || !wt || !ag || !activity || !bfType || !goalChoice) {
      Alert.alert('Missing info', 'Please fill in all fields.');
      return;
    }
    setSaving(true);
    try {
      const { calorie_goal, water_goal_oz, height_cm } = calcGoals(ft, ins, wt, ag, activity, bfType, goalChoice);
      const { error } = await supabase.from('nutrition_profiles').upsert({
        user_id: userId, height_cm, weight_lbs: wt, age_years: ag,
        activity_level: activity, bf_type: bfType, weight_goal: goalChoice,
        calorie_goal, water_goal_oz, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      await loadData();
      setShowSetup(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  }

  async function addMeal() {
    if (!userId || !mealCal.trim()) return;
    const cal = parseInt(mealCal);
    if (isNaN(cal) || cal <= 0) { Alert.alert('Enter a valid calorie amount'); return; }
    setAddingMeal(true);
    try {
      const { error } = await supabase.from('nutrition_logs').insert({
        user_id: userId, log_date: todayISO(),
        meal_type: mealType, description: mealDesc.trim() || null, calories: cal,
      });
      if (error) throw error;
      setMealDesc(''); setMealCal(''); setShowMealModal(false);
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAddingMeal(false);
    }
  }

  async function addWater(oz: number) {
    if (!userId) return;
    setAddingWater(true);
    try {
      const { error } = await supabase.from('nutrition_logs').insert({
        user_id: userId, log_date: todayISO(), meal_type: 'water', water_oz: oz,
      });
      if (error) throw error;
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAddingWater(false);
    }
  }

  async function deleteLog(id: string) {
    const { error } = await supabase.from('nutrition_logs').delete().eq('id', id);
    if (error) { Alert.alert('Error', error.message); return; }
    setLogs(prev => prev.filter(l => l.id !== id));
  }

  // ─── Setup wizard ─────────────────────────────────────────────────────────

  function renderSetup() {
    return (
      <Modal visible={showSetup} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: c.separator,
          }}>
            <TouchableOpacity
              onPress={() => setupStep > 0 ? setSetupStep(s => s - 1) : setShowSetup(false)}
              style={{ width: 40 }}
            >
              <Text style={{ fontSize: 20, color: c.textMuted }}>{setupStep > 0 ? '‹' : '✕'}</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>
              {profile ? 'Edit Goals' : 'Set Up Goals'} · {setupStep + 1} / 4
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Progress bar */}
          <View style={{ flexDirection: 'row', height: 4, backgroundColor: c.separator }}>
            <View style={{ width: `${((setupStep + 1) / 4) * 100}%`, backgroundColor: c.primary }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

            {/* Step 0: Measurements */}
            {setupStep === 0 && (
              <View>
                <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary, marginBottom: 6 }}>About you 📏</Text>
                <Text style={{ fontSize: 14, color: c.textMuted, marginBottom: 28, lineHeight: 20 }}>
                  We use this to calculate your personalized calorie and hydration goals.
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Height</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                  <View style={{ flex: 1 }}>
                    <TextInput style={inputStyle(c)} placeholder="5" placeholderTextColor={c.textMuted}
                      value={heightFt} onChangeText={setHeightFt} keyboardType="numeric" maxLength={1} />
                    <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>feet</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextInput style={inputStyle(c)} placeholder="4" placeholderTextColor={c.textMuted}
                      value={heightIn} onChangeText={setHeightIn} keyboardType="numeric" maxLength={2} />
                    <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>inches</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Current Weight (lbs)</Text>
                <TextInput style={[inputStyle(c), { marginBottom: 20 }]} placeholder="e.g. 145"
                  placeholderTextColor={c.textMuted} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Age</Text>
                <TextInput style={[inputStyle(c), { marginBottom: 32 }]} placeholder="e.g. 28"
                  placeholderTextColor={c.textMuted} value={age} onChangeText={setAge} keyboardType="numeric" maxLength={3} />
                <TouchableOpacity
                  style={[primaryBtn(c), { opacity: (heightFt && weight && age) ? 1 : 0.45 }]}
                  disabled={!heightFt || !weight || !age}
                  onPress={() => setSetupStep(1)}
                >
                  <Text style={primaryBtnText}>Continue</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 1: Activity */}
            {setupStep === 1 && (
              <View>
                <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary, marginBottom: 6 }}>Activity level 🏃‍♀️</Text>
                <Text style={{ fontSize: 14, color: c.textMuted, marginBottom: 28, lineHeight: 20 }}>
                  How active are you on most days?
                </Text>
                {ACTIVITY_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt.key} onPress={() => setActivity(opt.key)} activeOpacity={0.8}
                    style={[optionCard(c), activity === opt.key && optionCardSelected(c), { marginBottom: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>{opt.label}</Text>
                      <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{opt.sub}</Text>
                    </View>
                    {activity === opt.key && <Text style={{ fontSize: 18, color: c.primary }}>✓</Text>}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[primaryBtn(c), { marginTop: 20, opacity: activity ? 1 : 0.45 }]}
                  disabled={!activity} onPress={() => setSetupStep(2)}
                >
                  <Text style={primaryBtnText}>Continue</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 2: Breastfeeding */}
            {setupStep === 2 && (
              <View>
                <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary, marginBottom: 6 }}>Breastfeeding 🤱</Text>
                <Text style={{ fontSize: 14, color: c.textMuted, marginBottom: 28, lineHeight: 20 }}>
                  Breastfeeding burns extra calories and increases your hydration needs.
                </Text>
                {BF_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt.key} onPress={() => setBfType(opt.key)} activeOpacity={0.8}
                    style={[optionCard(c), bfType === opt.key && optionCardSelected(c), { marginBottom: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>{opt.label}</Text>
                      <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{opt.sub}</Text>
                    </View>
                    {bfType === opt.key && <Text style={{ fontSize: 18, color: c.primary }}>✓</Text>}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[primaryBtn(c), { marginTop: 20, opacity: bfType ? 1 : 0.45 }]}
                  disabled={!bfType} onPress={() => setSetupStep(3)}
                >
                  <Text style={primaryBtnText}>Continue</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 3: Goal */}
            {setupStep === 3 && (
              <View>
                <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary, marginBottom: 6 }}>Your goal ⚖️</Text>
                <Text style={{ fontSize: 14, color: c.textMuted, marginBottom: 28, lineHeight: 20 }}>
                  We'll adjust your calorie target to match. A gentle deficit is safe while breastfeeding.
                </Text>
                {GOAL_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt.key} onPress={() => setGoalChoice(opt.key)} activeOpacity={0.8}
                    style={[optionCard(c), goalChoice === opt.key && optionCardSelected(c), { marginBottom: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>{opt.label}</Text>
                      <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{opt.sub}</Text>
                    </View>
                    {goalChoice === opt.key && <Text style={{ fontSize: 18, color: c.primary }}>✓</Text>}
                  </TouchableOpacity>
                ))}

                {/* Preview the calculated goals before saving */}
                {goalChoice && heightFt && weight && age && activity && bfType && (() => {
                  const { calorie_goal, water_goal_oz } = calcGoals(
                    parseInt(heightFt), parseInt(heightIn) || 0,
                    parseFloat(weight), parseInt(age), activity, bfType, goalChoice,
                  );
                  return (
                    <View style={{
                      backgroundColor: c.cardSage, borderRadius: 12, padding: 16,
                      marginTop: 20, marginBottom: 8, borderWidth: 1.5, borderColor: c.sage,
                    }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>
                        Your personalized goals
                      </Text>
                      <Text style={{ fontSize: 14, color: c.textPrimary, marginBottom: 4 }}>
                        🍽️  {calorie_goal.toLocaleString()} calories / day
                      </Text>
                      <Text style={{ fontSize: 14, color: c.textPrimary }}>
                        💧  {water_goal_oz / 8} cups of water / day
                      </Text>
                    </View>
                  );
                })()}

                <TouchableOpacity
                  style={[primaryBtn(c), { marginTop: 16, opacity: goalChoice ? 1 : 0.45 }]}
                  disabled={!goalChoice || saving}
                  onPress={saveProfile}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={primaryBtnText}>Save Goals</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  // ─── Empty state ──────────────────────────────────────────────────────────

  if (loading) return <ActivityIndicator style={{ padding: 32 }} color={c.primary} />;

  if (!profile) {
    return (
      <View style={{ backgroundColor: c.cardBlush, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: c.blush }}>
        <Text style={{ fontSize: 36, marginBottom: 8 }}>💧</Text>
        <Text style={{ fontSize: 17, fontWeight: '800', color: c.textPrimary, marginBottom: 6, textAlign: 'center' }}>
          Nutrition & Hydration
        </Text>
        <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
          Track daily calories and water with goals personalized for breastfeeding moms.
        </Text>
        <TouchableOpacity style={primaryBtn(c)} onPress={openSetup}>
          <Text style={[primaryBtnText, { paddingHorizontal: 24 }]}>Set Up My Goals</Text>
        </TouchableOpacity>
        {renderSetup()}
      </View>
    );
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  return (
    <View style={{ gap: 14 }}>
      {/* Section header */}
      <TouchableOpacity
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: c.cardBlue, borderRadius: 14, borderWidth: 2, borderColor: c.blue,
          paddingHorizontal: 16, paddingVertical: 13,
        }}
        onPress={() => setCollapsed(v => !v)}
        activeOpacity={0.75}
      >
        <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary }}>💧 Nutrition & Hydration</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {!collapsed && (
            <TouchableOpacity onPress={e => { e.stopPropagation?.(); openSetup(); }}>
              <Text style={{ fontSize: 13, color: c.blue, fontWeight: '600' }}>Edit goals ›</Text>
            </TouchableOpacity>
          )}
          <Text style={{ fontSize: 20, color: c.blue, fontWeight: '700' }}>
            {collapsed ? '›' : '⌄'}
          </Text>
        </View>
      </TouchableOpacity>

      {!collapsed && (<>
      {/* ── Calorie card ── */}
      <View style={sectionCard(c)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 2 }}>🍽️ Calories today</Text>
            <Text style={{ fontSize: 26, fontWeight: '900', color: c.textPrimary }}>
              {totalCalories.toLocaleString()}
              <Text style={{ fontSize: 14, fontWeight: '500', color: c.textMuted }}> / {profile.calorie_goal.toLocaleString()} kcal</Text>
            </Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: caloriePercent >= 1 ? c.sage : c.textMuted }}>
            {caloriePercent >= 1 ? '✓ Goal reached!' : `${(profile.calorie_goal - totalCalories).toLocaleString()} kcal to go`}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={{ height: 8, backgroundColor: c.separator, borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
          <View style={{ width: `${caloriePercent * 100}%`, height: '100%', backgroundColor: c.primary, borderRadius: 4 }} />
        </View>

        {/* Meal rows */}
        {MEAL_TYPES.map(type => {
          const entries = mealGroups[type];
          const typeCal = entries.reduce((s, e) => s + (e.calories ?? 0), 0);
          return (
            <View key={type} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, textTransform: 'capitalize' }}>
                  {MEAL_EMOJIS[type]} {type}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {typeCal > 0 && (
                    <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600' }}>{typeCal} kcal</Text>
                  )}
                  <TouchableOpacity onPress={() => { setMealType(type); setShowMealModal(true); }}>
                    <Text style={{ fontSize: 13, color: c.primary, fontWeight: '700' }}>+ Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {entries.map(entry => (
                <View key={entry.id} style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4,
                }}>
                  <Text style={{ fontSize: 13, color: c.textPrimary, flex: 1 }} numberOfLines={1}>
                    {entry.description ?? type}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>{entry.calories} kcal</Text>
                    <TouchableOpacity onPress={() => deleteLog(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontSize: 14, color: c.textMuted }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          );
        })}
      </View>

      {/* ── Water card ── */}
      <View style={sectionCard(c)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 2 }}>💧 Water today</Text>
            <Text style={{ fontSize: 26, fontWeight: '900', color: c.textPrimary }}>
              {waterCups % 1 === 0 ? waterCups : waterCups.toFixed(1)}
              <Text style={{ fontSize: 14, fontWeight: '500', color: c.textMuted }}> / {waterGoalCups} cups</Text>
            </Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: waterPercent >= 1 ? c.sage : c.textMuted }}>
            {waterPercent >= 1 ? '✓ Hydrated!' : `${Math.max(0, Math.ceil(waterGoalCups - waterCups))} cups to go`}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={{ height: 8, backgroundColor: c.separator, borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
          <View style={{ width: `${waterPercent * 100}%`, height: '100%', backgroundColor: c.blue, borderRadius: 4 }} />
        </View>

        {/* Cup icons */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
          {Array.from({ length: Math.ceil(waterGoalCups) }).map((_, i) => (
            <Text key={i} style={{ fontSize: 22, opacity: i < waterCups ? 1 : 0.18 }}>🥤</Text>
          ))}
        </View>

        {/* Quick-add buttons */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <TouchableOpacity style={[waterBtn(c), { flex: 1 }]} onPress={() => addWater(8)} disabled={addingWater}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.blue, marginBottom: 2 }}>+ 1 cup</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>8 oz</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[waterBtn(c), { flex: 1 }]} onPress={() => addWater(4)} disabled={addingWater}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.blue, marginBottom: 2 }}>+ ½ cup</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>4 oz</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[waterBtn(c), { flex: 1 }]} onPress={() => addWater(16)} disabled={addingWater}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.blue, marginBottom: 2 }}>+ large</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>16 oz</Text>
          </TouchableOpacity>
        </View>

        {/* Custom amount */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            style={{
              flex: 1, backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5,
              borderColor: c.separator, paddingHorizontal: 12, paddingVertical: 8,
              fontSize: 14, color: c.textPrimary,
            }}
            placeholder="Custom oz..."
            placeholderTextColor={c.textMuted}
            value={customWater}
            onChangeText={setCustomWater}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={() => {
              const oz = parseFloat(customWater);
              if (!isNaN(oz) && oz > 0) { addWater(oz); setCustomWater(''); }
            }}
          />
          <TouchableOpacity
            style={[waterBtn(c), {
              paddingHorizontal: 16, paddingVertical: 10,
              opacity: customWater.trim() && !isNaN(parseFloat(customWater)) ? 1 : 0.4,
            }]}
            disabled={addingWater || !customWater.trim() || isNaN(parseFloat(customWater))}
            onPress={() => {
              const oz = parseFloat(customWater);
              if (!isNaN(oz) && oz > 0) { addWater(oz); setCustomWater(''); }
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.blue }}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Add meal modal ── */}
      <Modal visible={showMealModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: c.separator,
          }}>
            <TouchableOpacity onPress={() => setShowMealModal(false)} style={{ width: 40 }}>
              <Text style={{ fontSize: 18, color: c.textMuted }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>Add Meal</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 12 }}>Meal type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {MEAL_TYPES.map(type => (
                <TouchableOpacity key={type} onPress={() => setMealType(type)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: mealType === type ? c.primary : c.card,
                    borderWidth: 1.5, borderColor: mealType === type ? c.primary : c.separator,
                  }}>
                  <Text style={{
                    fontSize: 13, fontWeight: '700', textTransform: 'capitalize',
                    color: mealType === type ? '#fff' : c.textMuted,
                  }}>
                    {MEAL_EMOJIS[type]} {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>What did you eat?</Text>
            <TextInput style={[inputStyle(c), { marginBottom: 20 }]}
              placeholder="e.g. Oatmeal with berries" placeholderTextColor={c.textMuted}
              value={mealDesc} onChangeText={setMealDesc} />

            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Calories (kcal)</Text>
            <TextInput style={[inputStyle(c), { marginBottom: 32 }]}
              placeholder="e.g. 350" placeholderTextColor={c.textMuted}
              value={mealCal} onChangeText={setMealCal} keyboardType="numeric" />

            <TouchableOpacity
              style={[primaryBtn(c), { opacity: mealCal.trim() ? 1 : 0.45 }]}
              disabled={addingMeal || !mealCal.trim()}
              onPress={addMeal}
            >
              {addingMeal
                ? <ActivityIndicator color="#fff" />
                : <Text style={primaryBtnText}>Save Meal</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      </>)}

      {renderSetup()}
    </View>
  );
}
