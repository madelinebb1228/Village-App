import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, ActivityIndicator, Image, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete, safeUpsert } from '../lib/syncService';
import { useColors, Colors } from '../lib/theme';
import { lookupBarcode, ProductInfo } from '../lib/barcodeProductLookup';

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
}

interface NutritionLog {
  id: string;
  meal_type: string;
  description: string | null;
  calories: number | null;
  water_oz: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  created_at: string;
}

interface RecentMeal {
  description: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
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
  const [recentMeals, setRecentMeals] = useState<RecentMeal[]>([]);

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
  const [goalChoice, setGoalChoice] = useState('');
  const [saving, setSaving]       = useState(false);

  // Quick water-goal edit
  const [editingWaterGoal, setEditingWaterGoal] = useState(false);
  const [waterGoalInput, setWaterGoalInput]     = useState('');
  const [savingWaterGoal, setSavingWaterGoal]   = useState(false);

  // Add/edit meal modal
  const [showMealModal, setShowMealModal] = useState(false);
  const [editingLog, setEditingLog]       = useState<NutritionLog | null>(null);
  const [mealType, setMealType]           = useState<MealType>('breakfast');
  const [mealDesc, setMealDesc]           = useState('');
  const [mealCal, setMealCal]             = useState('');
  const [mealProtein, setMealProtein]     = useState('');
  const [mealCarbs, setMealCarbs]         = useState('');
  const [mealFat, setMealFat]             = useState('');
  const [addingMeal, setAddingMeal]       = useState(false);

  const [addingWater, setAddingWater]   = useState(false);
  const [customWater, setCustomWater]   = useState('');

  // Barcode scanner
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showScanner, setShowScanner]       = useState(false);
  const [scannerLocked, setScannerLocked]   = useState(false);
  const [lookingUp, setLookingUp]           = useState(false);
  const [scannedProduct, setScannedProduct] = useState<ProductInfo | null>(null);
  const [scanQuantity, setScanQuantity]     = useState('1');

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
      .select('description, calories, protein_g, carbs_g, fat_g')
      .eq('user_id', userId)
      .neq('meal_type', 'water')
      .not('description', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30);
    const seen = new Set<string>();
    const deduped: RecentMeal[] = [];
    for (const row of (data ?? []) as RecentMeal[]) {
      const key = (row.description ?? '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
      if (deduped.length >= 6) break;
    }
    setRecentMeals(deduped);
  }, [userId]);

  useEffect(() => { loadRecentMeals(); }, [loadRecentMeals]);

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

  const totalWaterOz = useMemo(
    () => waterLogs.reduce((sum, l) => sum + (l.water_oz ?? 0), 0), [waterLogs]);

  const mealGroups = useMemo(() => {
    const g: Record<string, NutritionLog[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    mealLogs.forEach(l => { if (l.meal_type in g) g[l.meal_type].push(l); });
    return g;
  }, [mealLogs]);

  const caloriePercent = profile ? Math.min(1, totalCalories / profile.calorie_goal) : 0;
  const waterCups      = totalWaterOz / 8;
  const waterGoalCups  = (profile?.water_goal_oz ?? 80) / 8;
  const waterPercent   = profile ? Math.min(1, totalWaterOz / profile.water_goal_oz) : 0;

  // Scanned product: prefer per-serving values, fall back to per-100g (quantity = grams eaten)
  const scanMode: 'serving' | 'grams' | null = !scannedProduct ? null
    : scannedProduct.caloriesPerServing != null ? 'serving'
    : scannedProduct.caloriesPer100g != null ? 'grams'
    : null;

  const scanComputed = useMemo(() => {
    if (!scannedProduct || !scanMode) return null;
    const qty = parseFloat(scanQuantity);
    if (!qty || qty <= 0) return null;
    const scale = scanMode === 'serving' ? qty : qty / 100;
    const cal   = scanMode === 'serving' ? scannedProduct.caloriesPerServing : scannedProduct.caloriesPer100g;
    const prot  = scanMode === 'serving' ? scannedProduct.proteinPerServingG : scannedProduct.proteinPer100g;
    const carb  = scanMode === 'serving' ? scannedProduct.carbsPerServingG   : scannedProduct.carbsPer100g;
    const fat   = scanMode === 'serving' ? scannedProduct.fatPerServingG     : scannedProduct.fatPer100g;
    return {
      calories: cal  != null ? Math.round(cal * scale) : null,
      protein:  prot != null ? Math.round(prot * scale * 10) / 10 : null,
      carbs:    carb != null ? Math.round(carb * scale * 10) / 10 : null,
      fat:      fat  != null ? Math.round(fat * scale * 10) / 10 : null,
    };
  }, [scannedProduct, scanMode, scanQuantity]);

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
    } else {
      setHeightFt(''); setHeightIn(''); setHeightCm(''); setWeight(''); setAge('');
      setActivity(''); setBfType(''); setGoalChoice('');
    }
    setHeightUnit('ft');
    setSetupStep(0);
    setShowSetup(true);
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
    setSaving(true);
    try {
      const { calorie_goal, water_goal_oz, protein_goal_g } = calcGoals(hCm, wt, ag, activity, bfType, goalChoice);
      await safeUpsert('nutrition_profiles', {
        user_id: userId, height_cm: hCm, weight_lbs: wt, age_years: ag,
        activity_level: activity, bf_type: bfType, weight_goal: goalChoice,
        calorie_goal, water_goal_oz, protein_goal_g, updated_at: new Date().toISOString(),
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

  function openAddMeal(type: MealType) {
    setEditingLog(null);
    setMealType(type);
    setMealDesc(''); setMealCal(''); setMealProtein(''); setMealCarbs(''); setMealFat('');
    setShowMealModal(true);
  }

  // ─── Barcode scanner ──────────────────────────────────────────────────────

  async function openScanner(type: MealType) {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Camera access needed', 'Please allow camera access in your device settings to scan barcodes.');
        return;
      }
    }
    setMealType(type);
    setEditingLog(null);
    setScannerLocked(false);
    setScannedProduct(null);
    setScanQuantity('1');
    setShowScanner(true);
  }

  async function handleBarcode(barcode: string) {
    if (scannerLocked) return;
    setScannerLocked(true);
    setLookingUp(true);
    const product = await lookupBarcode(barcode);
    setLookingUp(false);
    setScannedProduct(product);
    setScanQuantity(product.caloriesPerServing != null ? '1' : '100');
  }

  function applyScannedProduct() {
    if (!scannedProduct || !scanComputed) return;
    const name = [scannedProduct.brand, scannedProduct.productName].filter(Boolean).join(' – ') || 'Scanned item';
    setMealDesc(name);
    if (scanComputed.calories != null) setMealCal(String(scanComputed.calories));
    if (scanComputed.protein != null) setMealProtein(String(scanComputed.protein));
    if (scanComputed.carbs != null) setMealCarbs(String(scanComputed.carbs));
    if (scanComputed.fat != null) setMealFat(String(scanComputed.fat));
    setShowScanner(false);
    setScannedProduct(null);
    setScannerLocked(false);
    setShowMealModal(true);
  }

  function openEditMeal(log: NutritionLog) {
    setEditingLog(log);
    setMealType((log.meal_type as MealType) ?? 'breakfast');
    setMealDesc(log.description ?? '');
    setMealCal(log.calories != null ? String(log.calories) : '');
    setMealProtein(log.protein_g != null ? String(log.protein_g) : '');
    setMealCarbs(log.carbs_g != null ? String(log.carbs_g) : '');
    setMealFat(log.fat_g != null ? String(log.fat_g) : '');
    setShowMealModal(true);
  }

  function applyRecentMeal(m: RecentMeal) {
    setMealDesc(m.description);
    if (m.calories != null) setMealCal(String(m.calories));
    if (m.protein_g != null) setMealProtein(String(m.protein_g));
    if (m.carbs_g != null) setMealCarbs(String(m.carbs_g));
    if (m.fat_g != null) setMealFat(String(m.fat_g));
  }

  async function saveMeal() {
    if (!userId || !mealCal.trim()) return;
    const cal = parseInt(mealCal);
    if (isNaN(cal) || cal <= 0) { Alert.alert('Enter a valid calorie amount'); return; }
    setAddingMeal(true);
    try {
      const fields = {
        meal_type: mealType,
        description: mealDesc.trim() || null,
        calories: cal,
        protein_g: mealProtein.trim() ? parseFloat(mealProtein) : null,
        carbs_g:   mealCarbs.trim()   ? parseFloat(mealCarbs)   : null,
        fat_g:     mealFat.trim()     ? parseFloat(mealFat)     : null,
      };
      if (editingLog) {
        await safeUpdate('nutrition_logs', editingLog.id, fields);
      } else {
        await safeInsert('nutrition_logs', {
          user_id: userId, log_date: dateToISO(selectedDate), ...fields,
        });
      }
      setMealDesc(''); setMealCal(''); setMealProtein(''); setMealCarbs(''); setMealFat('');
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
                <Text style={{ fontSize: 14, color: c.textMuted, marginBottom: 20, lineHeight: 20 }}>
                  We use this to calculate your personalized calorie and hydration goals.
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary }}>Height</Text>
                  <TouchableOpacity onPress={toggleHeightUnit}>
                    <Text style={{ fontSize: 12, color: c.primary, fontWeight: '700' }}>
                      Switch to {heightUnit === 'ft' ? 'cm' : 'ft/in'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {heightUnit === 'ft' ? (
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
                ) : (
                  <View style={{ marginBottom: 20 }}>
                    <TextInput style={inputStyle(c)} placeholder="e.g. 163" placeholderTextColor={c.textMuted}
                      value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" maxLength={3} />
                    <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>cm</Text>
                  </View>
                )}

                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Current Weight (lbs)</Text>
                <TextInput style={[inputStyle(c), { marginBottom: 20 }]} placeholder="e.g. 145"
                  placeholderTextColor={c.textMuted} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Age</Text>
                <TextInput style={[inputStyle(c), { marginBottom: 32 }]} placeholder="e.g. 28"
                  placeholderTextColor={c.textMuted} value={age} onChangeText={setAge} keyboardType="numeric" maxLength={3} />
                <TouchableOpacity
                  style={[primaryBtn(c), { opacity: (currentHeightCm() && weight && age) ? 1 : 0.45 }]}
                  disabled={!currentHeightCm() || !weight || !age}
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
                {goalChoice && currentHeightCm() > 0 && weight && age && activity && bfType && (() => {
                  const { calorie_goal, water_goal_oz, protein_goal_g } = calcGoals(
                    currentHeightCm(), parseFloat(weight), parseInt(age), activity, bfType, goalChoice,
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
                      <Text style={{ fontSize: 14, color: c.textPrimary, marginBottom: 4 }}>
                        💧  {water_goal_oz / 8} cups of water / day
                      </Text>
                      <Text style={{ fontSize: 14, color: c.textPrimary }}>
                        🥩  {protein_goal_g}g protein / day{bfType !== 'none' ? ' (includes breastfeeding bump)' : ''}
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
      <View style={{ backgroundColor: c.cardBlush, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: c.blush, marginBottom: 16 }}>
        <Text style={{ fontSize: 36, marginBottom: 8 }}>💧</Text>
        <Text style={{ fontSize: 17, fontWeight: '800', color: c.textPrimary, marginBottom: 6, textAlign: 'center' }}>
          Nutrition & Hydration
        </Text>
        <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
          Track daily calories and water with goals personalized for breastfeeding parents.
        </Text>
        <TouchableOpacity style={primaryBtn(c)} onPress={openSetup}>
          <Text style={[primaryBtnText, { paddingHorizontal: 24 }]}>Set Up My Goals</Text>
        </TouchableOpacity>
        {renderSetup()}
      </View>
    );
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  const hasMacros = totalProtein > 0 || totalCarbs > 0 || totalFat > 0;

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
      {/* ── Date nav ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TouchableOpacity onPress={goPrevDay} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 20, color: c.textSecondary }}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goToday} disabled={isToday}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>{formatDateLabel(selectedDate)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goNextDay} disabled={isToday} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 20, color: isToday ? c.separator : c.textSecondary }}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Calorie card ── */}
      <View style={sectionCard(c)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 2 }}>🍽️ Calories</Text>
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
        <View style={{ height: 8, backgroundColor: c.separator, borderRadius: 4, overflow: 'hidden', marginBottom: hasMacros ? 10 : 16 }}>
          <View style={{ width: `${caloriePercent * 100}%`, height: '100%', backgroundColor: c.primary, borderRadius: 4 }} />
        </View>

        {profile.protein_goal_g ? (
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.textSecondary }}>
                🥩 Protein{profile.bf_type !== 'none' ? ' (breastfeeding goal)' : ''}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: totalProtein >= profile.protein_goal_g ? c.sage : c.textMuted }}>
                {totalProtein.toFixed(0)} / {profile.protein_goal_g}g
              </Text>
            </View>
            <View style={{ height: 6, backgroundColor: c.separator, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{
                width: `${Math.min(100, (totalProtein / profile.protein_goal_g) * 100)}%`,
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
                  <TouchableOpacity onPress={() => openScanner(type)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={{ fontSize: 14 }}>📷</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openAddMeal(type)}>
                    <Text style={{ fontSize: 13, color: c.primary, fontWeight: '700' }}>+ Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {entries.map(entry => (
                <TouchableOpacity
                  key={entry.id}
                  onPress={() => openEditMeal(entry)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 13, color: c.textPrimary, flex: 1 }} numberOfLines={1}>
                    {entry.description ?? type}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>{entry.calories} kcal</Text>
                    <TouchableOpacity onPress={() => deleteLog(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
              <TouchableOpacity onPress={openWaterGoalEdit} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
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
            />
            <TouchableOpacity
              style={[waterBtn(c), { paddingHorizontal: 16, paddingVertical: 10, opacity: savingWaterGoal ? 0.6 : 1 }]}
              disabled={savingWaterGoal}
              onPress={saveWaterGoal}
            >
              {savingWaterGoal
                ? <ActivityIndicator color={c.blue} size="small" />
                : <Text style={{ fontSize: 14, fontWeight: '700', color: c.blue }}>Save</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingHorizontal: 8, paddingVertical: 10 }} onPress={() => setEditingWaterGoal(false)}>
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
                <TouchableOpacity onPress={() => deleteLog(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 13, color: c.textMuted }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Add/edit meal modal ── */}
      <Modal visible={showMealModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: c.separator,
          }}>
            <TouchableOpacity onPress={() => { setShowMealModal(false); setEditingLog(null); }} style={{ width: 40 }}>
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
                onPress={() => { setShowMealModal(false); openScanner(mealType); }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.blue }}>📷 Scan a barcode</Text>
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
              value={mealDesc} onChangeText={setMealDesc} />

            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Calories (kcal)</Text>
            <TextInput style={[inputStyle(c), { marginBottom: 20 }]}
              placeholder="e.g. 350" placeholderTextColor={c.textMuted}
              value={mealCal} onChangeText={setMealCal} keyboardType="numeric" />

            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Macros (optional)</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 32 }}>
              <View style={{ flex: 1 }}>
                <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                  value={mealProtein} onChangeText={setMealProtein} keyboardType="decimal-pad" />
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>protein g</Text>
              </View>
              <View style={{ flex: 1 }}>
                <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                  value={mealCarbs} onChangeText={setMealCarbs} keyboardType="decimal-pad" />
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>carbs g</Text>
              </View>
              <View style={{ flex: 1 }}>
                <TextInput style={inputStyle(c)} placeholder="0" placeholderTextColor={c.textMuted}
                  value={mealFat} onChangeText={setMealFat} keyboardType="decimal-pad" />
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>fat g</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[primaryBtn(c), { opacity: mealCal.trim() ? 1 : 0.45 }]}
              disabled={addingMeal || !mealCal.trim()}
              onPress={saveMeal}
            >
              {addingMeal
                ? <ActivityIndicator color="#fff" />
                : <Text style={primaryBtnText}>{editingLog ? 'Save Changes' : 'Save Meal'}</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Barcode scanner modal ── */}
      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => { setShowScanner(false); setScannerLocked(false); setScannedProduct(null); }}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {!scannedProduct && !lookingUp && (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={({ data }) => handleBarcode(data)}
              barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8'] }}
            />
          )}

          <View style={{ ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', padding: 20 }}>
            <TouchableOpacity
              style={{
                alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.6)',
                borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
              }}
              onPress={() => { setShowScanner(false); setScannerLocked(false); setScannedProduct(null); }}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>✕ Close</Text>
            </TouchableOpacity>

            {lookingUp ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Looking up product…</Text>
              </View>
            ) : !scannedProduct ? (
              <View style={{ alignItems: 'center', gap: 20, flex: 1, justifyContent: 'center' }}>
                <View style={{
                  width: 260, height: 160, borderRadius: 16,
                  borderWidth: 3, borderColor: c.blue, backgroundColor: 'transparent',
                }} />
                <Text style={{
                  color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center',
                  backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
                }}>
                  Point at a barcode to scan
                </Text>
              </View>
            ) : (
              <View style={{ backgroundColor: 'rgba(17,24,39,0.92)', borderRadius: 20, padding: 16, gap: 14 }}>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                  {scannedProduct.imageUrl ? (
                    <Image source={{ uri: scannedProduct.imageUrl }} style={{ width: 70, height: 70, borderRadius: 12 }} resizeMode="contain" />
                  ) : (
                    <View style={{
                      width: 70, height: 70, borderRadius: 12, backgroundColor: '#374151',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 32 }}>🍽️</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    {scannedProduct.found ? (
                      <>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#9CA3AF', marginBottom: 2 }}>
                          {scannedProduct.brand ?? 'Unknown brand'}
                        </Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 6 }}>
                          {scannedProduct.productName ?? 'Unknown product'}
                        </Text>
                        {scanMode ? (
                          <Text style={{ fontSize: 12, color: '#D1D5DB' }}>
                            {scanMode === 'serving'
                              ? `Per serving${scannedProduct.servingSize ? ` (${scannedProduct.servingSize})` : ''}: ${scannedProduct.caloriesPerServing ?? '?'} kcal`
                              : `Per 100g: ${scannedProduct.caloriesPer100g ?? '?'} kcal`}
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 12, color: '#FCA5A5' }}>No nutrition data found for this product.</Text>
                        )}
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#9CA3AF', marginBottom: 2 }}>Product not found</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                          This barcode wasn't in the database. Try adding it manually instead.
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                {scanMode && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ color: '#D1D5DB', fontSize: 13, fontWeight: '600' }}>
                      {scanMode === 'serving' ? 'Servings eaten' : 'Grams eaten'}
                    </Text>
                    <TextInput
                      style={{
                        flex: 1, backgroundColor: '#1F2937', borderRadius: 10,
                        paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#fff',
                      }}
                      value={scanQuantity}
                      onChangeText={setScanQuantity}
                      keyboardType="decimal-pad"
                      placeholder={scanMode === 'serving' ? '1' : '100'}
                      placeholderTextColor="#6B7280"
                    />
                  </View>
                )}

                {scanComputed && (
                  <Text style={{ color: '#D1D5DB', fontSize: 13 }}>
                    ≈ {scanComputed.calories ?? '?'} kcal
                    {scanComputed.protein != null ? ` · P ${scanComputed.protein}g` : ''}
                    {scanComputed.carbs != null ? ` · C ${scanComputed.carbs}g` : ''}
                    {scanComputed.fat != null ? ` · F ${scanComputed.fat}g` : ''}
                  </Text>
                )}

                <View style={{ gap: 8 }}>
                  {scanMode && scanComputed && (
                    <TouchableOpacity
                      style={{ backgroundColor: c.blue, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                      onPress={applyScannedProduct}
                      activeOpacity={0.85}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Use this product →</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={{ alignItems: 'center', paddingVertical: 8 }}
                    onPress={() => { setScannerLocked(false); setScannedProduct(null); }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: '#9CA3AF', fontWeight: '600', fontSize: 14 }}>
                      {scanMode ? 'Scan again' : 'Scan again / enter manually'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      </>)}

      {renderSetup()}
    </View>
  );
}
