import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, ActivityIndicator, Image, StyleSheet, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { safeInsert, safeDelete } from '../lib/syncService';
import { useColors, Colors } from '../lib/theme';
import { lookupBarcode, ProductInfo } from '../lib/barcodeProductLookup';
import { searchFoods } from '../lib/foodSearch';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PerUnitNutrition {
  calories: number | null;
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
}

export interface RecentMealOption {
  description: string;
  calories: number | null;
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
}

interface SavedFood {
  id: string;
  name: string;
  brand: string | null;
  serving_label: string | null;
  calories: number | null;
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
  source: string;
  barcode: string | null;
}

type PickSource = 'search' | 'barcode' | 'saved_food' | 'recent' | 'manual';

interface PickedItem {
  desc: string;
  brand: string | null;
  perUnit: PerUnitNutrition;
  defaultQty: string;
  defaultLabel: string;
  source: PickSource;
  barcode: string | null;
  offerSaveToMyFoods: boolean;
  saveByDefault: boolean;
  pregnancyRisk: { risky: boolean; reasons: string[] } | null;
}

type Step = 'browse' | 'scanner' | 'create' | 'quantity';
type Tab = 'search' | 'myFoods' | 'recent';

interface FoodPickerModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string | null;
  recentMeals: RecentMealOption[];
  isPregnant?: boolean;
  onApply: (
    perUnit: PerUnitNutrition,
    qty: number,
    label: string,
    desc: string,
    opts: { source: string; barcode: string | null },
  ) => void;
}

const EMPTY_PER_UNIT: PerUnitNutrition = {
  calories: null, protein_g: null, carbs_g: null, fat_g: null,
  sugar_g: null, fiber_g: null, sodium_mg: null, cholesterol_mg: null,
  folate_mcg: null, iron_mg: null, caffeine_mg: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? null : n;
}

function scaled(v: number | null, factor: number): number | null {
  if (v == null) return null;
  // Round away floating-point noise (e.g. 88.9/100 -> 0.8890000000000001)
  // while keeping far more precision than any per-unit nutrition value needs.
  return Math.round(v * factor * 1e6) / 1e6;
}

function round1(v: number | null): number | null {
  return v == null ? null : Math.round(v * 10) / 10;
}

// Convert an Open Food Facts product into a per-unit pick. Returns null if the
// product has no usable nutrition data (nothing to log).
function productToPickedItem(p: ProductInfo, source: 'search' | 'barcode'): PickedItem | null {
  const desc = [p.brand, p.productName].filter(Boolean).join(' – ') || p.productName || 'Food item';
  if (p.caloriesPerServing != null) {
    return {
      desc, brand: p.brand,
      perUnit: {
        calories: p.caloriesPerServing, protein_g: p.proteinPerServingG, carbs_g: p.carbsPerServingG,
        fat_g: p.fatPerServingG, sugar_g: p.sugarPerServingG, fiber_g: p.fiberPerServingG,
        sodium_mg: p.sodiumPerServingMg, cholesterol_mg: p.cholesterolPerServingMg,
        folate_mcg: p.folatePerServingMcg, iron_mg: p.ironPerServingMg, caffeine_mg: p.caffeinePerServingMg,
      },
      defaultQty: '1',
      defaultLabel: p.servingSize || 'serving',
      source, barcode: p.code, offerSaveToMyFoods: true, saveByDefault: false,
      pregnancyRisk: p.pregnancyRisk,
    };
  }
  if (p.caloriesPer100g != null) {
    // No per-serving data — treat "1 unit" as 1 gram so qty = grams eaten.
    return {
      desc, brand: p.brand,
      perUnit: {
        calories: scaled(p.caloriesPer100g, 1 / 100), protein_g: scaled(p.proteinPer100g, 1 / 100),
        carbs_g: scaled(p.carbsPer100g, 1 / 100), fat_g: scaled(p.fatPer100g, 1 / 100),
        sugar_g: scaled(p.sugarPer100g, 1 / 100), fiber_g: scaled(p.fiberPer100g, 1 / 100),
        sodium_mg: scaled(p.sodiumPer100gMg, 1 / 100), cholesterol_mg: scaled(p.cholesterolPer100gMg, 1 / 100),
        folate_mcg: scaled(p.folatePer100gMcg, 1 / 100), iron_mg: scaled(p.ironPer100gMg, 1 / 100),
        caffeine_mg: scaled(p.caffeinePer100gMg, 1 / 100),
      },
      defaultQty: '100',
      defaultLabel: 'g',
      source, barcode: p.code, offerSaveToMyFoods: true, saveByDefault: false,
      pregnancyRisk: p.pregnancyRisk,
    };
  }
  return null;
}

function savedFoodToPickedItem(f: SavedFood): PickedItem {
  return {
    desc: f.name, brand: f.brand,
    perUnit: {
      calories: f.calories, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g,
      sugar_g: f.sugar_g, fiber_g: f.fiber_g, sodium_mg: f.sodium_mg, cholesterol_mg: f.cholesterol_mg,
      folate_mcg: f.folate_mcg, iron_mg: f.iron_mg, caffeine_mg: f.caffeine_mg,
    },
    defaultQty: '1',
    defaultLabel: f.serving_label || 'serving',
    source: 'saved_food', barcode: f.barcode, offerSaveToMyFoods: false, saveByDefault: false,
    pregnancyRisk: null,
  };
}

function recentToPickedItem(m: RecentMealOption): PickedItem {
  const qty = m.serving_qty || 1;
  return {
    desc: m.description, brand: null,
    perUnit: {
      calories: scaled(m.calories, 1 / qty), protein_g: scaled(m.protein_g, 1 / qty),
      carbs_g: scaled(m.carbs_g, 1 / qty), fat_g: scaled(m.fat_g, 1 / qty),
      sugar_g: scaled(m.sugar_g, 1 / qty), fiber_g: scaled(m.fiber_g, 1 / qty),
      sodium_mg: scaled(m.sodium_mg, 1 / qty), cholesterol_mg: scaled(m.cholesterol_mg, 1 / qty),
      folate_mcg: scaled(m.folate_mcg, 1 / qty), iron_mg: scaled(m.iron_mg, 1 / qty),
      caffeine_mg: scaled(m.caffeine_mg, 1 / qty),
    },
    defaultQty: String(qty),
    defaultLabel: m.serving_label || 'serving',
    source: 'recent', barcode: null, offerSaveToMyFoods: true, saveByDefault: false,
    pregnancyRisk: null,
  };
}

// ─── Style helpers (matches screens/NutritionTracker.tsx conventions) ────────

function inputStyle(c: Colors) {
  return {
    backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator,
    padding: 14, fontSize: 15, color: c.textPrimary,
  };
}
function primaryBtn(c: Colors) {
  return { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' as const };
}
const primaryBtnText = { fontSize: 15, fontWeight: '700' as const, color: '#fff' };
function rowCard(c: Colors) {
  return {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12,
    backgroundColor: c.card, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: c.separator,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FoodPickerModal({ visible, onClose, userId, recentMeals, isPregnant = false, onApply }: FoodPickerModalProps) {
  const c = useColors();

  const [step, setStep] = useState<Step>('browse');
  const [tab, setTab] = useState<Tab>('search');

  // Search tab
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // My Foods tab
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([]);
  const [savedFoodsLoaded, setSavedFoodsLoaded] = useState(false);
  const [myFoodsFilter, setMyFoodsFilter] = useState('');

  // Scanner
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerLocked, setScannerLocked] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [scanProduct, setScanProduct] = useState<ProductInfo | null>(null);

  // Create custom food form
  const [cfName, setCfName] = useState('');
  const [cfBrand, setCfBrand] = useState('');
  const [cfLabel, setCfLabel] = useState('serving');
  const [cfCal, setCfCal] = useState('');
  const [cfProtein, setCfProtein] = useState('');
  const [cfCarbs, setCfCarbs] = useState('');
  const [cfFat, setCfFat] = useState('');
  const [cfSugar, setCfSugar] = useState('');
  const [cfFiber, setCfFiber] = useState('');
  const [cfSodium, setCfSodium] = useState('');
  const [cfCholesterol, setCfCholesterol] = useState('');
  const [cfFolate, setCfFolate] = useState('');
  const [cfIron, setCfIron] = useState('');
  const [cfCaffeine, setCfCaffeine] = useState('');

  // Quantity/preview step
  const [picked, setPicked] = useState<PickedItem | null>(null);
  const [qtyInput, setQtyInput] = useState('1');
  const [labelInput, setLabelInput] = useState('serving');
  const [saveToMyFoods, setSaveToMyFoods] = useState(false);
  const [showMicros, setShowMicros] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setStep('browse'); setTab('search');
      setQuery(''); setResults([]); setSearching(false);
      setMyFoodsFilter('');
      setScannerLocked(false); setScanProduct(null); setLookingUp(false);
      setPicked(null);
      resetCustomFoodForm();
    }
  }, [visible]);

  function resetCustomFoodForm() {
    setCfName(''); setCfBrand(''); setCfLabel('serving');
    setCfCal(''); setCfProtein(''); setCfCarbs(''); setCfFat('');
    setCfSugar(''); setCfFiber(''); setCfSodium(''); setCfCholesterol('');
    setCfFolate(''); setCfIron(''); setCfCaffeine('');
  }

  // ─── Search ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchFoods(query);
      setResults(r);
      setSearching(false);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ─── My Foods ───────────────────────────────────────────────────────────
  async function loadSavedFoods() {
    if (!userId) return;
    const { data } = await supabase
      .from('nutrition_saved_foods').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    setSavedFoods((data ?? []) as SavedFood[]);
    setSavedFoodsLoaded(true);
  }
  useEffect(() => {
    if (visible && tab === 'myFoods' && !savedFoodsLoaded) loadSavedFoods();
  }, [visible, tab, savedFoodsLoaded]);

  async function deleteSavedFood(id: string) {
    setSavedFoods(prev => prev.filter(f => f.id !== id));
    try { await safeDelete('nutrition_saved_foods', id); } catch { /* best-effort */ }
  }

  const filteredSavedFoods = useMemo(() => {
    const needle = myFoodsFilter.trim().toLowerCase();
    if (!needle) return savedFoods;
    return savedFoods.filter(f =>
      f.name.toLowerCase().includes(needle) || (f.brand ?? '').toLowerCase().includes(needle));
  }, [savedFoods, myFoodsFilter]);

  // ─── Scanner ────────────────────────────────────────────────────────────
  async function openScannerMode() {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Camera access needed', 'Please allow camera access in your device settings to scan barcodes.');
        return;
      }
    }
    setScannerLocked(false);
    setScanProduct(null);
    setStep('scanner');
  }

  async function handleBarcodeScanned(barcode: string) {
    if (scannerLocked) return;
    setScannerLocked(true);
    setLookingUp(true);
    const product = await lookupBarcode(barcode);
    setLookingUp(false);
    setScanProduct(product);
  }

  function useScannedProduct() {
    if (!scanProduct) return;
    const item = productToPickedItem(scanProduct, 'barcode');
    if (!item) {
      Alert.alert('No nutrition data', "This product doesn't have nutrition info on file. Try search or enter it manually.");
      return;
    }
    openQuantityStep(item);
  }

  // ─── Create custom food ───────────────────────────────────────────────
  function openCustomFoodQuantity() {
    const cal = parseFloat(cfCal);
    if (!cfName.trim() || isNaN(cal) || cal <= 0) {
      Alert.alert('Missing info', 'Enter a name and calories per serving.');
      return;
    }
    const item: PickedItem = {
      desc: cfName.trim(), brand: cfBrand.trim() || null,
      perUnit: {
        calories: cal, protein_g: num(cfProtein), carbs_g: num(cfCarbs), fat_g: num(cfFat),
        sugar_g: num(cfSugar), fiber_g: num(cfFiber), sodium_mg: num(cfSodium), cholesterol_mg: num(cfCholesterol),
        folate_mcg: num(cfFolate), iron_mg: num(cfIron), caffeine_mg: num(cfCaffeine),
      },
      defaultQty: '1',
      defaultLabel: cfLabel.trim() || 'serving',
      source: 'manual', barcode: null, offerSaveToMyFoods: true, saveByDefault: true,
      pregnancyRisk: null,
    };
    openQuantityStep(item);
  }

  // ─── Quantity/preview step ────────────────────────────────────────────
  function openQuantityStep(item: PickedItem) {
    setPicked(item);
    setQtyInput(item.defaultQty);
    setLabelInput(item.defaultLabel);
    setSaveToMyFoods(item.saveByDefault);
    setShowMicros(false);
    setStep('quantity');
  }

  const qtyNum = useMemo(() => {
    const n = parseFloat(qtyInput);
    return !isNaN(n) && n > 0 ? n : 0;
  }, [qtyInput]);

  const totalPreview = useMemo(() => {
    if (!picked || !qtyNum) return null;
    const p = picked.perUnit;
    return {
      calories: p.calories != null ? Math.round(p.calories * qtyNum) : null,
      protein_g: round1(scaled(p.protein_g, qtyNum)),
      carbs_g: round1(scaled(p.carbs_g, qtyNum)),
      fat_g: round1(scaled(p.fat_g, qtyNum)),
      sugar_g: round1(scaled(p.sugar_g, qtyNum)),
      fiber_g: round1(scaled(p.fiber_g, qtyNum)),
      sodium_mg: round1(scaled(p.sodium_mg, qtyNum)),
      cholesterol_mg: round1(scaled(p.cholesterol_mg, qtyNum)),
      folate_mcg: round1(scaled(p.folate_mcg, qtyNum)),
      iron_mg: round1(scaled(p.iron_mg, qtyNum)),
      caffeine_mg: round1(scaled(p.caffeine_mg, qtyNum)),
    };
  }, [picked, qtyNum]);

  async function handleAdd() {
    if (!picked || !qtyNum || saving) return;
    setSaving(true);
    try {
      const label = labelInput.trim() || picked.defaultLabel;
      onApply(picked.perUnit, qtyNum, label, picked.desc, { source: picked.source, barcode: picked.barcode });
      if (saveToMyFoods && userId) {
        safeInsert('nutrition_saved_foods', {
          user_id: userId, name: picked.desc, brand: picked.brand, serving_label: label,
          calories: picked.perUnit.calories, protein_g: picked.perUnit.protein_g, carbs_g: picked.perUnit.carbs_g,
          fat_g: picked.perUnit.fat_g, sugar_g: picked.perUnit.sugar_g, fiber_g: picked.perUnit.fiber_g,
          sodium_mg: picked.perUnit.sodium_mg, cholesterol_mg: picked.perUnit.cholesterol_mg,
          folate_mcg: picked.perUnit.folate_mcg, iron_mg: picked.perUnit.iron_mg, caffeine_mg: picked.perUnit.caffeine_mg,
          source: picked.source === 'barcode' ? 'barcode' : picked.source === 'manual' ? 'manual' : 'search',
          barcode: picked.barcode,
        }).catch(() => {});
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // ─── Header ───────────────────────────────────────────────────────────
  function goBack() {
    if (step === 'browse') { onClose(); return; }
    setPicked(null);
    setScanProduct(null);
    setStep('browse');
  }

  const titleForStep: Record<Step, string> = {
    browse: 'Find a Food', scanner: 'Scan Barcode', create: 'Create Custom Food', quantity: picked?.desc ?? 'Add',
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={goBack}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.separator,
        }}>
          <TouchableOpacity onPress={goBack} style={{ width: 56 }}
            accessibilityRole="button" accessibilityLabel={step === 'browse' ? 'Close' : 'Back'}>
            <Text style={{ fontSize: 18, color: c.textMuted }}>{step === 'browse' ? '✕' : '‹ Back'}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.textPrimary }} numberOfLines={1}>
            {titleForStep[step]}
          </Text>
          {step === 'browse' ? (
            <TouchableOpacity onPress={openScannerMode} style={{ width: 56, alignItems: 'center' }}
              accessibilityRole="button" accessibilityLabel="Scan a barcode">
              <Text style={{ fontSize: 20 }}>📷</Text>
              <Text style={{ fontSize: 10, fontWeight: '600', color: c.textMuted, marginTop: 1 }}>Scan</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 56 }} />}
        </View>

        {step === 'browse' && (
          <>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>
              {(['search', 'myFoods', 'recent'] as Tab[]).map(t => (
                <TouchableOpacity key={t} onPress={() => setTab(t)}
                  accessibilityRole="button" accessibilityLabel={t}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: tab === t ? c.primary : c.card,
                    borderWidth: 1.5, borderColor: tab === t ? c.primary : c.separator,
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: tab === t ? '#fff' : c.textMuted }}>
                    {t === 'search' ? '🔍 Search' : t === 'myFoods' ? '⭐ My Foods' : '🕒 Recent'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {tab === 'search' && (
              <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12 }}>
                <TextInput
                  style={inputStyle(c)}
                  placeholder="Search for a food, e.g. banana"
                  placeholderTextColor={c.textMuted}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  accessibilityLabel="Search for a food"
                />
                {searching && <ActivityIndicator style={{ marginTop: 20 }} color={c.primary} />}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <Text style={{ textAlign: 'center', color: c.textMuted, marginTop: 24, fontSize: 13 }}>
                    No results for "{query}". Try a different search or enter it manually.
                  </Text>
                )}
                <FlatList
                  data={results}
                  keyExtractor={(item, i) => item.code ?? String(i)}
                  contentContainerStyle={{ paddingVertical: 12, gap: 8 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={rowCard(c)}
                      activeOpacity={0.75}
                      onPress={() => {
                        const pickedItem = productToPickedItem(item, 'search');
                        if (!pickedItem) { Alert.alert('No nutrition data', 'This item has no nutrition info on file.'); return; }
                        openQuantityStep(pickedItem);
                      }}
                      accessibilityRole="button" accessibilityLabel={`Add ${item.productName}`}
                    >
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={{ width: 44, height: 44, borderRadius: 8 }} resizeMode="contain" />
                      ) : (
                        <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: c.cardBlue, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 20 }}>🍽️</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }} numberOfLines={1}>
                          {isPregnant && item.pregnancyRisk?.risky ? '⚠️ ' : ''}{item.productName}
                        </Text>
                        <Text style={{ fontSize: 12, color: c.textMuted }} numberOfLines={1}>
                          {[item.brand, item.caloriesPerServing != null ? `${Math.round(item.caloriesPerServing)} kcal / serving`
                            : item.caloriesPer100g != null ? `${Math.round(item.caloriesPer100g)} kcal / 100g` : 'No nutrition data']
                            .filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}

            {tab === 'myFoods' && (
              <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <TextInput
                    style={[inputStyle(c), { flex: 1 }]}
                    placeholder="Filter your foods…"
                    placeholderTextColor={c.textMuted}
                    value={myFoodsFilter}
                    onChangeText={setMyFoodsFilter}
                    accessibilityLabel="Filter my foods"
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' }}
                    onPress={() => { resetCustomFoodForm(); setStep('create'); }}
                    accessibilityRole="button" accessibilityLabel="Create a custom food"
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>+ New</Text>
                  </TouchableOpacity>
                </View>
                {!savedFoodsLoaded ? (
                  <ActivityIndicator color={c.primary} />
                ) : filteredSavedFoods.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingTop: 32 }}>
                    <Text style={{ fontSize: 36, marginBottom: 8 }}>⭐</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 4 }}>
                      {savedFoods.length === 0 ? 'No saved foods yet' : 'No matches'}
                    </Text>
                    <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center' }}>
                      {savedFoods.length === 0 ? 'Save foods you eat often for one-tap logging.' : 'Try a different filter.'}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={filteredSavedFoods}
                    keyExtractor={f => f.id}
                    contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={rowCard(c)} activeOpacity={0.75}
                        onPress={() => openQuantityStep(savedFoodToPickedItem(item))}
                        accessibilityRole="button" accessibilityLabel={`Add ${item.name}`}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }} numberOfLines={1}>{item.name}</Text>
                          <Text style={{ fontSize: 12, color: c.textMuted }} numberOfLines={1}>
                            {[item.brand, item.calories != null ? `${item.calories} kcal / ${item.serving_label || 'serving'}` : null]
                              .filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => deleteSavedFood(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button" accessibilityLabel={`Remove ${item.name} from My Foods`}>
                          <Text style={{ fontSize: 15, color: c.textMuted }}>✕</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </View>
            )}

            {tab === 'recent' && (
              <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12 }}>
                {recentMeals.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingTop: 32 }}>
                    <Text style={{ fontSize: 36, marginBottom: 8 }}>🕒</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 4 }}>No recent meals yet</Text>
                    <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center' }}>Meals you log will show up here for quick re-adding.</Text>
                  </View>
                ) : (
                  <FlatList
                    data={recentMeals}
                    keyExtractor={(m, i) => `${m.description}-${i}`}
                    contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={rowCard(c)} activeOpacity={0.75}
                        onPress={() => openQuantityStep(recentToPickedItem(item))}
                        accessibilityRole="button" accessibilityLabel={`Add ${item.description}`}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }} numberOfLines={1}>{item.description}</Text>
                          {item.calories != null && (
                            <Text style={{ fontSize: 12, color: c.textMuted }}>{item.calories} kcal</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </View>
            )}
          </>
        )}

        {step === 'create' && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 20, lineHeight: 19 }}>
              Enter nutrition for one serving — you'll set quantity on the next step.
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Name</Text>
            <TextInput style={[inputStyle(c), { marginBottom: 14 }]} placeholder="e.g. Homemade granola"
              placeholderTextColor={c.textMuted} value={cfName} onChangeText={setCfName} accessibilityLabel="Food name" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Brand (optional)</Text>
            <TextInput style={[inputStyle(c), { marginBottom: 14 }]} placeholder="e.g. Trader Joe's"
              placeholderTextColor={c.textMuted} value={cfBrand} onChangeText={setCfBrand} accessibilityLabel="Brand" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Serving label</Text>
            <TextInput style={[inputStyle(c), { marginBottom: 14 }]} placeholder="e.g. 1 cup, 1 slice, 30g"
              placeholderTextColor={c.textMuted} value={cfLabel} onChangeText={setCfLabel} accessibilityLabel="Serving label" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Calories per serving</Text>
            <TextInput style={[inputStyle(c), { marginBottom: 14 }]} placeholder="e.g. 220" keyboardType="numeric"
              placeholderTextColor={c.textMuted} value={cfCal} onChangeText={setCfCal} accessibilityLabel="Calories per serving" />
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              {[['Protein g', cfProtein, setCfProtein], ['Carbs g', cfCarbs, setCfCarbs], ['Fat g', cfFat, setCfFat]].map(([ph, val, setter]: any) => (
                <View key={ph} style={{ flex: 1 }}>
                  <TextInput style={inputStyle(c)} placeholder="0" keyboardType="decimal-pad" placeholderTextColor={c.textMuted}
                    value={val} onChangeText={setter} accessibilityLabel={ph} />
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>{ph}</Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
              {[
                ['Sugar g', cfSugar, setCfSugar], ['Fiber g', cfFiber, setCfFiber],
                ['Sodium mg', cfSodium, setCfSodium], ['Cholest. mg', cfCholesterol, setCfCholesterol],
                ['Folate mcg', cfFolate, setCfFolate], ['Iron mg', cfIron, setCfIron], ['Caffeine mg', cfCaffeine, setCfCaffeine],
              ].map(([ph, val, setter]: any) => (
                <View key={ph} style={{ flex: 1, minWidth: 90 }}>
                  <TextInput style={inputStyle(c)} placeholder="0" keyboardType="decimal-pad" placeholderTextColor={c.textMuted}
                    value={val} onChangeText={setter} accessibilityLabel={ph} />
                  <Text style={{ fontSize: 10, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>{ph}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={primaryBtn(c)} onPress={openCustomFoodQuantity}
              accessibilityRole="button" accessibilityLabel="Continue">
              <Text style={primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 'quantity' && picked && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary, marginBottom: 4 }}>{picked.desc}</Text>
            <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 20 }}>
              Per {picked.defaultLabel}: {picked.perUnit.calories != null ? `${Math.round(picked.perUnit.calories)} kcal` : '— kcal'}
            </Text>

            {isPregnant && picked.pregnancyRisk?.risky && (
              <View style={{ backgroundColor: c.cardBlush, borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1.5, borderColor: c.blush }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 4 }}>⚠️ Heads up — pregnancy</Text>
                <Text style={{ fontSize: 12, color: c.textSecondary, lineHeight: 18 }}>
                  {picked.pregnancyRisk.reasons.join(' · ')}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Quantity</Text>
                <TextInput style={inputStyle(c)} keyboardType="decimal-pad" value={qtyInput} onChangeText={setQtyInput}
                  accessibilityLabel="Quantity" />
              </View>
              <View style={{ flex: 1.4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Unit</Text>
                <TextInput style={inputStyle(c)} value={labelInput} onChangeText={setLabelInput}
                  placeholder="serving" placeholderTextColor={c.textMuted} accessibilityLabel="Serving unit label" />
              </View>
            </View>

            <View style={{ backgroundColor: c.cardSage, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: c.sage }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Total</Text>
              <Text style={{ fontSize: 24, fontWeight: '900', color: c.textPrimary, marginBottom: 4 }}>
                {totalPreview?.calories != null ? totalPreview.calories.toLocaleString() : '—'}
                <Text style={{ fontSize: 13, fontWeight: '500', color: c.textMuted }}> kcal</Text>
              </Text>
              {(totalPreview?.protein_g != null || totalPreview?.carbs_g != null || totalPreview?.fat_g != null) && (
                <Text style={{ fontSize: 12, color: c.textMuted }}>
                  Protein {totalPreview?.protein_g ?? 0}g · Carbs {totalPreview?.carbs_g ?? 0}g · Fat {totalPreview?.fat_g ?? 0}g
                </Text>
              )}
            </View>

            <TouchableOpacity onPress={() => setShowMicros(v => !v)} accessibilityRole="button"
              accessibilityLabel={showMicros ? 'Hide nutrition details' : 'Show nutrition details'}
              style={{ marginBottom: showMicros ? 12 : 20 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>
                {showMicros ? '▾ Hide nutrition details' : '▸ More nutrition details'}
              </Text>
            </TouchableOpacity>
            {showMicros && (
              <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 20, lineHeight: 18 }}>
                Sugar {totalPreview?.sugar_g ?? '—'}g · Fiber {totalPreview?.fiber_g ?? '—'}g ·{'\n'}
                Sodium {totalPreview?.sodium_mg ?? '—'}mg · Cholesterol {totalPreview?.cholesterol_mg ?? '—'}mg{'\n'}
                Folate {totalPreview?.folate_mcg ?? '—'}mcg · Iron {totalPreview?.iron_mg ?? '—'}mg · Caffeine {totalPreview?.caffeine_mg ?? '—'}mg
              </Text>
            )}

            {picked.offerSaveToMyFoods && (
              <TouchableOpacity
                onPress={() => setSaveToMyFoods(v => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 }}
                accessibilityRole="checkbox" accessibilityState={{ checked: saveToMyFoods }}
                accessibilityLabel="Save to My Foods"
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: c.primary,
                  backgroundColor: saveToMyFoods ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center',
                }}>
                  {saveToMyFoods && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text>}
                </View>
                <Text style={{ fontSize: 13, color: c.textSecondary, fontWeight: '600' }}>Save to My Foods for next time</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[primaryBtn(c), { opacity: qtyNum > 0 ? 1 : 0.45 }]} disabled={!qtyNum || saving}
              onPress={handleAdd} accessibilityRole="button" accessibilityLabel="Add to meal">
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={primaryBtnText}>Add to Meal</Text>}
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 'scanner' && (
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {!scanProduct && !lookingUp && (
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                onBarcodeScanned={({ data }) => handleBarcodeScanned(data)}
                barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8'] }}
              />
            )}
            <View style={{ ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', padding: 20 }}>
              <View />
              {lookingUp ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Looking up product…</Text>
                </View>
              ) : !scanProduct ? (
                <View style={{ alignItems: 'center', gap: 20, flex: 1, justifyContent: 'center' }}>
                  <View style={{ width: 260, height: 160, borderRadius: 16, borderWidth: 3, borderColor: c.blue, backgroundColor: 'transparent' }} />
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 }}>
                    Point at a barcode to scan
                  </Text>
                </View>
              ) : (
                <View style={{ backgroundColor: 'rgba(17,24,39,0.92)', borderRadius: 20, padding: 16, gap: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                    {scanProduct.imageUrl ? (
                      <Image source={{ uri: scanProduct.imageUrl }} style={{ width: 70, height: 70, borderRadius: 12 }} resizeMode="contain" />
                    ) : (
                      <View style={{ width: 70, height: 70, borderRadius: 12, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 32 }}>🍽️</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      {scanProduct.found ? (
                        <>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#9CA3AF', marginBottom: 2 }}>{scanProduct.brand ?? 'Unknown brand'}</Text>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 6 }}>
                            {isPregnant && scanProduct.pregnancyRisk.risky ? '⚠️ ' : ''}{scanProduct.productName ?? 'Unknown product'}
                          </Text>
                          {isPregnant && scanProduct.pregnancyRisk.risky && (
                            <Text style={{ fontSize: 12, color: '#FCA5A5', marginBottom: 4 }}>
                              {scanProduct.pregnancyRisk.reasons.join(' · ')}
                            </Text>
                          )}
                          {(scanProduct.caloriesPerServing != null || scanProduct.caloriesPer100g != null) ? (
                            <Text style={{ fontSize: 12, color: '#D1D5DB' }}>
                              {scanProduct.caloriesPerServing != null
                                ? `Per serving${scanProduct.servingSize ? ` (${scanProduct.servingSize})` : ''}: ${Math.round(scanProduct.caloriesPerServing)} kcal`
                                : `Per 100g: ${Math.round(scanProduct.caloriesPer100g!)} kcal`}
                            </Text>
                          ) : (
                            <Text style={{ fontSize: 12, color: '#FCA5A5' }}>No nutrition data found for this product.</Text>
                          )}
                        </>
                      ) : (
                        <>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#9CA3AF', marginBottom: 2 }}>Product not found</Text>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                            This barcode wasn't in the database. Try searching or adding it manually instead.
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                  <View style={{ gap: 8 }}>
                    {(scanProduct.caloriesPerServing != null || scanProduct.caloriesPer100g != null) && (
                      <TouchableOpacity style={{ backgroundColor: c.blue, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                        onPress={useScannedProduct} activeOpacity={0.85}
                        accessibilityRole="button" accessibilityLabel="Use this product">
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Use this product →</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 8 }}
                      onPress={() => { setScannerLocked(false); setScanProduct(null); }} activeOpacity={0.7}
                      accessibilityRole="button" accessibilityLabel="Scan again">
                      <Text style={{ color: '#9CA3AF', fontWeight: '600', fontSize: 14 }}>Scan again</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
