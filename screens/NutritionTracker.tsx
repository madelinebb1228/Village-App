import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete, safeUpsert } from '../lib/syncService';
import { useColors, Colors } from '../lib/theme';
import FoodPickerModal, { PerUnitNutrition, RecentMealOption } from '../components/FoodPickerModal';
import NutritionTrendsChart from '../components/NutritionTrendsChart';
import { estimateCaloriesBurned, bfCalorieBonus } from '../lib/calorieBurn';
import { getPregnancyProgress, getWeekInfo } from '../lib/pregnancyData';
import {
  PREGNANCY_CALORIE_BONUS, PREGNANCY_PROTEIN_BONUS_G, PREGNANCY_WATER_BONUS_OZ,
  CAFFEINE_LIMIT_MG_PREGNANT, folateGoalMcg, ironGoalMg,
} from '../lib/pregnancyNutrition';
import { autoFormatDate, parseDisplayDate, toDisplayDate } from '../lib/dateUtils';

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
  protein_goal_g: number | null;
  is_pregnant: boolean;
  due_date: string | null;
}

interface NutritionLog {
  id: string;
  user_id: string;
  log_date: string;
  meal_type: string;
  description: string | null;
  calories: number | null;
  water_oz: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  sugar_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  cholesterol_mg: number | null;
  folate_mcg: number | null;
  iron_mg: number | null;
  caffeine_mg: number | null;
  serving_qty: number | null;
  serving_label: string | null;
  data_source: string | null;
  barcode: string | null;
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

const COLLAPSED_KEY = 'nutrition_collapsed';

// Static daily reference values (not personalized) for the micronutrient bars —
// sodium/cholesterol are upper limits, fiber is a target to reach.
const SODIUM_DV_MG = 2300;
const FIBER_DV_G = 28;
const CHOLESTEROL_DV_MG = 300;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateToISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function formatDateLabel(d: Date): string {
  if (isSameDay(d, new Date())) return 'Today';
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function calcGoals(
  heightCm: number, weightLbs: number, age: number,
  activity: string, bfType: string, goal: string,
): { calorie_goal: number; water_goal_oz: number; protein_goal_g: number } {
  const weightKg = weightLbs * 0.453592;
  // Mifflin-St Jeor (female)
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  const factors: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
  let tdee = bmr * (factors[activity] ?? 1.375);
  tdee += bfCalorieBonus(bfType);
  let calorieGoal: number;
  if (goal === 'lose') calorieGoal = Math.max(1800, Math.round(tdee - 400));
  else if (goal === 'gain') calorieGoal = Math.round(tdee + 250);
  else calorieGoal = Math.round(tdee);
  // Water: 0.5 oz per lb + BF bonus, rounded to nearest cup (8 oz)
  let waterOz = weightLbs * 0.5;
  if (bfType === 'exclusive') waterOz += 16;
  else if (bfType === 'combo') waterOz += 8;
  waterOz = Math.round(waterOz / 8) * 8;
  // Protein: ~0.36g/lb baseline (RDA ~0.8g/kg), +25g exclusive / +15g combo breastfeeding (ACOG/USDA)
  let proteinGoal = weightLbs * 0.36;
  if (bfType === 'exclusive') proteinGoal += 25;
  else if (bfType === 'combo') proteinGoal += 15;
  proteinGoal = Math.round(proteinGoal);
  return { calorie_goal: calorieGoal, water_goal_oz: waterOz, protein_goal_g: proteinGoal };
}

function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * 2.54;
}

function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalInches = Math.round(cm / 2.54);
  return { ft: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

// Used when deriving PER-UNIT values by dividing a stored total by quantity
// (e.g. a 100g entry) — round1's 1-decimal precision can collapse small
// per-gram values to 0, which would silently zero them out on re-save.
function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
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
  const [recentMeals, setRecentMeals] = useState<RecentMealOption[]>([]);

  // Date navigation
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const isToday = isSameDay(selectedDate, new Date());

  // Setup wizard
  const [showSetup, setShowSetup] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [heightUnit, setHeightUnit] = useState<'ft' | 'cm'>('ft');
  const [heightFt, setHeightFt]   = useState('');
  const [heightIn, setHeightIn]   = useState('');
  const [heightCm, setHeightCm]   = useState('');
  const [weight, setWeight]       = useState('');
  const [age, setAge]             = useState('');
  const [activity, setActivity]   = useState('');
  const [bfType, setBfType]       = useState('');
  const [pregnant, setPregnant]   = useState(false);
  const [dueDateInput, setDueDateInput] = useState('');
  const [goalChoice, setGoalChoice] = useState('');
  const [saving, setSaving]       = useState(false);

  // Quick water-goal edit
  const [editingWaterGoal, setEditingWaterGoal] = useState(false);
  const [waterGoalInput, setWaterGoalInput]     = useState('');
  const [savingWaterGoal, setSavingWaterGoal]   = useState(false);

  // Add/edit meal modal — per-unit nutrition + quantity model
  const [showMealModal, setShowMealModal] = useState(false);
  const [editingLog, setEditingLog]       = useState<NutritionLog | null>(null);
  const [mealType, setMealType]           = useState<MealType>('breakfast');
  const [mealDesc, setMealDesc]           = useState('');
  const [mealPerCal, setMealPerCal]               = useState('');
  const [mealPerProtein, setMealPerProtein]       = useState('');
  const [mealPerCarbs, setMealPerCarbs]           = useState('');
  const [mealPerFat, setMealPerFat]               = useState('');
  const [mealPerSugar, setMealPerSugar]           = useState('');
  const [mealPerFiber, setMealPerFiber]           = useState('');
  const [mealPerSodium, setMealPerSodium]         = useState('');
  const [mealPerCholesterol, setMealPerCholesterol] = useState('');
  const [mealPerFolate, setMealPerFolate]         = useState('');
  const [mealPerIron, setMealPerIron]             = useState('');
  const [mealPerCaffeine, setMealPerCaffeine]     = useState('');
  const [mealQty, setMealQty]             = useState('1');
  const [mealLabel, setMealLabel]         = useState('serving');
  const [mealDataSource, setMealDataSource] = useState<string | null>(null);
  const [mealBarcode, setMealBarcode]     = useState<string | null>(null);
  const [showMealMicros, setShowMealMicros] = useState(false);
  const [saveMealToMyFoods, setSaveMealToMyFoods] = useState(false);
  const [addingMeal, setAddingMeal]       = useState(false);
  const [showFoodPicker, setShowFoodPicker] = useState(false);

  const [addingWater, setAddingWater]   = useState(false);
  const [customWater, setCustomWater]   = useState('');

  // Copy previous day's meals
  const [copyingYesterday, setCopyingYesterday] = useState(false);

  // Weekly trends
  const [showTrends, setShowTrends] = useState(false);

  // Exercise calorie burn (from the Movement tracker's mom_movement_logs)
  const [exerciseBurn, setExerciseBurn] = useState(0);

  // ─── Persisted collapse state ───────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(COLLAPSED_KEY).then(v => { if (v != null) setCollapsed(v === '1'); });
  }, []);

  function toggleCollapsed() {
    setCollapsed(v => {
      const next = !v;
      AsyncStorage.setItem(COLLAPSED_KEY, next ? '1' : '0').catch(() => {});
      return next;
    });
  }

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [{ data: profileData }, { data: logData }] = await Promise.all([
        supabase.from('nutrition_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('nutrition_logs').select('*').eq('user_id', userId).eq('log_date', dateToISO(selectedDate)),
      ]);
      let resolvedProfile = profileData as NutritionProfile | null;
      // Backfill protein_goal_g for profiles saved before that column existed.
      if (resolvedProfile && resolvedProfile.protein_goal_g == null) {
        const { protein_goal_g } = calcGoals(
          resolvedProfile.height_cm, resolvedProfile.weight_lbs, resolvedProfile.age_years,
          resolvedProfile.activity_level, resolvedProfile.bf_type, resolvedProfile.weight_goal,
        );
        resolvedProfile = { ...resolvedProfile, protein_goal_g };
        safeUpdate('nutrition_profiles', resolvedProfile.id, { protein_goal_g }).catch(() => {});
      }
      setProfile(resolvedProfile);
      setLogs(logData ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId, selectedDate]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const loadRecentMeals = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('nutrition_logs')
      .select('description, calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg, cholesterol_mg, folate_mcg, iron_mg, caffeine_mg, serving_qty, serving_label')
      .eq('user_id', userId)
      .neq('meal_type', 'water')
      .not('description', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30);
    const seen = new Set<string>();
    const deduped: RecentMealOption[] = [];
    for (const row of (data ?? []) as RecentMealOption[]) {
      const key = (row.description ?? '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
      if (deduped.length >= 6) break;
    }
    setRecentMeals(deduped);
  }, [userId]);

  useEffect(() => { loadRecentMeals(); }, [loadRecentMeals]);

  // Exercise logged for the selected day, converted to an estimated calorie
  // burn via MET values (lib/calorieBurn.ts) — added to the day's calorie
  // budget below, the same way MyFitnessPal "earns back" exercise calories.
  useEffect(() => {
    if (!userId || !profile) { setExerciseBurn(0); return; }
    const dayStart = new Date(selectedDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    let cancelled = false;
    supabase
      .from('mom_movement_logs')
      .select('activity_type, intensity, duration_minutes, calories_burned')
      .eq('user_id', userId)
      .gte('logged_at', dayStart.toISOString())
      .lt('logged_at', dayEnd.toISOString())
      .then(({ data }) => {
        if (cancelled) return;
        // A manually-entered calories_burned (or, eventually, a synced Apple
        // Watch value) takes precedence over the MET-based estimate.
        const total = (data ?? []).reduce((sum, l: any) =>
          sum + (l.calories_burned ?? estimateCaloriesBurned(l.activity_type, l.intensity, l.duration_minutes ?? 0, profile.weight_lbs)), 0);
        setExerciseBurn(Math.round(total));
      });
    return () => { cancelled = true; };
  }, [userId, selectedDate, profile?.weight_lbs]);

  // ─── Derived values ───────────────────────────────────────────────────────

  const mealLogs  = useMemo(() => logs.filter(l => l.meal_type !== 'water'), [logs]);
  const waterLogs = useMemo(() => logs.filter(l => l.meal_type === 'water'), [logs]);

  const totalCalories = useMemo(
    () => mealLogs.reduce((sum, l) => sum + (l.calories ?? 0), 0), [mealLogs]);
  const totalProtein = useMemo(
    () => mealLogs.reduce((sum, l) => sum + (l.protein_g ?? 0), 0), [mealLogs]);
  const totalCarbs = useMemo(
    () => mealLogs.reduce((sum, l) => sum + (l.carbs_g ?? 0), 0), [mealLogs]);
  const totalFat = useMemo(
    () => mealLogs.reduce((sum, l) => sum + (l.fat_g ?? 0), 0), [mealLogs]);
  const totalSugar = useMemo(
    () => mealLogs.reduce((sum, l) => sum + (l.sugar_g ?? 0), 0), [mealLogs]);
  const totalFiber = useMemo(
    () => mealLogs.reduce((sum, l) => sum + (l.fiber_g ?? 0), 0), [mealLogs]);
  const totalSodium = useMemo(
    () => mealLogs.reduce((sum, l) => sum + (l.sodium_mg ?? 0), 0), [mealLogs]);
  const totalCholesterol = useMemo(
    () => mealLogs.reduce((sum, l) => sum + (l.cholesterol_mg ?? 0), 0), [mealLogs]);
  const totalFolate = useMemo(
    () => mealLogs.reduce((sum, l) => sum + (l.folate_mcg ?? 0), 0), [mealLogs]);
  const totalIron = useMemo(
    () => mealLogs.reduce((sum, l) => sum + (l.iron_mg ?? 0), 0), [mealLogs]);
  const totalCaffeine = useMemo(
    () => mealLogs.reduce((sum, l) => sum + (l.caffeine_mg ?? 0), 0), [mealLogs]);

  const totalWaterOz = useMemo(
    () => waterLogs.reduce((sum, l) => sum + (l.water_oz ?? 0), 0), [waterLogs]);

  const mealGroups = useMemo(() => {
    const g: Record<string, NutritionLog[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    mealLogs.forEach(l => { if (l.meal_type in g) g[l.meal_type].push(l); });
    return g;
  }, [mealLogs]);

  const bfBonus = profile ? bfCalorieBonus(profile.bf_type) : 0;
  const pregnancyProgress = profile?.is_pregnant && profile.due_date
    ? getPregnancyProgress(profile.due_date) : null;
  const pregnancyCalBonus = pregnancyProgress ? PREGNANCY_CALORIE_BONUS[pregnancyProgress.trimester] : 0;
  const pregnancyProteinBonus = profile?.is_pregnant ? PREGNANCY_PROTEIN_BONUS_G : 0;
  const pregnancyWaterBonusOz = profile?.is_pregnant ? PREGNANCY_WATER_BONUS_OZ : 0;

  const adjustedCalorieGoal = profile ? profile.calorie_goal + exerciseBurn + pregnancyCalBonus : 0;
  const adjustedProteinGoal = profile ? (profile.protein_goal_g ?? 0) + pregnancyProteinBonus : 0;
  const adjustedWaterGoalOz = (profile?.water_goal_oz ?? 80) + pregnancyWaterBonusOz;

  const caloriePercent = profile ? Math.min(1, totalCalories / adjustedCalorieGoal) : 0;
  const waterCups      = totalWaterOz / 8;
  const waterGoalCups  = adjustedWaterGoalOz / 8;
  const waterPercent   = profile ? Math.min(1, totalWaterOz / adjustedWaterGoalOz) : 0;
  const hasMicros = totalSugar > 0 || totalFiber > 0 || totalSodium > 0 || totalCholesterol > 0;
  const isPregnant = !!profile?.is_pregnant;
  const folateGoal = profile ? folateGoalMcg(isPregnant, profile.bf_type) : 0;
  const ironGoal = profile ? ironGoalMg(isPregnant, profile.bf_type) : 0;

  // Live total preview for the meal-entry form (per-unit × quantity)
  const mealQtyNum = useMemo(() => {
    const n = parseFloat(mealQty);
    return !isNaN(n) && n > 0 ? n : 0;
  }, [mealQty]);

  const mealTotalPreview = useMemo(() => {
    if (!mealQtyNum) return null;
    const per = (v: string) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    const cal = per(mealPerCal);
    return {
      calories: cal != null ? Math.round(cal * mealQtyNum) : null,
      protein_g: (() => { const v = per(mealPerProtein); return v == null ? null : round1(v * mealQtyNum); })(),
      carbs_g:   (() => { const v = per(mealPerCarbs);   return v == null ? null : round1(v * mealQtyNum); })(),
      fat_g:     (() => { const v = per(mealPerFat);     return v == null ? null : round1(v * mealQtyNum); })(),
      sugar_g:   (() => { const v = per(mealPerSugar);   return v == null ? null : round1(v * mealQtyNum); })(),
      fiber_g:   (() => { const v = per(mealPerFiber);   return v == null ? null : round1(v * mealQtyNum); })(),
      sodium_mg: (() => { const v = per(mealPerSodium);  return v == null ? null : round1(v * mealQtyNum); })(),
      cholesterol_mg: (() => { const v = per(mealPerCholesterol); return v == null ? null : round1(v * mealQtyNum); })(),
      folate_mcg: (() => { const v = per(mealPerFolate); return v == null ? null : round1(v * mealQtyNum); })(),
      iron_mg:    (() => { const v = per(mealPerIron);   return v == null ? null : round1(v * mealQtyNum); })(),
      caffeine_mg: (() => { const v = per(mealPerCaffeine); return v == null ? null : round1(v * mealQtyNum); })(),
    };
  }, [mealQtyNum, mealPerCal, mealPerProtein, mealPerCarbs, mealPerFat, mealPerSugar, mealPerFiber, mealPerSodium, mealPerCholesterol, mealPerFolate, mealPerIron, mealPerCaffeine]);

  // ─── Date nav actions ─────────────────────────────────────────────────────

  function goPrevDay() {
    setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return nd; });
  }
  function goNextDay() {
    if (isToday) return;
    setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return nd; });
  }
  function goToday() {
    setSelectedDate(new Date());
  }

  // ─── Setup actions ────────────────────────────────────────────────────────

  function openSetup() {
    if (profile) {
      const { ft, inches } = cmToFtIn(profile.height_cm);
      setHeightFt(String(ft));
      setHeightIn(String(inches));
      setHeightCm(String(Math.round(profile.height_cm)));
      setWeight(String(profile.weight_lbs));
      setAge(String(profile.age_years));
      setActivity(profile.activity_level);
      setBfType(profile.bf_type);
      setGoalChoice(profile.weight_goal);
      setPregnant(profile.is_pregnant);
      setDueDateInput(profile.due_date ? toDisplayDate(profile.due_date) : '');
    } else {
      setHeightFt(''); setHeightIn(''); setHeightCm(''); setWeight(''); setAge('');
      setActivity(''); setBfType(''); setGoalChoice('');
      setPregnant(false); setDueDateInput('');
    }
    setHeightUnit('ft');
    setSetupStep(0);
    setShowSetup(true);
    // Best-effort convenience prefill from an expecting baby record — only
    // when this profile has no pregnancy data of its own yet.
    if (userId && !profile?.due_date) {
      (supabase.from('babies') as any).select('due_date')
        .eq('user_id', userId).eq('is_expecting', true)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
        .then(({ data }: any) => {
          if (data?.due_date) {
            setPregnant(true);
            setDueDateInput(toDisplayDate(data.due_date));
          }
        })
        .catch(() => {});
    }
  }

  function toggleHeightUnit() {
    setHeightUnit(u => {
      if (u === 'ft') {
        const cm = ftInToCm(parseInt(heightFt) || 0, parseInt(heightIn) || 0);
        if (cm > 0) setHeightCm(String(Math.round(cm)));
        return 'cm';
      } else {
        const { ft, inches } = cmToFtIn(parseFloat(heightCm) || 0);
        setHeightFt(String(ft));
        setHeightIn(String(inches));
        return 'ft';
      }
    });
  }

  function currentHeightCm(): number {
    return heightUnit === 'cm'
      ? parseFloat(heightCm) || 0
      : ftInToCm(parseInt(heightFt) || 0, parseInt(heightIn) || 0);
  }

  async function saveProfile() {
    if (!userId) return;
    const hCm = currentHeightCm();
    const wt = parseFloat(weight) || 0;
    const ag = parseInt(age) || 0;
    if (!hCm || !wt || !ag || !activity || !bfType || !goalChoice) {
      Alert.alert('Missing info', 'Please fill in all fields.');
      return;
    }
    const dueDateISO = pregnant ? parseDisplayDate(dueDateInput) : null;
    if (pregnant && !dueDateISO) {
      Alert.alert('Missing due date', 'Enter a valid due date (MM/DD/YYYY) or turn off "Currently pregnant."');
      return;
    }
    setSaving(true);
    try {
      const { calorie_goal, water_goal_oz, protein_goal_g } = calcGoals(hCm, wt, ag, activity, bfType, goalChoice);
      await safeUpsert('nutrition_profiles', {
        user_id: userId, height_cm: hCm, weight_lbs: wt, age_years: ag,
        activity_level: activity, bf_type: bfType, weight_goal: goalChoice,
        calorie_goal, water_goal_oz, protein_goal_g,
        is_pregnant: pregnant, due_date: dueDateISO,
        updated_at: new Date().toISOString(),
      }, 'user_id');
      await loadData();
      setShowSetup(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  }

  // ─── Quick water-goal edit ────────────────────────────────────────────────

  function openWaterGoalEdit() {
    if (!profile) return;
    setWaterGoalInput(String(profile.water_goal_oz / 8));
    setEditingWaterGoal(true);
  }

  async function saveWaterGoal() {
    if (!profile) return;
    const cups = parseFloat(waterGoalInput);
    if (!cups || cups <= 0) { Alert.alert('Enter a valid number of cups'); return; }
    setSavingWaterGoal(true);
    try {
      await safeUpdate('nutrition_profiles', profile.id, { water_goal_oz: cups * 8 });
      await loadData();
      setEditingWaterGoal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingWaterGoal(false);
    }
  }

  // ─── Meal modal actions ───────────────────────────────────────────────────

  function resetMealForm() {
    setMealDesc('');
    setMealPerCal(''); setMealPerProtein(''); setMealPerCarbs(''); setMealPerFat('');
    setMealPerSugar(''); setMealPerFiber(''); setMealPerSodium(''); setMealPerCholesterol('');
    setMealPerFolate(''); setMealPerIron(''); setMealPerCaffeine('');
    setMealQty('1'); setMealLabel('serving');
    setMealDataSource(null); setMealBarcode(null);
    setShowMealMicros(false); setSaveMealToMyFoods(false);
  }

  function openAddMeal(type: MealType) {
    setEditingLog(null);
    setMealType(type);
    resetMealForm();
    setShowMealModal(true);
  }

  function openEditMeal(log: NutritionLog) {
    setEditingLog(log);
    setMealType((log.meal_type as MealType) ?? 'breakfast');
    setMealDesc(log.description ?? '');
    const qty = log.serving_qty || 1;
    const per = (total: number | null) => total == null ? '' : String(round4(total / qty));
    setMealPerCal(log.calories != null ? String(round4(log.calories / qty)) : '');
    setMealPerProtein(per(log.protein_g));
    setMealPerCarbs(per(log.carbs_g));
    setMealPerFat(per(log.fat_g));
    setMealPerSugar(per(log.sugar_g));
    setMealPerFiber(per(log.fiber_g));
    setMealPerSodium(per(log.sodium_mg));
    setMealPerCholesterol(per(log.cholesterol_mg));
    setMealPerFolate(per(log.folate_mcg));
    setMealPerIron(per(log.iron_mg));
    setMealPerCaffeine(per(log.caffeine_mg));
    setMealQty(String(qty));
    setMealLabel(log.serving_label || 'serving');
    setMealDataSource(log.data_source);
    setMealBarcode(log.barcode);
    setShowMealMicros(!!(log.sugar_g || log.fiber_g || log.sodium_mg || log.cholesterol_mg || log.folate_mcg || log.iron_mg || log.caffeine_mg));
    setSaveMealToMyFoods(false);
    setShowMealModal(true);
  }

  function applyRecentMeal(m: RecentMealOption) {
    const qty = m.serving_qty || 1;
    const per = (total: number | null) => total == null ? '' : String(round4(total / qty));
    setMealDesc(m.description);
    setMealPerCal(m.calories != null ? String(round4(m.calories / qty)) : '');
    setMealPerProtein(per(m.protein_g));
    setMealPerCarbs(per(m.carbs_g));
    setMealPerFat(per(m.fat_g));
    setMealPerSugar(per(m.sugar_g));
    setMealPerFiber(per(m.fiber_g));
    setMealPerSodium(per(m.sodium_mg));
    setMealPerCholesterol(per(m.cholesterol_mg));
    setMealPerFolate(per(m.folate_mcg));
    setMealPerIron(per(m.iron_mg));
    setMealPerCaffeine(per(m.caffeine_mg));
    setMealQty(String(qty));
    setMealLabel(m.serving_label || 'serving');
    setMealDataSource('manual');
    setMealBarcode(null);
    setShowMealMicros(!!(m.sugar_g || m.fiber_g || m.sodium_mg || m.cholesterol_mg || m.folate_mcg || m.iron_mg || m.caffeine_mg));
  }

  function handleFoodPickerApply(
    perUnit: PerUnitNutrition, qty: number, label: string, desc: string,
    opts: { source: string; barcode: string | null },
  ) {
    setEditingLog(null);
    setMealDesc(desc);
    setMealPerCal(perUnit.calories != null ? String(perUnit.calories) : '');
    setMealPerProtein(perUnit.protein_g != null ? String(perUnit.protein_g) : '');
    setMealPerCarbs(perUnit.carbs_g != null ? String(perUnit.carbs_g) : '');
    setMealPerFat(perUnit.fat_g != null ? String(perUnit.fat_g) : '');
    setMealPerSugar(perUnit.sugar_g != null ? String(perUnit.sugar_g) : '');
    setMealPerFiber(perUnit.fiber_g != null ? String(perUnit.fiber_g) : '');
    setMealPerSodium(perUnit.sodium_mg != null ? String(perUnit.sodium_mg) : '');
    setMealPerCholesterol(perUnit.cholesterol_mg != null ? String(perUnit.cholesterol_mg) : '');
    setMealPerFolate(perUnit.folate_mcg != null ? String(perUnit.folate_mcg) : '');
    setMealPerIron(perUnit.iron_mg != null ? String(perUnit.iron_mg) : '');
    setMealPerCaffeine(perUnit.caffeine_mg != null ? String(perUnit.caffeine_mg) : '');
    setMealQty(String(qty));
    setMealLabel(label);
    setMealDataSource(opts.source);
    setMealBarcode(opts.barcode);
    setShowMealMicros(!!(perUnit.sugar_g || perUnit.fiber_g || perUnit.sodium_mg || perUnit.cholesterol_mg || perUnit.folate_mcg || perUnit.iron_mg || perUnit.caffeine_mg));
    setSaveMealToMyFoods(false);
    setShowFoodPicker(false);
    setShowMealModal(true);
  }

  async function saveMeal() {
    if (!userId) return;
    const perCal = parseFloat(mealPerCal);
    if (isNaN(perCal) || perCal <= 0) { Alert.alert('Enter a valid calorie amount'); return; }
    if (!mealQtyNum) { Alert.alert('Enter a valid quantity'); return; }
    setAddingMeal(true);
    try {
      const per = (v: string) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
      const totalInt = (v: number | null) => v == null ? null : Math.round(v * mealQtyNum);
      const total1 = (v: number | null) => v == null ? null : round1(v * mealQtyNum);
      const label = mealLabel.trim() || 'serving';
      const perProtein = per(mealPerProtein), perCarbs = per(mealPerCarbs), perFat = per(mealPerFat);
      const perSugar = per(mealPerSugar), perFiber = per(mealPerFiber), perSodium = per(mealPerSodium), perCholesterol = per(mealPerCholesterol);
      const perFolate = per(mealPerFolate), perIron = per(mealPerIron), perCaffeine = per(mealPerCaffeine);

      const fields = {
        meal_type: mealType,
        description: mealDesc.trim() || null,
        calories: totalInt(perCal),
        protein_g: total1(perProtein),
        carbs_g: total1(perCarbs),
        fat_g: total1(perFat),
        sugar_g: total1(perSugar),
        fiber_g: total1(perFiber),
        sodium_mg: total1(perSodium),
        cholesterol_mg: total1(perCholesterol),
        folate_mcg: total1(perFolate),
        iron_mg: total1(perIron),
        caffeine_mg: total1(perCaffeine),
        serving_qty: mealQtyNum,
        serving_label: label,
        data_source: mealDataSource ?? 'manual',
        barcode: mealBarcode,
      };
      if (editingLog) {
        await safeUpdate('nutrition_logs', editingLog.id, fields);
      } else {
        await safeInsert('nutrition_logs', {
          user_id: userId, log_date: dateToISO(selectedDate), ...fields,
        });
      }
      if (saveMealToMyFoods && mealDataSource !== 'saved_food') {
        safeInsert('nutrition_saved_foods', {
          user_id: userId, name: mealDesc.trim() || 'Food item', serving_label: label,
          calories: perCal, protein_g: perProtein, carbs_g: perCarbs, fat_g: perFat,
          sugar_g: perSugar, fiber_g: perFiber, sodium_mg: perSodium, cholesterol_mg: perCholesterol,
          folate_mcg: perFolate, iron_mg: perIron, caffeine_mg: perCaffeine,
          source: mealDataSource === 'barcode' ? 'barcode' : mealDataSource === 'search' ? 'search' : 'manual',
          barcode: mealBarcode,
        }).catch(() => {});
      }
      resetMealForm();
      setEditingLog(null);
      setShowMealModal(false);
      await loadData();
      loadRecentMeals();
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
      await safeInsert('nutrition_logs', {
        user_id: userId, log_date: dateToISO(selectedDate), meal_type: 'water', water_oz: oz,
      });
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAddingWater(false);
    }
  }

  async function deleteLog(id: string) {
    try {
      await safeDelete('nutrition_logs', id);
      setLogs(prev => prev.filter(l => l.id !== id));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  // ─── Copy previous day's meals ────────────────────────────────────────────

  async function copyYesterdaysMeals() {
    if (!userId) return;
    setCopyingYesterday(true);
    try {
      const prevDay = new Date(selectedDate);
      prevDay.setDate(prevDay.getDate() - 1);
      const { data } = await supabase
        .from('nutrition_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('log_date', dateToISO(prevDay))
        .neq('meal_type', 'water');
      const rows = (data ?? []) as NutritionLog[];
      if (rows.length === 0) {
        Alert.alert('Nothing to copy', `No meals logged on ${formatDateLabel(prevDay)}.`);
        return;
      }
      for (const row of rows) {
        const { id, created_at, user_id, log_date, ...rest } = row;
        await safeInsert('nutrition_logs', {
          ...rest, user_id: userId, log_date: dateToISO(selectedDate), data_source: 'copied',
        });
      }
      await loadData();
      loadRecentMeals();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCopyingYesterday(false);
    }
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
              accessibilityRole="button" accessibilityLabel={setupStep > 0 ? 'Back' : 'Close'}
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
                <Text style={{ fontSize: 14, color: c.textMuted, marginBottom: 20, lineHeight: 20 }}>
                  We use this to calculate your personalized calorie and hydration goals.
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary }}>Height</Text>
                  <TouchableOpacity onPress={toggleHeightUnit}
                    accessibilityRole="button" accessibilityLabel={`Switch height unit to ${heightUnit === 'ft' ? 'cm' : 'ft/in'}`}>
                    <Text style={{ fontSize: 12, color: c.primary, fontWeight: '700' }}>
                      Switch to {heightUnit === 'ft' ? 'cm' : 'ft/in'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {heightUnit === 'ft' ? (
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                    <View style={{ flex: 1 }}>
                      <TextInput style={inputStyle(c)} placeholder="5" placeholderTextColor={c.textMuted}
                        value={heightFt} onChangeText={setHeightFt} keyboardType="numeric" maxLength={1}
                        accessibilityLabel="Height feet" />
                      <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>feet</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <TextInput style={inputStyle(c)} placeholder="4" placeholderTextColor={c.textMuted}
                        value={heightIn} onChangeText={setHeightIn} keyboardType="numeric" maxLength={2}
                        accessibilityLabel="Height inches" />
                      <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>inches</Text>
                    </View>
                  </View>
                ) : (
                  <View style={{ marginBottom: 20 }}>
                    <TextInput style={inputStyle(c)} placeholder="e.g. 163" placeholderTextColor={c.textMuted}
                      value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" maxLength={3}
                      accessibilityLabel="Height in centimeters" />
                    <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>cm</Text>
                  </View>
                )}

                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Current Weight (lbs)</Text>
                <TextInput style={[inputStyle(c), { marginBottom: 20 }]} placeholder="e.g. 145"
                  placeholderTextColor={c.textMuted} value={weight} onChangeText={setWeight} keyboardType="decimal-pad"
                  accessibilityLabel="Current weight in pounds" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Age</Text>
                <TextInput style={[inputStyle(c), { marginBottom: 32 }]} placeholder="e.g. 28"
                  placeholderTextColor={c.textMuted} value={age} onChangeText={setAge} keyboardType="numeric" maxLength={3}
                  accessibilityLabel="Age" />
                <TouchableOpacity
                  style={[primaryBtn(c), { opacity: (currentHeightCm() && weight && age) ? 1 : 0.45 }]}
                  disabled={!currentHeightCm() || !weight || !age}
                  onPress={() => setSetupStep(1)}
                  accessibilityRole="button" accessibilityLabel="Continue"
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
                    accessibilityRole="button" accessibilityLabel={opt.label}
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
                  accessibilityRole="button" accessibilityLabel="Continue"
                >
                  <Text style={primaryBtnText}>Continue</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 2: Breastfeeding */}
            {setupStep === 2 && (
              <View>
                <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary, marginBottom: 6 }}>Breastfeeding & pregnancy</Text>
                <Text style={{ fontSize: 14, color: c.textMuted, marginBottom: 28, lineHeight: 20 }}>
                  Both change your calorie, water, and nutrient needs — we'll factor in whichever apply to you.
                </Text>
                {BF_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt.key} onPress={() => setBfType(opt.key)} activeOpacity={0.8}
                    accessibilityRole="button" accessibilityLabel={opt.label}
                    style={[optionCard(c), bfType === opt.key && optionCardSelected(c), { marginBottom: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>{opt.label}</Text>
                      <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{opt.sub}</Text>
                    </View>
                    {bfType === opt.key && <Text style={{ fontSize: 18, color: c.primary }}>✓</Text>}
                  </TouchableOpacity>
                ))}

                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginTop: 12, marginBottom: 8 }}>
                  Currently pregnant? 🤰
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: pregnant ? 16 : 0 }}>
                  {[{ v: false, label: 'No' }, { v: true, label: 'Yes' }].map(opt => (
                    <TouchableOpacity key={String(opt.v)} onPress={() => setPregnant(opt.v)} activeOpacity={0.8}
                      accessibilityRole="button" accessibilityLabel={opt.label}
                      style={[optionCard(c), pregnant === opt.v && optionCardSelected(c), { flex: 1, justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {pregnant && (
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Due date</Text>
                    <TextInput style={inputStyle(c)} placeholder="MM/DD/YYYY" placeholderTextColor={c.textMuted}
                      value={dueDateInput} onChangeText={t => setDueDateInput(autoFormatDate(t, dueDateInput))}
                      keyboardType="numeric" maxLength={10} accessibilityLabel="Due date" />
                  </View>
                )}

                <TouchableOpacity
                  style={[primaryBtn(c), { marginTop: 20, opacity: (bfType && (!pregnant || parseDisplayDate(dueDateInput))) ? 1 : 0.45 }]}
                  disabled={!bfType || (pregnant && !parseDisplayDate(dueDateInput))} onPress={() => setSetupStep(3)}
                  accessibilityRole="button" accessibilityLabel="Continue"
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
                    accessibilityRole="button" accessibilityLabel={opt.label}
                    style={[optionCard(c), goalChoice === opt.key && optionCardSelected(c), { marginBottom: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>{opt.label}</Text>
                      <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{opt.sub}</Text>
                    </View>
                    {goalChoice === opt.key && <Text style={{ fontSize: 18, color: c.primary }}>✓</Text>}
                  </TouchableOpacity>
                ))}

                {/* Preview the calculated goals before saving */}
                {goalChoice && currentHeightCm() > 0 && weight && age && activity && bfType && (() => {
                  const { calorie_goal, water_goal_oz, protein_goal_g } = calcGoals(
                    currentHeightCm(), parseFloat(weight), parseInt(age), activity, bfType, goalChoice,
                  );
                  const previewDueDate = pregnant ? parseDisplayDate(dueDateInput) : null;
                  const previewTrimester = previewDueDate ? getPregnancyProgress(previewDueDate).trimester : null;
                  const previewPregBonus = previewTrimester ? PREGNANCY_CALORIE_BONUS[previewTrimester] : 0;
                  return (
                    <View style={{
                      backgroundColor: c.cardSage, borderRadius: 12, padding: 16,
                      marginTop: 20, marginBottom: 8, borderWidth: 1.5, borderColor: c.sage,
                    }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>
                        Your personalized goals
                      </Text>
                      <Text style={{ fontSize: 14, color: c.textPrimary, marginBottom: 4 }}>
                        🍽️  {(calorie_goal + previewPregBonus).toLocaleString()} calories / day
                        {previewPregBonus > 0 ? ` (includes +${previewPregBonus} for trimester ${previewTrimester})` : ''}
                      </Text>
                      <Text style={{ fontSize: 14, color: c.textPrimary, marginBottom: 4 }}>
                        💧  {water_goal_oz / 8 + (pregnant ? PREGNANCY_WATER_BONUS_OZ / 8 : 0)} cups of water / day
                      </Text>
                      <Text style={{ fontSize: 14, color: c.textPrimary }}>
                        🥩  {protein_goal_g + (pregnant ? PREGNANCY_PROTEIN_BONUS_G : 0)}g protein / day
                        {bfType !== 'none' || pregnant ? ' (includes breastfeeding/pregnancy bump)' : ''}
                      </Text>
                    </View>
                  );
                })()}

                <TouchableOpacity
                  style={[primaryBtn(c), { marginTop: 16, opacity: goalChoice ? 1 : 0.45 }]}
                  disabled={!goalChoice || saving}
                  onPress={saveProfile}
                  accessibilityRole="button" accessibilityLabel="Save goals"
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
      <View style={{ backgroundColor: c.cardBlush, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: c.blush, marginBottom: 16 }}>
        <Text style={{ fontSize: 36, marginBottom: 8 }}>💧</Text>
        <Text style={{ fontSize: 17, fontWeight: '800', color: c.textPrimary, marginBottom: 6, textAlign: 'center' }}>
          Nutrition & Hydration
        </Text>
        <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
          Track daily calories and water with goals personalized for breastfeeding parents.
        </Text>
        <TouchableOpacity style={primaryBtn(c)} onPress={openSetup}
          accessibilityRole="button" accessibilityLabel="Set up my goals">
          <Text style={[primaryBtnText, { paddingHorizontal: 24 }]}>Set Up My Goals</Text>
        </TouchableOpacity>
        {renderSetup()}
      </View>
    );
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  const hasMacros = totalProtein > 0 || totalCarbs > 0 || totalFat > 0;
  const proteinGoalReasons = [profile.bf_type !== 'none' ? 'breastfeeding' : null, isPregnant ? 'pregnancy' : null].filter(Boolean);

  return (
    <View style={{ gap: 14, marginBottom: 16 }}>
      {/* Section header */}
      <TouchableOpacity
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: c.cardBlue, borderRadius: 14, borderWidth: 2, borderColor: c.blue,
          paddingHorizontal: 16, paddingVertical: 13,
        }}
        onPress={toggleCollapsed}
        activeOpacity={0.75}
        accessibilityRole="button" accessibilityLabel={collapsed ? 'Expand Nutrition and Hydration' : 'Collapse Nutrition and Hydration'}
      >
        <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary }}>💧 Nutrition & Hydration</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {!collapsed && (
            <TouchableOpacity onPress={e => { e.stopPropagation?.(); openSetup(); }}
              accessibilityRole="button" accessibilityLabel="Edit goals">
              <Text style={{ fontSize: 13, color: c.blue, fontWeight: '600' }}>Edit goals ›</Text>
            </TouchableOpacity>
          )}
          <Text style={{ fontSize: 20, color: c.blue, fontWeight: '700' }}>
            {collapsed ? '›' : '⌄'}
          </Text>
        </View>
      </TouchableOpacity>

      {!collapsed && (<>
      {/* ── Date nav ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TouchableOpacity onPress={goPrevDay} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button" accessibilityLabel="Previous day">
          <Text style={{ fontSize: 20, color: c.textSecondary }}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goToday} disabled={isToday}
          accessibilityRole="button" accessibilityLabel="Back to today">
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>{formatDateLabel(selectedDate)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goNextDay} disabled={isToday} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button" accessibilityLabel="Next day">
          <Text style={{ fontSize: 20, color: isToday ? c.separator : c.textSecondary }}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Pregnancy week/size + overdue nudge ── */}
      {pregnancyProgress && (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: c.textSecondary }}>
            🤰 Week {pregnancyProgress.weeksPregnant} · about the size of {getWeekInfo(pregnancyProgress.weeksPregnant).size} {getWeekInfo(pregnancyProgress.weeksPregnant).emoji}
          </Text>
          {pregnancyProgress.daysUntilDue < -14 && (
            <TouchableOpacity onPress={openSetup} accessibilityRole="button" accessibilityLabel="Update pregnancy status">
              <Text style={{ fontSize: 11, color: c.primary, fontWeight: '600', marginTop: 2 }}>
                Due date has passed — update your pregnancy status ›
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Copy yesterday's meals ── */}
      {mealLogs.length === 0 && (
        <TouchableOpacity
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: c.cardHoney, borderRadius: 12, borderWidth: 1.5, borderColor: c.honey, paddingVertical: 12,
          }}
          onPress={copyYesterdaysMeals}
          disabled={copyingYesterday}
          activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel="Copy yesterday's meals"
        >
          {copyingYesterday
            ? <ActivityIndicator color={c.textSecondary} size="small" />
            : <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary }}>📋 Copy yesterday's meals</Text>
          }
        </TouchableOpacity>
      )}

      {/* ── Calorie card ── */}
      <View style={sectionCard(c)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 2 }}>🍽️ Calories</Text>
            <Text style={{ fontSize: 26, fontWeight: '900', color: c.textPrimary }}>
              {totalCalories.toLocaleString()}
              <Text style={{ fontSize: 14, fontWeight: '500', color: c.textMuted }}> / {adjustedCalorieGoal.toLocaleString()} kcal</Text>
            </Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: caloriePercent >= 1 ? c.sage : c.textMuted }}>
            {caloriePercent >= 1 ? '✓ Goal reached!' : `${(adjustedCalorieGoal - totalCalories).toLocaleString()} kcal to go`}
          </Text>
        </View>

        {(bfBonus > 0 || exerciseBurn > 0 || pregnancyCalBonus > 0) && (
          <Text style={{ fontSize: 11, color: c.textMuted, marginBottom: 8 }}>
            Includes {[
              bfBonus > 0 ? `+${bfBonus} breastfeeding` : null,
              pregnancyCalBonus > 0 ? `+${pregnancyCalBonus} pregnancy (trimester ${pregnancyProgress!.trimester})` : null,
              exerciseBurn > 0 ? `+${exerciseBurn} exercise today` : null,
            ].filter(Boolean).join(' · ')}
          </Text>
        )}

        {/* Progress bar */}
        <View style={{ height: 8, backgroundColor: c.separator, borderRadius: 4, overflow: 'hidden', marginBottom: hasMacros ? 10 : 16 }}>
          <View style={{ width: `${caloriePercent * 100}%`, height: '100%', backgroundColor: c.primary, borderRadius: 4 }} />
        </View>

        {profile.protein_goal_g ? (
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.textSecondary }}>
                🥩 Protein{proteinGoalReasons.length > 0 ? ` (${proteinGoalReasons.join(' + ')} goal)` : ''}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: totalProtein >= adjustedProteinGoal ? c.sage : c.textMuted }}>
                {totalProtein.toFixed(0)} / {adjustedProteinGoal}g
              </Text>
            </View>
            <View style={{ height: 6, backgroundColor: c.separator, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{
                width: `${Math.min(100, (totalProtein / adjustedProteinGoal) * 100)}%`,
                height: '100%', backgroundColor: c.sage,
              }} />
            </View>
            {(totalCarbs > 0 || totalFat > 0) && (
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 6 }}>
                Carbs {totalCarbs.toFixed(0)}g · Fat {totalFat.toFixed(0)}g
              </Text>
            )}
          </View>
        ) : hasMacros && (
          <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 16 }}>
            Protein {totalProtein.toFixed(0)}g · Carbs {totalCarbs.toFixed(0)}g · Fat {totalFat.toFixed(0)}g
          </Text>
        )}

        {/* Micronutrients — static reference values, not personalized goals */}
        {hasMicros && (
          <View style={{ marginBottom: 16, gap: 10 }}>
            {[
              { key: 'sodium', label: 'Sodium', value: totalSodium, dv: SODIUM_DV_MG, unit: 'mg', color: c.blush },
              { key: 'fiber', label: 'Fiber', value: totalFiber, dv: FIBER_DV_G, unit: 'g', color: c.sage },
              { key: 'cholesterol', label: 'Cholesterol', value: totalCholesterol, dv: CHOLESTEROL_DV_MG, unit: 'mg', color: c.lavender },
            ].map(m => (
              <View key={m.key}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.textSecondary }}>{m.label}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{m.value.toFixed(0)} / {m.dv}{m.unit}</Text>
                </View>
                <View style={{ height: 6, backgroundColor: c.separator, borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.min(100, (m.value / m.dv) * 100)}%`, height: '100%', backgroundColor: m.color }} />
                </View>
              </View>
            ))}
            {totalSugar > 0 && (
              <Text style={{ fontSize: 11, color: c.textMuted }}>Sugar {totalSugar.toFixed(0)}g</Text>
            )}
          </View>
        )}

        {/* Pregnancy-specific micronutrients — personalized DVs, only shown when pregnant */}
        {isPregnant && (totalFolate > 0 || totalIron > 0 || totalCaffeine > 0) && (
          <View style={{ marginBottom: 16, gap: 10 }}>
            {[
              { key: 'folate', label: 'Folate', value: totalFolate, dv: folateGoal, unit: 'mcg', color: c.honey },
              { key: 'iron', label: 'Iron', value: totalIron, dv: ironGoal, unit: 'mg', color: c.blush },
              { key: 'caffeine', label: 'Caffeine', value: totalCaffeine, dv: CAFFEINE_LIMIT_MG_PREGNANT, unit: 'mg', color: c.lavender },
            ].map(m => (
              <View key={m.key}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.textSecondary }}>{m.label}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{m.value.toFixed(0)} / {m.dv}{m.unit}</Text>
                </View>
                <View style={{ height: 6, backgroundColor: c.separator, borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.min(100, (m.value / m.dv) * 100)}%`, height: '100%', backgroundColor: m.color }} />
                </View>
              </View>
            ))}
          </View>
        )}

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
                  <TouchableOpacity onPress={() => openAddMeal(type)}
                    accessibilityRole="button" accessibilityLabel={`Add ${type}`}>
                    <Text style={{ fontSize: 13, color: c.primary, fontWeight: '700' }}>+ Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {entries.map(entry => (
                <TouchableOpacity
                  key={entry.id}
                  onPress={() => openEditMeal(entry)}
                  activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={`Edit ${entry.description ?? type}`}
                  style={{
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 13, color: c.textPrimary, flex: 1 }} numberOfLines={1}>
                    {entry.description ?? type}
                    {entry.serving_qty != null && entry.serving_qty !== 1
                      ? ` · ${entry.serving_qty} × ${entry.serving_label ?? 'serving'}`
                      : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>{entry.calories} kcal</Text>
                    <TouchableOpacity onPress={() => deleteLog(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button" accessibilityLabel={`Delete ${entry.description ?? type}`}>
                      <Text style={{ fontSize: 14, color: c.textMuted }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
      </View>

      {/* ── Water card ── */}
      <View style={sectionCard(c)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary }}>💧 Water</Text>
              <TouchableOpacity onPress={openWaterGoalEdit} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button" accessibilityLabel="Edit water goal">
                <Text style={{ fontSize: 12 }}>✏️</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 26, fontWeight: '900', color: c.textPrimary }}>
              {waterCups % 1 === 0 ? waterCups : waterCups.toFixed(1)}
              <Text style={{ fontSize: 14, fontWeight: '500', color: c.textMuted }}> / {waterGoalCups} cups</Text>
            </Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: waterPercent >= 1 ? c.sage : c.textMuted }}>
            {waterPercent >= 1 ? '✓ Hydrated!' : `${Math.max(0, Math.ceil(waterGoalCups - waterCups))} cups to go`}
          </Text>
        </View>

        {editingWaterGoal && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 14 }}>
            <TextInput
              style={{
                flex: 1, backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5,
                borderColor: c.separator, paddingHorizontal: 12, paddingVertical: 8,
                fontSize: 14, color: c.textPrimary,
              }}
              placeholder="Goal in cups"
              placeholderTextColor={c.textMuted}
              value={waterGoalInput}
              onChangeText={setWaterGoalInput}
              keyboardType="decimal-pad"
              accessibilityLabel="Water goal in cups"
            />
            <TouchableOpacity
              style={[waterBtn(c), { paddingHorizontal: 16, paddingVertical: 10, opacity: savingWaterGoal ? 0.6 : 1 }]}
              disabled={savingWaterGoal}
              onPress={saveWaterGoal}
              accessibilityRole="button" accessibilityLabel="Save water goal"
            >
              {savingWaterGoal
                ? <ActivityIndicator color={c.blue} size="small" />
                : <Text style={{ fontSize: 14, fontWeight: '700', color: c.blue }}>Save</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingHorizontal: 8, paddingVertical: 10 }} onPress={() => setEditingWaterGoal(false)}
              accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={{ fontSize: 14, color: c.textMuted }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

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
          <TouchableOpacity style={[waterBtn(c), { flex: 1 }]} onPress={() => addWater(8)} disabled={addingWater}
            accessibilityRole="button" accessibilityLabel="Add 1 cup of water, 8 ounces">
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.blue, marginBottom: 2 }}>+ 1 cup</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>8 oz</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[waterBtn(c), { flex: 1 }]} onPress={() => addWater(4)} disabled={addingWater}
            accessibilityRole="button" accessibilityLabel="Add half cup of water, 4 ounces">
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.blue, marginBottom: 2 }}>+ ½ cup</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>4 oz</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[waterBtn(c), { flex: 1 }]} onPress={() => addWater(16)} disabled={addingWater}
            accessibilityRole="button" accessibilityLabel="Add large cup of water, 16 ounces">
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.blue, marginBottom: 2 }}>+ large</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>16 oz</Text>
          </TouchableOpacity>
        </View>

        {/* Custom amount */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: waterLogs.length ? 14 : 0 }}>
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
            accessibilityLabel="Custom water amount in ounces"
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
            accessibilityRole="button" accessibilityLabel="Add custom water amount"
            onPress={() => {
              const oz = parseFloat(customWater);
              if (!isNaN(oz) && oz > 0) { addWater(oz); setCustomWater(''); }
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.blue }}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Today's water log — deletable entries */}
        {waterLogs.length > 0 && (
          <View style={{ gap: 4 }}>
            {waterLogs.map(entry => (
              <View key={entry.id} style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
              }}>
                <Text style={{ fontSize: 12, color: c.textSecondary }}>
                  {entry.water_oz} oz · {formatTime(entry.created_at)}
                </Text>
                <TouchableOpacity onPress={() => deleteLog(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button" accessibilityLabel="Delete water entry">
                  <Text style={{ fontSize: 13, color: c.textMuted }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Trends ── */}
      <TouchableOpacity
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.separator,
          paddingHorizontal: 16, paddingVertical: 13,
        }}
        onPress={() => setShowTrends(v => !v)}
        activeOpacity={0.75}
        accessibilityRole="button" accessibilityLabel={showTrends ? 'Collapse trends' : 'Expand trends'}
      >
        <Text style={{ fontSize: 14, fontWeight: '800', color: c.textPrimary }}>📊 Trends</Text>
        <Text style={{ fontSize: 18, color: c.textMuted, fontWeight: '700' }}>{showTrends ? '⌄' : '›'}</Text>
      </TouchableOpacity>
      {showTrends && (
        <View style={sectionCard(c)}>
          <NutritionTrendsChart userId={userId} expanded={showTrends} />
        </View>
      )}

      {/* ── Add/edit meal modal ── */}
      <Modal visible={showMealModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: c.separator,
          }}>
            <TouchableOpacity onPress={() => { setShowMealModal(false); setEditingLog(null); }} style={{ width: 40 }}
              accessibilityRole="button" accessibilityLabel="Close">
              <Text style={{ fontSize: 18, color: c.textMuted }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>
              {editingLog ? 'Edit Meal' : 'Add Meal'}{!isToday ? ` · ${formatDateLabel(selectedDate)}` : ''}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 12 }}>Meal type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {MEAL_TYPES.map(type => (
                <TouchableOpacity key={type} onPress={() => setMealType(type)}
                  accessibilityRole="button" accessibilityLabel={type}
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

            {!editingLog && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: c.cardBlue, borderRadius: 12, borderWidth: 1.5, borderColor: c.blue,
                  paddingVertical: 12, marginBottom: 24,
                }}
                onPress={() => { setShowMealModal(false); setShowFoodPicker(true); }}
                activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel="Find a food"
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.blue }}>🔍 Find a food</Text>
              </TouchableOpacity>
            )}

            {!editingLog && recentMeals.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Recent</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {recentMeals.map((m, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => applyRecentMeal(m)}
                      accessibilityRole="button" accessibilityLabel={`Use recent meal: ${m.description}`}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                        backgroundColor: c.card, borderWidth: 1.5, borderColor: c.separator,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: c.textSecondary }} numberOfLines={1}>
                        {m.description}{m.calories != null ? ` · ${m.calories} kcal` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>What did you eat?</Text>
            <TextInput style={[inputStyle(c), { marginBottom: 20 }]}
              placeholder="e.g. Oatmeal with berries" placeholderTextColor={c.textMuted}
              value={mealDesc} onChangeText={setMealDesc} accessibilityLabel="What did you eat" />

            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>
              Calories per {mealLabel.trim() || 'serving'}
            </Text>
            <TextInput style={[inputStyle(c), { marginBottom: 16 }]}
              placeholder="e.g. 350" placeholderTextColor={c.textMuted}
              value={mealPerCal} onChangeText={setMealPerCal} keyboardType="numeric" accessibilityLabel="Calories per serving" />

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Quantity</Text>
                <TextInput style={inputStyle(c)} value={mealQty} onChangeText={setMealQty}
                  keyboardType="decimal-pad" accessibilityLabel="Quantity" />
              </View>
              <View style={{ flex: 1.4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Unit</Text>
                <TextInput style={inputStyle(c)} value={mealLabel} onChangeText={setMealLabel}
                  placeholder="serving" placeholderTextColor={c.textMuted} accessibilityLabel="Serving unit" />
              </View>
            </View>

            {mealTotalPreview?.calories != null && (
              <View style={{ backgroundColor: c.cardSage, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1.5, borderColor: c.sage }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary }}>
                  Total: {mealTotalPreview.calories.toLocaleString()} kcal{mealQtyNum !== 1 ? ` (${mealQty} × ${mealLabel.trim() || 'serving'})` : ''}
                </Text>
              </View>
            )}

            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>
              Macros per {mealLabel.trim() || 'serving'} (optional)
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                  value={mealPerProtein} onChangeText={setMealPerProtein} keyboardType="decimal-pad" accessibilityLabel="Protein in grams" />
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>protein g</Text>
              </View>
              <View style={{ flex: 1 }}>
                <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                  value={mealPerCarbs} onChangeText={setMealPerCarbs} keyboardType="decimal-pad" accessibilityLabel="Carbs in grams" />
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>carbs g</Text>
              </View>
              <View style={{ flex: 1 }}>
                <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                  value={mealPerFat} onChangeText={setMealPerFat} keyboardType="decimal-pad" accessibilityLabel="Fat in grams" />
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>fat g</Text>
              </View>
            </View>

            <TouchableOpacity onPress={() => setShowMealMicros(v => !v)} accessibilityRole="button"
              accessibilityLabel={showMealMicros ? 'Hide nutrition details' : 'Add nutrition details'}
              style={{ marginBottom: showMealMicros ? 12 : 24 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>
                {showMealMicros ? '▾ Hide nutrition details' : '▸ Add nutrition details'}
              </Text>
            </TouchableOpacity>
            {showMealMicros && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                    value={mealPerSugar} onChangeText={setMealPerSugar} keyboardType="decimal-pad" accessibilityLabel="Sugar in grams" />
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>sugar g</Text>
                </View>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                    value={mealPerFiber} onChangeText={setMealPerFiber} keyboardType="decimal-pad" accessibilityLabel="Fiber in grams" />
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>fiber g</Text>
                </View>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                    value={mealPerSodium} onChangeText={setMealPerSodium} keyboardType="decimal-pad" accessibilityLabel="Sodium in milligrams" />
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>sodium mg</Text>
                </View>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                    value={mealPerCholesterol} onChangeText={setMealPerCholesterol} keyboardType="decimal-pad" accessibilityLabel="Cholesterol in milligrams" />
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>cholest. mg</Text>
                </View>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                    value={mealPerFolate} onChangeText={setMealPerFolate} keyboardType="decimal-pad" accessibilityLabel="Folate in micrograms" />
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>folate mcg</Text>
                </View>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                    value={mealPerIron} onChangeText={setMealPerIron} keyboardType="decimal-pad" accessibilityLabel="Iron in milligrams" />
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>iron mg</Text>
                </View>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                    value={mealPerCaffeine} onChangeText={setMealPerCaffeine} keyboardType="decimal-pad" accessibilityLabel="Caffeine in milligrams" />
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>caffeine mg</Text>
                </View>
              </View>
            )}

            {mealDataSource !== 'saved_food' && (
              <TouchableOpacity
                onPress={() => setSaveMealToMyFoods(v => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 }}
                accessibilityRole="checkbox" accessibilityState={{ checked: saveMealToMyFoods }}
                accessibilityLabel="Save to My Foods"
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: c.primary,
                  backgroundColor: saveMealToMyFoods ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center',
                }}>
                  {saveMealToMyFoods && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text>}
                </View>
                <Text style={{ fontSize: 13, color: c.textSecondary, fontWeight: '600' }}>Save to My Foods for next time</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[primaryBtn(c), { opacity: mealPerCal.trim() && mealQtyNum > 0 ? 1 : 0.45 }]}
              disabled={addingMeal || !mealPerCal.trim() || !mealQtyNum}
              onPress={saveMeal}
              accessibilityRole="button" accessibilityLabel={editingLog ? 'Save changes' : 'Save meal'}
            >
              {addingMeal
                ? <ActivityIndicator color="#fff" />
                : <Text style={primaryBtnText}>{editingLog ? 'Save Changes' : 'Save Meal'}</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <FoodPickerModal
        visible={showFoodPicker}
        onClose={() => { setShowFoodPicker(false); setShowMealModal(true); }}
        userId={userId}
        recentMeals={recentMeals}
        isPregnant={isPregnant}
        onApply={handleFoodPickerApply}
      />

      </>)}

      {renderSetup()}
    </View>
  );
}
