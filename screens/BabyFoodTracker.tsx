import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete, safeUpsert } from '../lib/syncService';
import {
  BRAND_NAMES, getCategories, getFlavors, getAllFlavorsForBrand,
} from '../lib/babyFoodData';
import { lookupBarcode, ProductInfo } from '../lib/barcodeProductLookup';
import { scheduleTryAgainReminder } from '../lib/foodTryAgainNotification';
import { findPrepTip } from './BabyFoodChart';

// ─── Types ────────────────────────────────────────────────────────────────────

type Rating = 'dislike' | 'like' | 'love';
type Portion = 'none' | 'few_bites' | 'half' | 'all';

interface FoodLog {
  id: string;
  brand: string;
  category: string | null;
  flavor: string;
  rating: Rating | null;
  bad_reaction: boolean;
  reaction_notes: string | null;
  notes: string | null;
  tried_at: string;
  portion_eaten: Portion | null;
  is_first_introduction: boolean;
}

type FilterKey = 'all' | 'love' | 'like' | 'dislike' | 'reaction';
type ModalStep = 1 | 2 | 3;

// ─── Food group classification ────────────────────────────────────────────────

const FOOD_GROUPS: { key: string; label: string; emoji: string; color: string; keywords: string[] }[] = [
  { key: 'fruits',     label: 'Fruits',     emoji: '🍎', color: '#EF4444',
    keywords: ['apple','pear','banana','mango','peach','berry','blueberry','strawberry','plum','apricot','cherry','kiwi','pineapple','papaya','guava','passion','raspberry','blackberry','prune','orange','grape','watermelon','fig','date','lemon','lime','pomegranate','pitaya','acerola','coconut'] },
  { key: 'vegetables', label: 'Vegetables', emoji: '🥦', color: '#22C55E',
    keywords: ['carrot','sweet potato','pea','spinach','zucchini','pumpkin','squash','broccoli','kale','beet','corn','bean','lentil','chickpea','green bean','avocado','parsnip','cauliflower','celery','tomato','pepper','onion','leek','asparagus','edamame','chard','arugula'] },
  { key: 'protein',    label: 'Protein',    emoji: '🍗', color: '#F97316',
    keywords: ['chicken','beef','turkey','pork','salmon','fish','lamb','bison','egg','tofu','quinoa'] },
  { key: 'grains',     label: 'Grains',     emoji: '🌾', color: '#D97706',
    keywords: ['oat','rice','barley','wheat','grain','cereal','buckwheat','millet','granola','oatmeal','barley','rye'] },
  { key: 'dairy',      label: 'Dairy',      emoji: '🥛', color: '#3B82F6',
    keywords: ['yogurt','cheese','milk','cream','butter','cheddar'] },
];

function getFoodGroups(flavor: string): string[] {
  const lower = flavor.toLowerCase();
  return FOOD_GROUPS.filter(g => g.keywords.some(k => lower.includes(k))).map(g => g.key);
}

// ─── Stage recommendations ────────────────────────────────────────────────────

function getStageInfo(birthDateIso: string | null): { stage: string; desc: string; months: number } | null {
  if (!birthDateIso) return null;
  const months = Math.floor((Date.now() - new Date(birthDateIso).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  if (months < 4)  return null; // too young — don't clutter UI
  if (months < 6)  return { stage: 'Stage 1', desc: 'Single-ingredient smooth purees', months };
  if (months < 8)  return { stage: 'Stage 2', desc: 'Multi-ingredient purees, slightly thicker', months };
  if (months < 10) return { stage: 'Stage 3', desc: 'Mashed foods & soft small pieces', months };
  if (months < 12) return { stage: 'Stage 4', desc: 'Soft table foods & finger foods', months };
  return { stage: 'Toddler', desc: 'Most table foods — explore textures & flavors!', months };
}

// Allergen watchlist integration
const ALLERGEN_STORAGE_KEY = '@village_allergen_tracker_v2';

async function addToAllergenWatchlist(name: string, reactionNotes: string, userId?: string | null, babyId?: string | null) {
  const id = `custom_${Date.now()}`;
  const entry = { status: 'watchlist' as const, reactionNotes: reactionNotes || undefined };

  // Write to Supabase when we have user + baby context
  if (userId && babyId) {
    try {
      await safeUpsert('allergen_records', {
        user_id: userId,
        baby_id: babyId,
        allergen_id: id,
        allergen_name: name,
        allergen_emoji: '🍽️',
        allergen_tab: 'food',
        is_custom: true,
        status: 'watchlist',
        reaction_notes: reactionNotes || null,
        updated_at: new Date().toISOString(),
      }, 'baby_id,allergen_id');
      return;
    } catch {}
  }

  // Fall back to AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(ALLERGEN_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : { entries: {}, custom: [] };
    data.custom = [...(data.custom ?? []), { id, name, emoji: '🍽️', tab: 'food' }];
    data.entries = { ...(data.entries ?? {}), [id]: entry };
    await AsyncStorage.setItem(ALLERGEN_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

const RATING_OPTS: { value: Rating; label: string; emoji: string }[] = [
  { value: 'dislike', label: 'Disliked',  emoji: '👎' },
  { value: 'like',    label: 'Liked',     emoji: '👍' },
  { value: 'love',    label: 'Loved it!', emoji: '❤️' },
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',      label: 'All'       },
  { key: 'love',     label: '❤️ Loved'  },
  { key: 'like',     label: '👍 Liked'  },
  { key: 'dislike',  label: '👎 Disliked' },
  { key: 'reaction', label: '⚠️ Reactions' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

const PORTION_OPTS: { value: Portion; label: string }[] = [
  { value: 'none',      label: 'None 😶'        },
  { value: 'few_bites', label: 'A few bites 🤏'  },
  { value: 'half',      label: 'About half 🍽️'  },
  { value: 'all',       label: 'All done! 🙌'   },
];

const TRY_AGAIN_OPTS = [
  { days: 3,  label: '3 days' },
  { days: 7,  label: '1 week' },
  { days: 14, label: '2 weeks' },
];

interface Props {
  userId: string | null;
  babyId: string | null;
  babyName: string | null;
  babyBirthDate?: string | null;
  autoOpenKey?: number;
}

export default function BabyFoodTracker({ userId, babyId, babyName, babyBirthDate, autoOpenKey }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();

  // ── Log list ───────────────────────────────────────────────────────────────
  const [logs,       setLogs]       = useState<FoodLog[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<FilterKey>('all');
  const [showAll,    setShowAll]    = useState(false);

  // ── Camera / scanner ──────────────────────────────────────────────────────
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showScanner,    setShowScanner]    = useState(false);
  const [scannerLocked,  setScannerLocked]  = useState(false); // prevent double-scan
  const [lookingUp,      setLookingUp]      = useState(false);
  const [scannedProduct, setScannedProduct] = useState<ProductInfo | null>(null);

  // ── Modal ──────────────────────────────────────────────────────────────────
  const [showModal,  setShowModal]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [step,       setStep]       = useState<ModalStep>(1);

  // Step 1 – Brand
  const [brandSearch,    setBrandSearch]    = useState('');
  const [selectedBrand,  setSelectedBrand]  = useState('');
  const [customBrand,    setCustomBrand]    = useState('');
  const [useCustomBrand, setUseCustomBrand] = useState(false);

  // Step 2 – Flavor
  const [selectedCategory, setSelectedCategory] = useState('');
  const [flavorSearch,     setFlavorSearch]     = useState('');
  const [selectedFlavor,   setSelectedFlavor]   = useState('');
  const [customFlavor,     setCustomFlavor]     = useState('');
  const [useCustomFlavor,  setUseCustomFlavor]  = useState(false);

  // Step 3 – Details
  const [rating,        setRating]        = useState<Rating | null>(null);
  const [portionEaten,  setPortionEaten]  = useState<Portion | null>(null);
  const [tryAgainDays,  setTryAgainDays]  = useState<number | null>(null);
  const [badReaction,   setBadReaction]   = useState(false);
  const [reactionNotes, setReactionNotes] = useState('');
  const [notes,         setNotes]         = useState('');
  const [scanInfo,      setScanInfo]      = useState<ProductInfo | null>(null);

  // ── Load logs ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!babyId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await (supabase.from('baby_food_logs') as any)
      .select('id,brand,category,flavor,rating,bad_reaction,reaction_notes,notes,tried_at,portion_eaten,is_first_introduction')
      .eq('baby_id', babyId)
      .order('tried_at', { ascending: false })
      .limit(200);
    setLogs((data as FoodLog[]) ?? []);
    setLoading(false);
  }, [babyId]);

  useEffect(() => { load(); }, [load]);

  // Open the add modal when parent signals (e.g. after logging a solids feed)
  useEffect(() => {
    if (autoOpenKey) openAdd(); // eslint-disable-line react-hooks/exhaustive-deps
  }, [autoOpenKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered + sliced logs ─────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (filter === 'all')      return true;
      if (filter === 'reaction') return l.bad_reaction;
      return l.rating === filter;
    });
  }, [logs, filter]);

  const displayed = showAll ? filtered : filtered.slice(0, 10);

  // ── Derived: stage, waiting period, diversity, favorites ──────────────────

  const stageInfo = useMemo(() => getStageInfo(babyBirthDate ?? null), [babyBirthDate]);

  const waitingPeriod = useMemo(() => {
    const firstIntros = logs.filter(l => l.is_first_introduction);
    if (!firstIntros.length) return null;
    const latest = firstIntros[0]; // logs are newest-first
    const daysAgo = (Date.now() - new Date(latest.tried_at).getTime()) / 86_400_000;
    const daysLeft = Math.ceil(5 - daysAgo);
    if (daysLeft <= 0) return null;
    return { flavor: latest.flavor, daysLeft, date: latest.tried_at };
  }, [logs]);

  const diversityGroups = useMemo(() => {
    const seenFlavors = new Set<string>();
    const counts: Record<string, number> = {};
    for (const log of logs) {
      const key = log.flavor.toLowerCase();
      if (seenFlavors.has(key)) continue;
      seenFlavors.add(key);
      for (const g of getFoodGroups(log.flavor)) {
        counts[g] = (counts[g] ?? 0) + 1;
      }
    }
    return FOOD_GROUPS.map(g => ({ ...g, count: counts[g.key] ?? 0 }));
  }, [logs]);

  const lovedFoods = useMemo(() => {
    const seen = new Set<string>();
    const result: FoodLog[] = [];
    for (const log of logs) {
      if (log.rating !== 'love') continue;
      const key = `${log.brand}|${log.flavor}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(log);
      if (result.length >= 8) break;
    }
    return result;
  }, [logs]);

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function resetModal() {
    setStep(1);
    setBrandSearch(''); setSelectedBrand(''); setCustomBrand(''); setUseCustomBrand(false);
    setSelectedCategory(''); setFlavorSearch('');
    setSelectedFlavor(''); setCustomFlavor(''); setUseCustomFlavor(false);
    setRating(null); setPortionEaten(null); setTryAgainDays(null);
    setBadReaction(false); setReactionNotes(''); setNotes('');
    setScanInfo(null);
    setEditId(null);
  }

  function openAdd() { resetModal(); setShowModal(true); }

  async function openScanner() {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Camera access needed', 'Please allow camera access in your device settings to scan barcodes.');
        return;
      }
    }
    resetModal();
    setScannerLocked(false);
    setScannedProduct(null);
    setShowScanner(true);
  }

  async function handleBarcode(barcode: string) {
    if (scannerLocked) return;
    setScannerLocked(true);
    setLookingUp(true);
    const product = await lookupBarcode(barcode);
    setLookingUp(false);
    setScannedProduct(product);
  }

  function useScannedProduct() {
    if (!scannedProduct) return;
    // Try to match brand to our known list
    const rawBrand = scannedProduct.brand ?? '';
    const matchedBrand = BRAND_NAMES.find(b =>
      b.toLowerCase().includes(rawBrand.toLowerCase()) ||
      rawBrand.toLowerCase().includes(b.toLowerCase().split(' ')[0]),
    );
    if (matchedBrand) {
      setSelectedBrand(matchedBrand);
      setUseCustomBrand(false);
    } else {
      setCustomBrand(rawBrand);
      setUseCustomBrand(true);
    }
    // Use product name as flavor
    const flavor = scannedProduct.productName ?? '';
    setCustomFlavor(flavor);
    setUseCustomFlavor(true);
    setSelectedFlavor('');
    setScanInfo(scannedProduct);
    setShowScanner(false);
    setScannedProduct(null);
    setScannerLocked(false);
    setStep(3);
    setShowModal(true);
  }

  function openEdit(log: FoodLog) {
    resetModal();
    const knownBrand = BRAND_NAMES.includes(log.brand);
    setSelectedBrand(knownBrand ? log.brand : '');
    setCustomBrand(knownBrand ? '' : log.brand);
    setUseCustomBrand(!knownBrand);
    setSelectedCategory(log.category ?? '');
    const flavors = knownBrand && log.category
      ? getFlavors(log.brand, log.category)
      : knownBrand ? getAllFlavorsForBrand(log.brand) : [];
    const knownFlavor = flavors.includes(log.flavor);
    setSelectedFlavor(knownFlavor ? log.flavor : '');
    setCustomFlavor(knownFlavor ? '' : log.flavor);
    setUseCustomFlavor(!knownFlavor);
    setRating(log.rating);
    setPortionEaten(log.portion_eaten ?? null);
    setTryAgainDays(null);
    setBadReaction(log.bad_reaction);
    setReactionNotes(log.reaction_notes ?? '');
    setNotes(log.notes ?? '');
    setEditId(log.id);
    setStep(3);
    setShowModal(true);
  }

  const effectiveBrand  = useCustomBrand  ? customBrand.trim()  : selectedBrand;
  const effectiveFlavor = useCustomFlavor ? customFlavor.trim() : selectedFlavor;
  const prepTip = useMemo(() => findPrepTip(effectiveFlavor), [effectiveFlavor]);

  function canAdvanceStep1() { return effectiveBrand.length > 0; }
  function canAdvanceStep2() { return effectiveFlavor.length > 0; }

  async function handleSave() {
    if (!effectiveBrand || !effectiveFlavor) {
      Alert.alert('Missing info', 'Please select a brand and flavor.'); return;
    }
    if (!userId || !babyId) return;
    setSaving(true);
    try {
      const isFirstIntro = !editId && !logs.some(
        l => l.brand.toLowerCase() === effectiveBrand.toLowerCase() &&
             l.flavor.toLowerCase() === effectiveFlavor.toLowerCase(),
      );

      const fields = {
        brand:                effectiveBrand,
        category:             useCustomBrand ? null : (selectedCategory || null),
        flavor:               effectiveFlavor,
        rating:               rating,
        bad_reaction:         badReaction,
        reaction_notes:       badReaction ? (reactionNotes.trim() || null) : null,
        notes:                notes.trim() || null,
        portion_eaten:        portionEaten,
        is_first_introduction: isFirstIntro,
      };
      if (editId) {
        await safeUpdate('baby_food_logs' as any, editId, fields);
      } else {
        await safeInsert('baby_food_logs' as any, {
          ...fields, user_id: userId, baby_id: babyId,
          tried_at: new Date().toISOString(),
        });
      }

      if (badReaction) {
        await addToAllergenWatchlist(effectiveFlavor, reactionNotes.trim(), userId, babyId);
      }
      if (!editId && rating === 'dislike' && tryAgainDays && babyName) {
        await scheduleTryAgainReminder(babyId, babyName, effectiveBrand, effectiveFlavor, tryAgainDays);
      }

      setShowModal(false);
      resetModal();
      await load();
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(log: FoodLog) {
    Alert.alert('Remove food?', `${log.brand} — ${log.flavor}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await safeDelete('baby_food_logs', log.id);
          await load();
        },
      },
    ]);
  }

  // ── Brand filtered list ────────────────────────────────────────────────────

  const filteredBrands = useMemo(() => {
    const q = brandSearch.toLowerCase();
    return q ? BRAND_NAMES.filter(b => b.toLowerCase().includes(q)) : BRAND_NAMES;
  }, [brandSearch]);

  // ── Flavor list for step 2 ─────────────────────────────────────────────────

  const flavorList = useMemo(() => {
    if (!selectedBrand) return [];
    const base = selectedCategory
      ? getFlavors(selectedBrand, selectedCategory)
      : getAllFlavorsForBrand(selectedBrand);
    const q = flavorSearch.toLowerCase();
    return q ? base.filter(f => f.toLowerCase().includes(q)) : base;
  }, [selectedBrand, selectedCategory, flavorSearch]);

  const categories = useMemo(
    () => (selectedBrand ? getCategories(selectedBrand) : []),
    [selectedBrand],
  );

  // ── Step labels ────────────────────────────────────────────────────────────

  const stepLabel = step === 1 ? 'Brand' : step === 2 ? 'Flavor' : 'Rating & Details';

  if (!babyId) return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.wrap}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>🍽️</Text>
          <View>
            <Text style={s.headerTitle}>Baby Food Tracker</Text>
            <Text style={s.headerSub}>{logs.length} food{logs.length !== 1 ? 's' : ''} logged</Text>
          </View>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity style={s.scanBtn} onPress={openScanner} activeOpacity={0.8}>
            <Text style={s.scanBtnText}>📷 Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.8}>
            <Text style={s.addBtnText}>+ Log</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Filter chips ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.filterScroll} contentContainerStyle={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterChip, filter === f.key && { backgroundColor: c.honey, borderColor: c.honey }]}
            onPress={() => { setFilter(f.key); setShowAll(false); }}
            activeOpacity={0.8}
          >
            <Text style={[s.filterChipText, filter === f.key && { color: '#fff', fontWeight: '700' }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Stage recommendation banner ── */}
      {stageInfo && (
        <View style={s.stageBanner}>
          <Text style={s.stageBannerTitle}>{stageInfo.stage} · {stageInfo.months}mo</Text>
          <Text style={s.stageBannerDesc}>{stageInfo.desc}</Text>
        </View>
      )}

      {/* ── Waiting period banner ── */}
      {waitingPeriod && (
        <View style={s.waitBanner}>
          <Text style={s.waitBannerText}>
            ⏳ Still introducing <Text style={{ fontWeight: '800' }}>{waitingPeriod.flavor}</Text>
            {' '}— watch for reactions for {waitingPeriod.daysLeft} more day{waitingPeriod.daysLeft !== 1 ? 's' : ''}.
          </Text>
        </View>
      )}

      {/* ── Loved foods quick-log ── */}
      {lovedFoods.length > 0 && (
        <View style={s.lovedSection}>
          <Text style={s.lovedTitle}>❤️ Favorites — tap to log again</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.lovedRow}>
            {lovedFoods.map(log => (
              <TouchableOpacity
                key={`${log.brand}|${log.flavor}`}
                style={s.lovedChip}
                activeOpacity={0.8}
                onPress={() => {
                  resetModal();
                  const knownBrand = BRAND_NAMES.includes(log.brand);
                  if (knownBrand) { setSelectedBrand(log.brand); setUseCustomBrand(false); }
                  else { setCustomBrand(log.brand); setUseCustomBrand(true); }
                  setCustomFlavor(log.flavor); setUseCustomFlavor(true);
                  setSelectedFlavor('');
                  setStep(3);
                  setShowModal(true);
                }}
              >
                <Text style={s.lovedChipBrand}>{log.brand}</Text>
                <Text style={s.lovedChipFlavor}>{log.flavor}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Food diversity chart ── */}
      {logs.length > 0 && (
        <View style={s.diversitySection}>
          <Text style={s.diversityTitle}>Food diversity</Text>
          <View style={s.diversityRow}>
            {diversityGroups.map(g => (
              <View key={g.key} style={s.diversityItem}>
                <Text style={s.diversityEmoji}>{g.emoji}</Text>
                <View style={s.diversityBarBg}>
                  <View style={[s.diversityBarFill, { backgroundColor: g.color, width: `${Math.min(100, g.count * 20)}%` as any }]} />
                </View>
                <Text style={s.diversityCount}>{g.count}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Log list ── */}
      {loading ? (
        <ActivityIndicator size="small" color={c.honey} style={{ margin: 20 }} />
      ) : filtered.length === 0 ? (
        <Text style={s.empty}>
          {filter === 'all' ? `No foods logged yet — tap + Log Food to start!` : `No ${filter} entries yet.`}
        </Text>
      ) : (
        <>
          {displayed.map(log => (
            <TouchableOpacity key={log.id} style={s.logRow} onPress={() => openEdit(log)} activeOpacity={0.8}>
              <View style={s.logLeft}>
                <View style={s.logMeta}>
                  <Text style={s.logBrand}>{log.brand}</Text>
                  {log.category && <Text style={s.logCategory}> · {log.category}</Text>}
                </View>
                <Text style={s.logFlavor}>{log.flavor}</Text>
                <View style={s.logBadgeRow}>
                  {log.rating && (
                    <Text style={s.logRating}>
                      {RATING_OPTS.find(r => r.value === log.rating)?.emoji}{' '}
                      {RATING_OPTS.find(r => r.value === log.rating)?.label}
                    </Text>
                  )}
                  {log.bad_reaction && (
                    <View style={s.reactionBadge}>
                      <Text style={s.reactionBadgeText}>⚠️ Bad reaction</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={s.logRight}>
                <Text style={s.logDate}>{formatDate(log.tried_at)}</Text>
                <TouchableOpacity onPress={() => handleDelete(log)} activeOpacity={0.7} style={{ padding: 4 }}>
                  <Text style={s.deleteIcon}>🗑</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
          {filtered.length > 10 && (
            <TouchableOpacity onPress={() => setShowAll(v => !v)} style={s.showMoreBtn} activeOpacity={0.8}>
              <Text style={s.showMoreText}>
                {showAll ? 'Show less' : `Show all ${filtered.length} entries`}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ══════════ ADD / EDIT MODAL ══════════ */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => { setShowModal(false); resetModal(); }}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1}
            onPress={() => { setShowModal(false); resetModal(); }} />
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.modalHandle} />

            {/* Title + step indicator */}
            <View style={s.modalTitleRow}>
              {step > 1 && !editId && (
                <TouchableOpacity onPress={() => setStep(s => (s - 1) as ModalStep)} style={s.backBtn}>
                  <Text style={s.backBtnText}>‹ Back</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>
                  {editId ? '✏️ Edit Food' : '🍽️ Log Food'}
                </Text>
                {!editId && (
                  <Text style={s.stepLabel}>Step {step} of 3 — {stepLabel}</Text>
                )}
              </View>
              {!editId && (
                <View style={s.stepDots}>
                  {([1, 2, 3] as ModalStep[]).map(n => (
                    <View key={n} style={[s.dot, step >= n && { backgroundColor: c.honey }]} />
                  ))}
                </View>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>

              {/* ─── STEP 1: Brand ──────────────────────────────────────── */}
              {step === 1 && (
                <>
                  <Text style={s.fieldLabel}>Search brand</Text>
                  <TextInput
                    style={s.searchInput}
                    placeholder="Type to filter…"
                    placeholderTextColor={c.textMuted}
                    value={brandSearch}
                    onChangeText={setBrandSearch}
                    autoFocus
                  />

                  {filteredBrands.map(brand => (
                    <TouchableOpacity
                      key={brand}
                      style={[s.listItem, selectedBrand === brand && !useCustomBrand && s.listItemActive]}
                      onPress={() => {
                        setSelectedBrand(brand);
                        setUseCustomBrand(false);
                        setSelectedCategory('');
                        setSelectedFlavor('');
                        setCustomFlavor('');
                        setUseCustomFlavor(false);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.listItemText, selectedBrand === brand && !useCustomBrand && s.listItemTextActive]}>
                        {brand}
                      </Text>
                      {selectedBrand === brand && !useCustomBrand && <Text style={s.listCheck}>✓</Text>}
                    </TouchableOpacity>
                  ))}

                  {/* Other / custom brand */}
                  <TouchableOpacity
                    style={[s.listItem, useCustomBrand && s.listItemActive]}
                    onPress={() => { setUseCustomBrand(true); setSelectedBrand(''); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.listItemText, useCustomBrand && s.listItemTextActive]}>
                      Other (enter brand name)
                    </Text>
                  </TouchableOpacity>
                  {useCustomBrand && (
                    <TextInput
                      style={[s.searchInput, { marginTop: 8 }]}
                      placeholder="Brand name…"
                      placeholderTextColor={c.textMuted}
                      value={customBrand}
                      onChangeText={setCustomBrand}
                      autoFocus
                    />
                  )}
                </>
              )}

              {/* ─── STEP 2: Flavor ─────────────────────────────────────── */}
              {step === 2 && (
                <>
                  <View style={s.selectedBrandRow}>
                    <Text style={s.selectedBrandLabel}>{effectiveBrand}</Text>
                  </View>

                  {/* Category chips */}
                  {categories.length > 1 && (
                    <>
                      <Text style={s.fieldLabel}>Category (optional)</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}
                        style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
                        <TouchableOpacity
                          style={[s.catChip, !selectedCategory && s.catChipActive]}
                          onPress={() => setSelectedCategory('')}
                          activeOpacity={0.8}
                        >
                          <Text style={[s.catChipText, !selectedCategory && s.catChipTextActive]}>All</Text>
                        </TouchableOpacity>
                        {categories.map(cat => (
                          <TouchableOpacity
                            key={cat}
                            style={[s.catChip, selectedCategory === cat && s.catChipActive]}
                            onPress={() => setSelectedCategory(cat)}
                            activeOpacity={0.8}
                          >
                            <Text style={[s.catChipText, selectedCategory === cat && s.catChipTextActive]}>
                              {cat}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </>
                  )}

                  <Text style={s.fieldLabel}>Search flavor</Text>
                  <TextInput
                    style={s.searchInput}
                    placeholder="Type to filter…"
                    placeholderTextColor={c.textMuted}
                    value={flavorSearch}
                    onChangeText={setFlavorSearch}
                    autoFocus={!useCustomBrand}
                  />

                  {flavorList.map(flavor => (
                    <TouchableOpacity
                      key={flavor}
                      style={[s.listItem, selectedFlavor === flavor && !useCustomFlavor && s.listItemActive]}
                      onPress={() => { setSelectedFlavor(flavor); setUseCustomFlavor(false); }}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.listItemText, selectedFlavor === flavor && !useCustomFlavor && s.listItemTextActive]}>
                        {flavor}
                      </Text>
                      {selectedFlavor === flavor && !useCustomFlavor && <Text style={s.listCheck}>✓</Text>}
                    </TouchableOpacity>
                  ))}

                  {/* Other / custom flavor */}
                  <TouchableOpacity
                    style={[s.listItem, useCustomFlavor && s.listItemActive]}
                    onPress={() => { setUseCustomFlavor(true); setSelectedFlavor(''); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.listItemText, useCustomFlavor && s.listItemTextActive]}>
                      Other (enter flavor)
                    </Text>
                  </TouchableOpacity>
                  {useCustomFlavor && (
                    <TextInput
                      style={[s.searchInput, { marginTop: 8 }]}
                      placeholder="Flavor name…"
                      placeholderTextColor={c.textMuted}
                      value={customFlavor}
                      onChangeText={setCustomFlavor}
                      autoFocus
                    />
                  )}
                </>
              )}

              {/* ─── STEP 3: Rating + Details ───────────────────────────── */}
              {step === 3 && (
                <>
                  {/* Summary */}
                  <View style={s.summaryBox}>
                    <Text style={s.summaryBrand}>{effectiveBrand}</Text>
                    <Text style={s.summaryFlavor}>{effectiveFlavor}</Text>
                  </View>

                  {/* Prep tip from food chart */}
                  {prepTip && !scanInfo?.found && (
                    <View style={s.prepTipCard}>
                      <Text style={s.prepTipEmoji}>{prepTip.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.prepTipTitle}>Prep tip · {prepTip.name}</Text>
                        <Text style={s.prepTipText}>{prepTip.prep}</Text>
                      </View>
                    </View>
                  )}

                  {/* Scanned product info card */}
                  {scanInfo?.found && (
                    <View style={s.productInfoCard}>
                      <View style={s.productBadgeRow}>
                        {scanInfo.isOrganic && (
                          <View style={s.organicBadge}>
                            <Text style={s.organicBadgeText}>🌱 Organic</Text>
                          </View>
                        )}
                        {scanInfo.isBabyFood && (
                          <View style={s.babyBadge}>
                            <Text style={s.babyBadgeText}>👶 Baby Food</Text>
                          </View>
                        )}
                        {scanInfo.nutriscoreGrade && (
                          <View style={[s.gradeBadge, { backgroundColor: NUTRISCORE_COLOR[scanInfo.nutriscoreGrade] ?? '#9CA3AF' }]}>
                            <Text style={s.gradeBadgeText}>
                              Nutri-Score {scanInfo.nutriscoreGrade.toUpperCase()}
                            </Text>
                          </View>
                        )}
                        {scanInfo.novaGroup !== null && (
                          <View style={[s.novaBadge, { backgroundColor: NOVA_COLOR[scanInfo.novaGroup] ?? '#9CA3AF' }]}>
                            <Text style={s.gradeBadgeText}>
                              NOVA {scanInfo.novaGroup} {scanInfo.novaGroup === 1 ? '(minimally processed)' : scanInfo.novaGroup === 4 ? '(ultra-processed)' : ''}
                            </Text>
                          </View>
                        )}
                      </View>
                      {scanInfo.allergens.length > 0 && (
                        <View style={s.allergenRow}>
                          <Text style={s.allergenTitle}>⚠️ Allergens: </Text>
                          <Text style={s.allergenText}>{scanInfo.allergens.join(', ')}</Text>
                        </View>
                      )}
                      {scanInfo.ingredients && (
                        <Text style={s.ingredientsText} numberOfLines={3}>
                          Ingredients: {scanInfo.ingredients}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Rating */}
                  <Text style={s.fieldLabel}>How did {babyName ?? 'baby'} like it?</Text>
                  <View style={s.ratingRow}>
                    {RATING_OPTS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[s.ratingBtn, rating === opt.value && s.ratingBtnActive,
                          rating === opt.value && opt.value === 'love' && { backgroundColor: '#FFE4E4', borderColor: '#F87171' },
                          rating === opt.value && opt.value === 'like' && { backgroundColor: '#E8F5E9', borderColor: '#66BB6A' },
                          rating === opt.value && opt.value === 'dislike' && { backgroundColor: '#FFF3E0', borderColor: '#FFA726' },
                        ]}
                        onPress={() => setRating(rating === opt.value ? null : opt.value)}
                        activeOpacity={0.8}
                      >
                        <Text style={s.ratingEmoji}>{opt.emoji}</Text>
                        <Text style={[s.ratingLabel, rating === opt.value && { fontWeight: '800' }]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Portion eaten */}
                  <Text style={s.fieldLabel}>How much did {babyName ?? 'baby'} eat?</Text>
                  <View style={s.portionRow}>
                    {PORTION_OPTS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[s.portionBtn, portionEaten === opt.value && s.portionBtnActive]}
                        onPress={() => setPortionEaten(portionEaten === opt.value ? null : opt.value)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.portionBtnText, portionEaten === opt.value && s.portionBtnTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Try-again reminder (only when disliked) */}
                  {rating === 'dislike' && (
                    <View style={s.tryAgainBox}>
                      <Text style={s.tryAgainTitle}>🔔 Remind me to try again?</Text>
                      <Text style={s.tryAgainSub}>Babies often need 10–15 tries before accepting a new food.</Text>
                      <View style={s.tryAgainRow}>
                        {TRY_AGAIN_OPTS.map(opt => (
                          <TouchableOpacity
                            key={opt.days}
                            style={[s.tryAgainChip, tryAgainDays === opt.days && s.tryAgainChipActive]}
                            onPress={() => setTryAgainDays(tryAgainDays === opt.days ? null : opt.days)}
                            activeOpacity={0.8}
                          >
                            <Text style={[s.tryAgainChipText, tryAgainDays === opt.days && s.tryAgainChipTextActive]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Bad Reaction */}
                  <TouchableOpacity
                    style={[s.reactionBtn, badReaction && s.reactionBtnActive]}
                    onPress={() => setBadReaction(v => !v)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.reactionBtnEmoji}>⚠️</Text>
                    <Text style={[s.reactionBtnText, badReaction && { color: '#DC2626' }]}>
                      {badReaction ? 'Bad reaction reported' : 'Report a bad reaction'}
                    </Text>
                    {badReaction && <Text style={s.reactionCheck}>✓</Text>}
                  </TouchableOpacity>

                  {badReaction && (
                    <>
                      <Text style={[s.fieldLabel, { marginTop: 8 }]}>Describe the reaction (optional)</Text>
                      <TextInput
                        style={s.notesInput}
                        placeholder="e.g. rash, vomiting, fussiness…"
                        placeholderTextColor={c.textMuted}
                        value={reactionNotes}
                        onChangeText={setReactionNotes}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                      />
                    </>
                  )}

                  {/* Notes */}
                  <Text style={[s.fieldLabel, { marginTop: 12 }]}>Notes (optional)</Text>
                  <TextInput
                    style={s.notesInput}
                    placeholder="Any additional notes…"
                    placeholderTextColor={c.textMuted}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </>
              )}

            </ScrollView>

            {/* Footer buttons */}
            <View style={s.footer}>
              {step < 3 ? (
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: c.honey },
                    (step === 1 ? !canAdvanceStep1() : !canAdvanceStep2()) && s.nextBtnOff]}
                  onPress={() => {
                    if (step === 1 && canAdvanceStep1()) setStep(2);
                    if (step === 2 && canAdvanceStep2()) setStep(3);
                  }}
                  disabled={step === 1 ? !canAdvanceStep1() : !canAdvanceStep2()}
                  activeOpacity={0.85}
                >
                  <Text style={s.nextBtnText}>Next →</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: c.honey }, saving && s.nextBtnOff]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.nextBtnText}>{editId ? 'Save Changes' : 'Save Food Log'}</Text>
                  }
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.cancelBtn}
                onPress={() => { setShowModal(false); resetModal(); }} activeOpacity={0.7}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══════════ BARCODE SCANNER MODAL ══════════ */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => { setShowScanner(false); setScannerLocked(false); setScannedProduct(null); }}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>

          {/* Camera */}
          {!scannedProduct && !lookingUp && (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={({ data }) => handleBarcode(data)}
              barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8'] }}
            />
          )}

          {/* Overlay UI */}
          <View style={s.scanOverlay}>
            <TouchableOpacity
              style={s.scanCloseBtn}
              onPress={() => { setShowScanner(false); setScannerLocked(false); setScannedProduct(null); }}
              activeOpacity={0.8}
            >
              <Text style={s.scanCloseTxt}>✕ Close</Text>
            </TouchableOpacity>

            {lookingUp ? (
              <View style={s.scanLookupBox}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={s.scanLookupText}>Looking up product…</Text>
              </View>
            ) : !scannedProduct ? (
              <View style={s.scanHintBox}>
                <View style={s.scanFrame} />
                <Text style={s.scanHint}>Point at a barcode to scan</Text>
              </View>
            ) : (
              /* ── Scanned result card ── */
              <View style={s.scanResultCard}>
                <View style={s.scanResultTop}>
                  {scannedProduct.imageUrl ? (
                    <Image source={{ uri: scannedProduct.imageUrl }} style={s.productImage} resizeMode="contain" />
                  ) : (
                    <View style={[s.productImage, { backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 32 }}>🍼</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    {scannedProduct.found ? (
                      <>
                        <Text style={s.scanResultBrand}>{scannedProduct.brand ?? 'Unknown brand'}</Text>
                        <Text style={s.scanResultName}>{scannedProduct.productName ?? 'Unknown product'}</Text>
                        <View style={s.scanBadgeRow}>
                          {scannedProduct.isOrganic && <View style={s.organicBadge}><Text style={s.organicBadgeText}>🌱 Organic</Text></View>}
                          {scannedProduct.isBabyFood && <View style={s.babyBadge}><Text style={s.babyBadgeText}>👶 Baby Food</Text></View>}
                          {scannedProduct.nutriscoreGrade && (
                            <View style={[s.gradeBadge, { backgroundColor: NUTRISCORE_COLOR[scannedProduct.nutriscoreGrade] ?? '#6B7280' }]}>
                              <Text style={s.gradeBadgeText}>Nutri-Score {scannedProduct.nutriscoreGrade.toUpperCase()}</Text>
                            </View>
                          )}
                        </View>
                        {scannedProduct.allergens.length > 0 && (
                          <Text style={s.scanAllergenText}>⚠️ {scannedProduct.allergens.join(', ')}</Text>
                        )}
                      </>
                    ) : (
                      <>
                        <Text style={s.scanResultBrand}>Product not found</Text>
                        <Text style={s.scanResultName}>This barcode wasn't in the database. You can still log it manually.</Text>
                      </>
                    )}
                  </View>
                </View>

                <View style={s.scanResultActions}>
                  <TouchableOpacity
                    style={[s.scanUseBtn, { backgroundColor: '#D97706' }]}
                    onPress={useScannedProduct}
                    activeOpacity={0.85}
                  >
                    <Text style={s.scanUseBtnText}>
                      {scannedProduct.found ? 'Use this product →' : 'Log manually →'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.scanRetryBtn}
                    onPress={() => { setScannerLocked(false); setScannedProduct(null); }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.scanRetryText}>Scan again</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Nutri-Score / NOVA color maps ───────────────────────────────────────────

const NUTRISCORE_COLOR: Record<string, string> = {
  a: '#038141', b: '#85BB2F', c: '#FECB02', d: '#EE8100', e: '#E63E11',
};
const NOVA_COLOR: Record<number, string> = {
  1: '#038141', 2: '#85BB2F', 3: '#FECB02', 4: '#E63E11',
};

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.card, borderRadius: 16, marginBottom: 16,
      borderWidth: 1.5, borderColor: c.separator, overflow: 'hidden',
    },

    // Header
    header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderLeftWidth: 4, borderLeftColor: c.honey },
    headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerEmoji: { fontSize: 26 },
    headerTitle: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    headerSub:   { fontSize: 12, color: c.textMuted, marginTop: 1 },
    addBtn:      { backgroundColor: c.cardHoney, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: c.honey },
    addBtnText:  { fontSize: 13, fontWeight: '700', color: c.honey },

    // Filter
    filterScroll: { borderTopWidth: 1, borderTopColor: c.separator },
    filterRow:    { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
    filterChip:   { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    filterChipText: { fontSize: 13, color: c.textSecondary },

    // Log rows
    logRow: {
      flexDirection: 'row', alignItems: 'flex-start',
      paddingHorizontal: 14, paddingVertical: 12,
      borderTopWidth: 1, borderTopColor: c.separator,
    },
    logLeft:   { flex: 1 },
    logMeta:   { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    logBrand:  { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    logCategory:{ fontSize: 11, color: c.textMuted },
    logFlavor: { fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
    logBadgeRow:{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    logRating: { fontSize: 13, color: c.textSecondary },
    logRight:  { alignItems: 'flex-end', gap: 8 },
    logDate:   { fontSize: 12, color: c.textMuted },
    deleteIcon:{ fontSize: 14 },

    reactionBadge:    { backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#FCA5A5' },
    reactionBadgeText:{ fontSize: 11, fontWeight: '700', color: '#DC2626' },

    empty:     { fontSize: 13, color: c.textMuted, textAlign: 'center', padding: 20 },
    showMoreBtn:{ padding: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: c.separator },
    showMoreText:{ fontSize: 13, fontWeight: '700', color: c.honey },

    // Modal
    modalOverlay:  { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    modalSheet: {
      backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      maxHeight: '92%', flex: 1,
    },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.separator, alignSelf: 'center', marginTop: 12, marginBottom: 4 },

    modalTitleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
    backBtn:   { paddingRight: 8 },
    backBtnText: { fontSize: 16, color: c.honey, fontWeight: '700' },
    modalTitle:  { fontSize: 20, fontWeight: '900', color: c.textPrimary },
    stepLabel:   { fontSize: 12, color: c.textMuted, marginTop: 2 },
    stepDots:    { flexDirection: 'row', gap: 6 },
    dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: c.separator },

    fieldLabel: { fontSize: 12, fontWeight: '700', color: c.textSecondary, marginBottom: 8, marginTop: 4 },
    searchInput: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: c.inputBorder,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary, marginBottom: 8,
    },

    listItem:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12, marginBottom: 4, backgroundColor: c.bg, borderWidth: 1.5, borderColor: c.separator },
    listItemActive:   { backgroundColor: c.cardHoney, borderColor: c.honey },
    listItemText:     { fontSize: 14, color: c.textPrimary, flex: 1 },
    listItemTextActive: { fontWeight: '700', color: c.honey },
    listCheck:        { fontSize: 14, color: c.honey, fontWeight: '800', marginLeft: 8 },

    selectedBrandRow: { backgroundColor: c.cardHoney, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, borderWidth: 1.5, borderColor: c.honey },
    selectedBrandLabel: { fontSize: 15, fontWeight: '800', color: c.honey },

    catChip:         { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    catChipActive:   { backgroundColor: c.cardHoney, borderColor: c.honey },
    catChipText:     { fontSize: 12, color: c.textSecondary },
    catChipTextActive: { color: c.honey, fontWeight: '700' },

    // Step 3
    summaryBox:    { backgroundColor: c.cardHoney, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1.5, borderColor: c.honey },
    summaryBrand:  { fontSize: 12, fontWeight: '700', color: c.honey, marginBottom: 2 },
    summaryFlavor: { fontSize: 17, fontWeight: '800', color: c.textPrimary },

    ratingRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    ratingBtn: {
      flex: 1, alignItems: 'center', paddingVertical: 14,
      borderRadius: 14, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg,
    },
    ratingBtnActive: { borderWidth: 2 },
    ratingEmoji:   { fontSize: 26, marginBottom: 4 },
    ratingLabel:   { fontSize: 12, color: c.textSecondary, textAlign: 'center' },

    reactionBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      padding: 14, borderRadius: 14, borderWidth: 2, borderColor: c.separator,
      backgroundColor: c.bg, marginBottom: 4,
    },
    reactionBtnActive: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
    reactionBtnEmoji: { fontSize: 20 },
    reactionBtnText:  { flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary },
    reactionCheck:    { fontSize: 16, color: '#DC2626', fontWeight: '800' },

    notesInput: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: c.inputBorder,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: c.textPrimary,
      minHeight: 80, marginBottom: 12,
    },

    footer:     { paddingHorizontal: 20, paddingTop: 12, gap: 8, borderTopWidth: 1, borderTopColor: c.separator },
    nextBtn:    { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    nextBtnOff: { opacity: 0.4 },
    nextBtnText:{ fontSize: 16, fontWeight: '800', color: '#fff' },
    cancelBtn:  { alignItems: 'center', paddingVertical: 8 },
    cancelText: { fontSize: 14, color: c.textMuted, fontWeight: '600' },

    // Prep tip card (step 3)
    prepTipCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1.5, borderColor: '#86EFAC' },
    prepTipEmoji: { fontSize: 22 },
    prepTipTitle: { fontSize: 11, fontWeight: '800', color: '#15803D', marginBottom: 3 },
    prepTipText:  { fontSize: 12, color: '#166534', lineHeight: 17 },

    // Stage banner
    stageBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', borderTopWidth: 1, borderTopColor: '#BFDBFE', paddingHorizontal: 14, paddingVertical: 10 },
    stageBannerTitle:{ fontSize: 12, fontWeight: '800', color: '#1D4ED8' },
    stageBannerDesc: { fontSize: 12, color: '#3B82F6', flex: 1 },

    // Waiting period banner
    waitBanner:     { backgroundColor: '#FFFBEB', borderTopWidth: 1, borderTopColor: '#FDE68A', paddingHorizontal: 14, paddingVertical: 10 },
    waitBannerText: { fontSize: 12, color: '#92400E', lineHeight: 18 },

    // Loved foods
    lovedSection: { borderTopWidth: 1, borderTopColor: c.separator, paddingTop: 12, paddingBottom: 4 },
    lovedTitle:   { fontSize: 12, fontWeight: '700', color: c.textSecondary, paddingHorizontal: 14, marginBottom: 8 },
    lovedRow:     { paddingHorizontal: 14, gap: 8 },
    lovedChip:    { backgroundColor: '#FFF1F2', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderColor: '#FDA4AF', minWidth: 110 },
    lovedChipBrand: { fontSize: 10, fontWeight: '700', color: '#9F1239', marginBottom: 2 },
    lovedChipFlavor:{ fontSize: 12, fontWeight: '700', color: '#BE123C' },

    // Diversity chart
    diversitySection: { borderTopWidth: 1, borderTopColor: c.separator, paddingHorizontal: 14, paddingVertical: 12 },
    diversityTitle:   { fontSize: 12, fontWeight: '700', color: c.textSecondary, marginBottom: 10 },
    diversityRow:     { gap: 6 },
    diversityItem:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
    diversityEmoji:   { fontSize: 16, width: 24, textAlign: 'center' },
    diversityBarBg:   { flex: 1, height: 8, borderRadius: 4, backgroundColor: c.separator, overflow: 'hidden' },
    diversityBarFill: { height: 8, borderRadius: 4, minWidth: 4 },
    diversityCount:   { fontSize: 11, fontWeight: '700', color: c.textMuted, width: 20, textAlign: 'right' },

    // Portion picker
    portionRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    portionBtn:        { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    portionBtnActive:  { borderColor: c.honey, backgroundColor: c.cardHoney },
    portionBtnText:    { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
    portionBtnTextActive: { color: c.honey, fontWeight: '800' },

    // Try-again reminder
    tryAgainBox:         { backgroundColor: '#FFF7ED', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1.5, borderColor: '#FED7AA' },
    tryAgainTitle:       { fontSize: 13, fontWeight: '800', color: '#9A3412', marginBottom: 4 },
    tryAgainSub:         { fontSize: 11, color: '#C2410C', marginBottom: 12, lineHeight: 16 },
    tryAgainRow:         { flexDirection: 'row', gap: 8 },
    tryAgainChip:        { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#FED7AA', backgroundColor: '#fff' },
    tryAgainChipActive:  { backgroundColor: '#EA580C', borderColor: '#EA580C' },
    tryAgainChipText:    { fontSize: 12, fontWeight: '700', color: '#9A3412' },
    tryAgainChipTextActive: { color: '#fff' },

    // Header actions
    headerActions: { flexDirection: 'row', gap: 8 },
    scanBtn:       { backgroundColor: '#E0F2FE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderColor: '#38BDF8' },
    scanBtnText:   { fontSize: 13, fontWeight: '700', color: '#0284C7' },

    // Product info card (step 3 after scan)
    productInfoCard:  { backgroundColor: c.bg, borderRadius: 14, borderWidth: 1.5, borderColor: c.separator, padding: 14, marginBottom: 16, gap: 8 },
    productBadgeRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    organicBadge:     { backgroundColor: '#D1FAE5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#6EE7B7' },
    organicBadgeText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
    babyBadge:        { backgroundColor: '#DBEAFE', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#93C5FD' },
    babyBadgeText:    { fontSize: 12, fontWeight: '700', color: '#1E40AF' },
    gradeBadge:       { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    gradeBadgeText:   { fontSize: 12, fontWeight: '700', color: '#fff' },
    novaBadge:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    allergenRow:      { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
    allergenTitle:    { fontSize: 12, fontWeight: '800', color: '#DC2626' },
    allergenText:     { fontSize: 12, color: '#DC2626', flex: 1 },
    ingredientsText:  { fontSize: 11, color: c.textMuted, lineHeight: 16 },

    // Scanner overlay
    scanOverlay:    { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', padding: 20 },
    scanCloseBtn:   { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
    scanCloseTxt:   { color: '#fff', fontWeight: '700', fontSize: 15 },
    scanHintBox:    { alignItems: 'center', gap: 20, flex: 1, justifyContent: 'center' },
    scanFrame:      { width: 260, height: 160, borderRadius: 16, borderWidth: 3, borderColor: '#D97706', backgroundColor: 'transparent' },
    scanHint:       { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
    scanLookupBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
    scanLookupText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    // Scan result card
    scanResultCard:    { backgroundColor: 'rgba(17,24,39,0.92)', borderRadius: 20, padding: 16, gap: 14 },
    scanResultTop:     { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
    productImage:      { width: 70, height: 70, borderRadius: 12 },
    scanResultBrand:   { fontSize: 12, fontWeight: '700', color: '#9CA3AF', marginBottom: 2 },
    scanResultName:    { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 6 },
    scanBadgeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    scanAllergenText:  { fontSize: 12, color: '#FCA5A5', marginTop: 4 },
    scanResultActions: { gap: 8 },
    scanUseBtn:        { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    scanUseBtnText:    { color: '#fff', fontWeight: '800', fontSize: 16 },
    scanRetryBtn:      { alignItems: 'center', paddingVertical: 8 },
    scanRetryText:     { color: '#9CA3AF', fontWeight: '600', fontSize: 14 },
  });
}
