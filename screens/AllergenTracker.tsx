import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Alert, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors, Colors } from '../lib/theme';
import TrackerHeader from '../components/TrackerHeader';
import { useCollapsed } from '../lib/useCollapsed';
import { supabase } from '../lib/supabase';
import { safeUpsert, safeDelete } from '../lib/syncService';
import { autoFormatDate, parseDisplayDate, toDisplayDate, todayISO } from '../lib/dateUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Status   = 'not_tried' | 'introduced' | 'allergy' | 'watchlist';
type Severity = 'mild' | 'moderate' | 'severe';
type TabKey   = 'food' | 'other';

interface AllergenEntry {
  status: Status;
  dateIntroduced?: string;
  symptoms?: string[];
  reactionNotes?: string;
  severity?: Severity;
  lastGivenAt?: string;
}

interface CustomAllergen {
  id: string;
  name: string;
  emoji: string;
  tab: TabKey;
}

interface StoredData {
  entries: Record<string, AllergenEntry>;
  custom: CustomAllergen[];
}

interface Props {
  userId?: string | null;
  babyId?: string | null;
  babyBirthDate?: string | null;
}

// ─── Allergen definitions ─────────────────────────────────────────────────────

const FOOD_ALLERGENS = [
  {
    category: 'Major Food Allergens (Big 9)',
    items: [
      { id: 'milk',      emoji: '🥛', name: "Cow's Milk" },
      { id: 'eggs',      emoji: '🥚', name: 'Eggs' },
      { id: 'peanuts',   emoji: '🥜', name: 'Peanuts' },
      { id: 'treenuts',  emoji: '🌰', name: 'Tree Nuts' },
      { id: 'wheat',     emoji: '🌾', name: 'Wheat' },
      { id: 'soy',       emoji: '🫘', name: 'Soy' },
      { id: 'fish',      emoji: '🐟', name: 'Fish' },
      { id: 'shellfish', emoji: '🦐', name: 'Shellfish' },
      { id: 'sesame',    emoji: '🌿', name: 'Sesame' },
    ],
  },
  {
    category: 'Common Food Sensitivities',
    items: [
      { id: 'strawberry', emoji: '🍓', name: 'Strawberries' },
      { id: 'citrus',     emoji: '🍊', name: 'Citrus' },
      { id: 'stone',      emoji: '🍑', name: 'Stone Fruits' },
      { id: 'corn',       emoji: '🌽', name: 'Corn' },
      { id: 'berries',    emoji: '🫐', name: 'Other Berries' },
      { id: 'chocolate',  emoji: '🍫', name: 'Chocolate' },
      { id: 'tomato',     emoji: '🍅', name: 'Tomatoes' },
      { id: 'avocado',    emoji: '🥑', name: 'Avocado' },
    ],
  },
] as const;

const OTHER_ALLERGENS = [
  {
    category: 'Environmental',
    items: [
      { id: 'cat_dander',   emoji: '🐱', name: 'Cat Dander' },
      { id: 'dog_dander',   emoji: '🐶', name: 'Dog Dander' },
      { id: 'dust_mites',   emoji: '🧹', name: 'Dust Mites' },
      { id: 'grass_pollen', emoji: '🌱', name: 'Grass Pollen' },
      { id: 'tree_pollen',  emoji: '🌳', name: 'Tree Pollen' },
      { id: 'weed_pollen',  emoji: '🌾', name: 'Weed Pollen' },
      { id: 'mold',         emoji: '🍄', name: 'Mold Spores' },
    ],
  },
  {
    category: 'Insect',
    items: [
      { id: 'bee',      emoji: '🐝', name: 'Bee Stings' },
      { id: 'wasp',     emoji: '🐛', name: 'Wasp Stings' },
      { id: 'fire_ant', emoji: '🐜', name: 'Fire Ant Stings' },
    ],
  },
  {
    category: 'Contact & Other',
    items: [
      { id: 'latex',     emoji: '🧤', name: 'Latex' },
      { id: 'nickel',    emoji: '⚙️',  name: 'Nickel' },
      { id: 'fragrance', emoji: '🌸', name: 'Fragrances / Perfume' },
    ],
  },
] as const;

// ─── Status / severity / symptoms config ──────────────────────────────────────

const STATUS: Record<Status, { label: string; bg: string; border: string; text: string }> = {
  not_tried:  { label: 'Not tried', bg: '#F3F4F6', border: '#D1D5DB', text: '#6B7280' },
  introduced: { label: 'Safe ✓',   bg: '#D1FAE5', border: '#059669', text: '#065F46' },
  allergy:    { label: 'Allergy',  bg: '#FEE2E2', border: '#EF4444', text: '#991B1B' },
  watchlist:  { label: 'Watching', bg: '#FEF3C7', border: '#D97706', text: '#92400E' },
};

const SEVERITY: Record<Severity, { label: string; color: string }> = {
  mild:     { label: 'Mild',     color: '#D97706' },
  moderate: { label: 'Moderate', color: '#EA580C' },
  severe:   { label: 'Severe',   color: '#EF4444' },
};

const SYMPTOM_OPTIONS = [
  { key: 'hives',       label: 'Hives',       emoji: '🔴' },
  { key: 'rash',        label: 'Rash',        emoji: '🟠' },
  { key: 'vomiting',    label: 'Vomiting',    emoji: '🤢' },
  { key: 'diarrhea',    label: 'Diarrhea',    emoji: '💧' },
  { key: 'swelling',    label: 'Swelling',    emoji: '😶' },
  { key: 'coughing',    label: 'Coughing',    emoji: '😷' },
  { key: 'wheezing',    label: 'Wheezing',    emoji: '💨' },
  { key: 'itching',     label: 'Itching',     emoji: '🖐️' },
  { key: 'runny_nose',  label: 'Runny nose',  emoji: '🤧' },
  { key: 'anaphylaxis', label: 'Anaphylaxis', emoji: '🚨' },
];

const STORAGE_KEY = '@village_allergen_tracker_v2';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysAgo(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate + 'T00:00:00').getTime()) / 86_400_000);
}

function relativeAge(isoDate: string): string {
  const d = daysAgo(isoDate);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7)   return `${d} days ago`;
  if (d < 14)  return '1 week ago';
  if (d < 30)  return `${Math.floor(d / 7)} weeks ago`;
  return `${Math.floor(d / 30)} month${Math.floor(d / 30) > 1 ? 's' : ''} ago`;
}

function getBuiltinInfo(id: string): { name: string; emoji: string; tab: TabKey } | null {
  for (const g of FOOD_ALLERGENS) {
    const item = (g.items as readonly { id: string; emoji: string; name: string }[]).find(i => i.id === id);
    if (item) return { name: item.name, emoji: item.emoji, tab: 'food' };
  }
  for (const g of OTHER_ALLERGENS) {
    const item = (g.items as readonly { id: string; emoji: string; name: string }[]).find(i => i.id === id);
    if (item) return { name: item.name, emoji: item.emoji, tab: 'other' };
  }
  return null;
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

interface DbRow {
  allergen_id: string;
  allergen_name: string;
  allergen_emoji: string;
  allergen_tab: string;
  is_custom: boolean;
  status: string;
  date_introduced: string | null;
  symptoms: string | null;
  reaction_notes: string | null;
  severity: string | null;
  last_given_at: string | null;
}

function rowToEntry(r: DbRow): AllergenEntry {
  return {
    status: r.status as Status,
    dateIntroduced: r.date_introduced ?? undefined,
    symptoms: r.symptoms ? r.symptoms.split(',').filter(Boolean) : undefined,
    reactionNotes: r.reaction_notes ?? undefined,
    severity: r.severity as Severity | undefined,
    lastGivenAt: r.last_given_at ?? undefined,
  };
}

async function loadSupabase(babyId: string): Promise<{ entries: Record<string, AllergenEntry>; custom: CustomAllergen[] } | null> {
  try {
    const { data, error } = await (supabase.from('allergen_records') as any)
      .select('allergen_id,allergen_name,allergen_emoji,allergen_tab,is_custom,status,date_introduced,symptoms,reaction_notes,severity,last_given_at')
      .eq('baby_id', babyId);
    if (error || !data) return null;
    const entries: Record<string, AllergenEntry> = {};
    const custom: CustomAllergen[] = [];
    for (const r of data as DbRow[]) {
      entries[r.allergen_id] = rowToEntry(r);
      if (r.is_custom) {
        custom.push({ id: r.allergen_id, name: r.allergen_name, emoji: r.allergen_emoji, tab: r.allergen_tab as TabKey });
      }
    }
    return { entries, custom };
  } catch {
    return null;
  }
}

async function upsertSupabase(
  userId: string, babyId: string,
  allergenId: string, allergenName: string, allergenEmoji: string, allergenTab: TabKey, isCustom: boolean,
  entry: AllergenEntry,
) {
  try {
    await safeUpsert('allergen_records', {
      user_id: userId,
      baby_id: babyId,
      allergen_id: allergenId,
      allergen_name: allergenName,
      allergen_emoji: allergenEmoji,
      allergen_tab: allergenTab,
      is_custom: isCustom,
      status: entry.status,
      date_introduced: entry.dateIntroduced ?? null,
      symptoms: entry.symptoms?.filter(Boolean).join(',') ?? null,
      reaction_notes: entry.reactionNotes ?? null,
      severity: entry.severity ?? null,
      last_given_at: entry.lastGivenAt ?? null,
      updated_at: new Date().toISOString(),
    }, 'baby_id,allergen_id');
  } catch {}
}

async function deleteSupabase(babyId: string, allergenId: string) {
  try {
    await safeDelete('allergen_records', { baby_id: babyId, allergen_id: allergenId });
  } catch {}
}

// ─── Age-based allergen suggestions ──────────────────────────────────────────

function getAgeSuggestions(babyBirthDate: string | null | undefined, entries: Record<string, AllergenEntry>) {
  if (!babyBirthDate) return null;
  const months = (Date.now() - new Date(babyBirthDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (months < 4) return null;

  const notTriedBig9 = (FOOD_ALLERGENS[0].items as readonly { id: string; emoji: string; name: string }[])
    .filter(item => !entries[item.id] || entries[item.id].status === 'not_tried');
  if (notTriedBig9.length === 0) return null;

  let headline: string;
  let sub: string;
  if (months < 6) {
    headline = `Starting solids soon? (${Math.floor(months)}mo)`;
    sub = 'The 6–8 month window is ideal for introducing the Big 9. Early introduction reduces allergy risk!';
  } else if (months < 9) {
    headline = `Prime allergen intro window! (${Math.floor(months)}mo)`;
    sub = 'Introduce one allergen every 3–5 days and watch for reactions. These haven\'t been tried yet:';
  } else {
    headline = `Still haven't tried these? (${Math.floor(months)}mo)`;
    sub = 'It\'s still safe to introduce allergens. Consult your pediatrician if concerned.';
  }
  return { headline, sub, items: notTriedBig9.slice(0, 5) };
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({
  name, emoji, entry,
  onSave, onClose, onLogGivenToday,
}: {
  name: string; emoji: string; entry: AllergenEntry;
  onSave: (e: AllergenEntry) => void;
  onClose: () => void;
  onLogGivenToday: () => void;
}) {
  const c = useColors();
  const s = modalStyles(c);
  const [status,   setStatus]   = useState<Status>(entry.status);
  const [dateText, setDateText] = useState(entry.dateIntroduced ? toDisplayDate(entry.dateIntroduced) : '');
  const [symptoms, setSymptoms] = useState<string[]>(entry.symptoms ?? []);
  const [notes,    setNotes]    = useState(entry.reactionNotes ?? '');
  const [severity, setSeverity] = useState<Severity | undefined>(entry.severity);

  function toggleSymptom(key: string) {
    setSymptoms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function save() {
    const parsed = dateText.trim() ? parseDisplayDate(dateText.trim()) : null;
    if (dateText.trim() && !parsed) {
      Alert.alert('Invalid date', 'Use MM/DD/YYYY format, e.g. 06/01/2025');
      return;
    }
    onSave({
      status,
      dateIntroduced: parsed ?? undefined,
      symptoms: (status === 'allergy' || status === 'watchlist') ? symptoms : undefined,
      reactionNotes:  notes.trim() || undefined,
      severity:       status === 'allergy' ? severity : undefined,
      lastGivenAt:    entry.lastGivenAt,
    });
  }

  const showReactionFields = status === 'allergy' || status === 'watchlist';

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={s.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{emoji} {name}</Text>
          <TouchableOpacity onPress={save} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="Save">
            <Text style={s.saveBtn}>Save</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

            {/* Status chips */}
            <Text style={s.label}>Status</Text>
            <View style={s.statusRow}>
              {(['not_tried', 'introduced', 'watchlist', 'allergy'] as Status[]).map(st => {
                const cfg = STATUS[st];
                return (
                  <TouchableOpacity
                    key={st}
                    style={[s.statusChip, { backgroundColor: cfg.bg, borderColor: cfg.border, opacity: status === st ? 1 : 0.4 }]}
                    onPress={() => setStatus(st)}
                    accessibilityRole="button" accessibilityLabel={cfg.label}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.statusChipText, { color: cfg.text }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Severity (allergy only) */}
            {status === 'allergy' && (
              <>
                <Text style={s.label}>Reaction severity</Text>
                <View style={s.severityRow}>
                  {(['mild', 'moderate', 'severe'] as Severity[]).map(sev => {
                    const cfg = SEVERITY[sev];
                    const active = severity === sev;
                    return (
                      <TouchableOpacity
                        key={sev}
                        style={[s.sevChip, { borderColor: cfg.color, backgroundColor: active ? cfg.color : 'transparent' }]}
                        onPress={() => setSeverity(sev)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.sevChipText, { color: active ? '#fff' : cfg.color }]}>{cfg.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Symptom chips (allergy / watchlist) */}
            {showReactionFields && (
              <>
                <Text style={s.label}>Symptoms observed</Text>
                <View style={s.symptomGrid}>
                  {SYMPTOM_OPTIONS.map(opt => {
                    const active = symptoms.includes(opt.key);
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[s.symptomChip, active && s.symptomChipActive]}
                        onPress={() => toggleSymptom(opt.key)}
                        activeOpacity={0.75}
                      >
                        <Text style={s.symptomEmoji}>{opt.emoji}</Text>
                        <Text style={[s.symptomLabel, active && s.symptomLabelActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Date introduced */}
            <Text style={s.label}>Date first introduced</Text>
            <TextInput
              style={s.input}
              value={dateText}
              onChangeText={v => setDateText(autoFormatDate(v, dateText))}
              placeholder="MM/DD/YYYY"
              placeholderTextColor={c.textMuted}
              keyboardType="numeric"
              maxLength={10}
              returnKeyType="done"
            />

            {/* Log given today (introduced items only) */}
            {status === 'introduced' && (
              <TouchableOpacity
                style={s.logGivenBtn}
                onPress={() => { onLogGivenToday(); onClose(); }}
                activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel="Log given today"
              >
                <Text style={s.logGivenText}>✓ Log given today</Text>
              </TouchableOpacity>
            )}

            {/* Notes */}
            <Text style={s.label}>{status === 'allergy' ? 'Reaction notes' : 'Notes'}</Text>
            <TextInput
              style={[s.input, s.multiInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder={
                status === 'allergy'
                  ? 'Describe the reaction, onset time, what you did…'
                  : 'Any observations, context, or reminders…'
              }
              placeholderTextColor={c.textMuted}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Add custom allergen modal ─────────────────────────────────────────────────

function AddCustomModal({
  tab, onAdd, onClose,
}: {
  tab: TabKey; onAdd: (c: CustomAllergen) => void; onClose: () => void;
}) {
  const c = useColors();
  const s = modalStyles(c);
  const [name,  setName]  = useState('');
  const [emoji, setEmoji] = useState('');

  function add() {
    const n = name.trim();
    if (!n) { Alert.alert('Name required', 'Please enter an allergen name.'); return; }
    onAdd({ id: `custom_${Date.now()}`, name: n, emoji: emoji.trim() || '❓', tab });
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={s.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add {tab === 'food' ? 'Food' : 'Other'} Allergen</Text>
          <TouchableOpacity onPress={add} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="Add">
            <Text style={s.saveBtn}>Add</Text>
          </TouchableOpacity>
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>Name</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder={tab === 'food' ? 'e.g. Mustard, Kiwi…' : 'e.g. Cockroach, Wool…'}
              placeholderTextColor={c.textMuted}
              autoFocus
              returnKeyType="next"
            />
            <Text style={s.label}>Emoji (optional)</Text>
            <TextInput
              style={s.input}
              value={emoji}
              onChangeText={setEmoji}
              placeholder="e.g. 🥭"
              placeholderTextColor={c.textMuted}
              returnKeyType="done"
              onSubmitEditing={add}
            />
            <Text style={[s.label, { marginTop: 4, color: c.textMuted, fontWeight: '500', fontSize: 12 }]}>
              Leave emoji blank and ❓ will be used.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Allergen row ─────────────────────────────────────────────────────────────

function AllergenRow({
  id, emoji, name, entry,
  onPress, onDelete,
}: {
  id: string; emoji: string; name: string; entry: AllergenEntry;
  onPress: () => void; onDelete?: () => void;
}) {
  const c = useColors();
  const s = rowStyles(c);
  const cfg = STATUS[entry.status];

  const reExposureInfo = useMemo(() => {
    if (entry.status !== 'introduced') return null;
    const refDate = entry.lastGivenAt ?? entry.dateIntroduced;
    if (!refDate) return null;
    const d = daysAgo(refDate);
    const label = `Last given: ${relativeAge(refDate)}`;
    if (d < 7)  return { label, color: '#059669' };
    if (d < 14) return { label: label + ' ⚠️', color: '#D97706' };
    return { label: label + ' — reintroduce soon!', color: '#EF4444' };
  }, [entry.status, entry.lastGivenAt, entry.dateIntroduced]);

  const symptomLine = entry.symptoms?.length
    ? entry.symptoms.map(k => SYMPTOM_OPTIONS.find(o => o.key === k)?.emoji ?? '').join(' ')
    : null;

  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.75}
      accessibilityRole="button" accessibilityLabel={`${name} allergen details`}>
      <Text style={s.emoji}>{emoji}</Text>
      <View style={s.body}>
        <Text style={s.name}>{name}</Text>
        {entry.dateIntroduced && entry.status !== 'introduced'
          ? <Text style={s.date}>{formatDate(entry.dateIntroduced)}</Text>
          : null}
        {reExposureInfo
          ? <Text style={[s.reExposure, { color: reExposureInfo.color }]}>{reExposureInfo.label}</Text>
          : null}
        {entry.status === 'allergy' && entry.severity
          ? <Text style={[s.severity, { color: SEVERITY[entry.severity].color }]}>{SEVERITY[entry.severity].label} reaction</Text>
          : null}
        {symptomLine
          ? <Text style={s.symptoms}>{symptomLine}</Text>
          : null}
        {entry.reactionNotes
          ? <Text style={s.notes} numberOfLines={1}>{entry.reactionNotes}</Text>
          : null}
      </View>
      <View style={s.badgeWrap}>
        <View style={[s.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={[s.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
        </View>
        {onDelete && (
          <TouchableOpacity
            onPress={() => Alert.alert('Remove allergen', `Remove "${name}" from your list?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: onDelete },
            ])}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={s.deleteBtn}
            accessibilityRole="button" accessibilityLabel={`Remove ${name}`}
          >
            <Text style={s.deleteX}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AllergenTracker({ userId, babyId, babyBirthDate }: Props) {
  const c = useColors();
  const s = styles(c);

  const [collapsed, toggleCollapsed] = useCollapsed('allergen_collapsed');
  const [tab,           setTab]           = useState<TabKey>('food');
  const [statusFilter,  setStatusFilter]  = useState<Status | 'all'>('all');
  const [entries,       setEntries]       = useState<Record<string, AllergenEntry>>({});
  const [custom,        setCustom]        = useState<CustomAllergen[]>([]);
  const [loaded,        setLoaded]        = useState(false);
  const [syncing,       setSyncing]       = useState(false);
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setSyncing(true);

      if (babyId) {
        // Try Supabase first
        const result = await loadSupabase(babyId);
        if (result && Object.keys(result.entries).length > 0) {
          setEntries(result.entries);
          setCustom(result.custom);
          setLoaded(true);
          setSyncing(false);
          return;
        }
        // Supabase empty — try migrating from AsyncStorage
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (raw && userId) {
            const d: StoredData = JSON.parse(raw);
            setEntries(d.entries ?? {});
            setCustom(d.custom ?? []);
            // Migrate to Supabase in background
            if (Object.keys(d.entries ?? {}).length > 0) {
              migrateToSupabase(userId, babyId, d.entries ?? {}, d.custom ?? []);
            }
            setLoaded(true);
            setSyncing(false);
            return;
          }
        } catch {}
      } else {
        // No babyId — use AsyncStorage only
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (raw) {
            const d: StoredData = JSON.parse(raw);
            setEntries(d.entries ?? {});
            setCustom(d.custom ?? []);
          }
        } catch {}
      }

      setLoaded(true);
      setSyncing(false);
    }
    load();
  }, [babyId, userId]);

  async function migrateToSupabase(uid: string, bid: string, ents: Record<string, AllergenEntry>, cust: CustomAllergen[]) {
    for (const [id, entry] of Object.entries(ents)) {
      const builtin = getBuiltinInfo(id);
      const custAllergen = cust.find(c => c.id === id);
      if (builtin) {
        await upsertSupabase(uid, bid, id, builtin.name, builtin.emoji, builtin.tab, false, entry);
      } else if (custAllergen) {
        await upsertSupabase(uid, bid, id, custAllergen.name, custAllergen.emoji, custAllergen.tab, true, entry);
      }
    }
    // Migrate custom allergens that have no entry yet
    for (const ca of cust) {
      if (!ents[ca.id]) {
        await upsertSupabase(uid, bid, ca.id, ca.name, ca.emoji, ca.tab, true, { status: 'not_tried' });
      }
    }
  }

  // ── Persist ─────────────────────────────────────────────────────────────────

  const persist = useCallback((nextEntries: Record<string, AllergenEntry>, nextCustom: CustomAllergen[]) => {
    if (!babyId) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: nextEntries, custom: nextCustom }));
    }
  }, [babyId]);

  function getEntry(id: string): AllergenEntry {
    return entries[id] ?? { status: 'not_tried' };
  }

  function saveEntry(id: string, updated: AllergenEntry) {
    const next = { ...entries, [id]: updated };
    setEntries(next);
    persist(next, custom);
    setEditingId(null);

    if (userId && babyId) {
      const builtin = getBuiltinInfo(id);
      const custAllergen = custom.find(c => c.id === id);
      if (builtin) {
        upsertSupabase(userId, babyId, id, builtin.name, builtin.emoji, builtin.tab, false, updated);
      } else if (custAllergen) {
        upsertSupabase(userId, babyId, id, custAllergen.name, custAllergen.emoji, custAllergen.tab, true, updated);
      }
    }
  }

  function logGivenToday(id: string) {
    const current = getEntry(id);
    const updated: AllergenEntry = { ...current, lastGivenAt: todayISO() };
    saveEntry(id, updated);
  }

  function addCustom(ca: CustomAllergen) {
    const next = [...custom, ca];
    setCustom(next);
    persist(entries, next);
    setShowAddCustom(false);
    // Upsert the custom allergen to Supabase with default entry
    if (userId && babyId) {
      upsertSupabase(userId, babyId, ca.id, ca.name, ca.emoji, ca.tab, true, { status: 'not_tried' });
    }
    setEditingId(ca.id);
  }

  function removeCustom(id: string) {
    const nextCustom  = custom.filter(c => c.id !== id);
    const nextEntries = { ...entries };
    delete nextEntries[id];
    setCustom(nextCustom);
    setEntries(nextEntries);
    persist(nextEntries, nextCustom);
    if (babyId) deleteSupabase(babyId, id);
  }

  // ── Summary counts ──────────────────────────────────────────────────────────

  const allIds = [
    ...FOOD_ALLERGENS.flatMap(g => g.items.map(i => i.id)),
    ...OTHER_ALLERGENS.flatMap(g => g.items.map(i => i.id)),
    ...custom.map(c => c.id),
  ];
  const counts = { not_tried: 0, introduced: 0, allergy: 0, watchlist: 0 };
  for (const id of allIds) counts[getEntry(id).status]++;

  // ── Known allergies banner ──────────────────────────────────────────────────

  const knownAllergies = useMemo(() => {
    const result: { id: string; name: string; emoji: string; entry: AllergenEntry }[] = [];
    for (const g of [...FOOD_ALLERGENS, ...OTHER_ALLERGENS]) {
      for (const item of (g.items as readonly { id: string; emoji: string; name: string }[])) {
        const e = entries[item.id];
        if (e?.status === 'allergy') result.push({ id: item.id, name: item.name, emoji: item.emoji, entry: e });
      }
    }
    for (const ca of custom) {
      const e = entries[ca.id];
      if (e?.status === 'allergy') result.push({ id: ca.id, name: ca.name, emoji: ca.emoji, entry: e });
    }
    return result;
  }, [entries, custom]);

  // ── Age-based suggestions ───────────────────────────────────────────────────

  const ageSuggestions = useMemo(
    () => getAgeSuggestions(babyBirthDate, entries),
    [babyBirthDate, entries],
  );

  // ── Resolve editing allergen ────────────────────────────────────────────────

  const editingAllergen = editingId
    ? (() => {
        for (const g of [...FOOD_ALLERGENS, ...OTHER_ALLERGENS]) {
          const found = (g.items as readonly { id: string; emoji: string; name: string }[]).find(i => i.id === editingId);
          if (found) return found;
        }
        return custom.find(c => c.id === editingId) ?? null;
      })()
    : null;

  if (!loaded) return (
    <View style={{ paddingVertical: 24, alignItems: 'center' }}>
      <ActivityIndicator size="small" color={c.primary} />
    </View>
  );

  const foodCustom  = custom.filter(c => c.tab === 'food');
  const otherCustom = custom.filter(c => c.tab === 'other');

  function filterItems(items: readonly { id: string; emoji: string; name: string }[]) {
    if (statusFilter === 'all') return items;
    return items.filter(item => getEntry(item.id).status === statusFilter);
  }

  return (
    <View style={s.container}>
      {/* ── Section header ── */}
      <View style={{ marginBottom: collapsed ? 0 : 14 }}>
        <TrackerHeader
          emoji="🚨" title="Allergen Tracker"
          collapsed={collapsed} onToggle={toggleCollapsed}
          accentBg={c.cardBlush} accentColor={c.blush}
        />
      </View>

      {!collapsed && (
        <>
          {/* ── Summary chips ── */}
          <View style={s.summaryRow}>
            {(Object.keys(STATUS) as Status[]).map(st => {
              const cfg = STATUS[st];
              return (
                <TouchableOpacity
                  key={st}
                  style={[s.summaryChip, { backgroundColor: cfg.bg, borderColor: cfg.border },
                    statusFilter === st && s.summaryChipActive]}
                  onPress={() => setStatusFilter(statusFilter === st ? 'all' : st)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.summaryCount, { color: cfg.text }]}>{counts[st]}</Text>
                  <Text style={[s.summaryLabel, { color: cfg.text }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Tap-to-filter hint ── */}
          {statusFilter !== 'all' && (
            <TouchableOpacity style={s.filterClearRow} onPress={() => setStatusFilter('all')} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel="Clear filter">
              <Text style={s.filterClearText}>Showing: {STATUS[statusFilter].label}  ✕ Clear</Text>
            </TouchableOpacity>
          )}

          {/* ── Allergy banner ── */}
          {knownAllergies.length > 0 && (
            <View style={s.allergyBanner}>
              <Text style={s.allergyBannerTitle}>⚠️ Known Allergies</Text>
              <View style={s.allergyBannerChips}>
                {knownAllergies.map(a => (
                  <TouchableOpacity
                    key={a.id}
                    style={s.allergyBannerChip}
                    onPress={() => setEditingId(a.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.allergyBannerChipText}>
                      {a.emoji} {a.name}{a.entry.severity ? ` · ${SEVERITY[a.entry.severity].label}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── Tab strip ── */}
          <View style={s.tabStrip}>
            {(['food', 'other'] as TabKey[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[s.tabBtn, tab === t && s.tabBtnActive]}
                onPress={() => setTab(t)}
                accessibilityRole="button" accessibilityLabel={t === 'food' ? 'Food allergens' : 'Other allergens'}
                activeOpacity={0.75}
              >
                <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>
                  {t === 'food' ? '🍽  Food' : '🌿  Environmental & Other'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Food tab ── */}
          {tab === 'food' && (
            <>
              {/* Age-based suggestions */}
              {ageSuggestions && statusFilter === 'all' && (
                <View style={s.ageBanner}>
                  <Text style={s.ageBannerTitle}>💡 {ageSuggestions.headline}</Text>
                  <Text style={s.ageBannerSub}>{ageSuggestions.sub}</Text>
                  <View style={s.ageBannerChips}>
                    {ageSuggestions.items.map(item => (
                      <TouchableOpacity
                        key={item.id}
                        style={s.ageBannerChip}
                        onPress={() => setEditingId(item.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={s.ageBannerChipText}>{item.emoji} {item.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {FOOD_ALLERGENS.map(group => {
                const filtered = filterItems(group.items);
                if (filtered.length === 0) return null;
                return (
                  <View key={group.category} style={s.group}>
                    <Text style={s.catLabel}>{group.category}</Text>
                    {filtered.map(a => (
                      <AllergenRow
                        key={a.id}
                        id={a.id} emoji={a.emoji} name={a.name}
                        entry={getEntry(a.id)}
                        onPress={() => setEditingId(a.id)}
                      />
                    ))}
                  </View>
                );
              })}

              {foodCustom.length > 0 && (() => {
                const filtered = filterItems(foodCustom);
                if (filtered.length === 0) return null;
                return (
                  <View style={s.group}>
                    <Text style={s.catLabel}>My Custom Food Allergens</Text>
                    {filtered.map(a => (
                      <AllergenRow
                        key={a.id}
                        id={a.id} emoji={a.emoji} name={a.name}
                        entry={getEntry(a.id)}
                        onPress={() => setEditingId(a.id)}
                        onDelete={() => removeCustom(a.id)}
                      />
                    ))}
                  </View>
                );
              })()}

              <TouchableOpacity style={s.addBtn} onPress={() => setShowAddCustom(true)} activeOpacity={0.75}
                accessibilityRole="button" accessibilityLabel="Add food allergen">
                <Text style={s.addBtnText}>+ Add food allergen</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Other tab ── */}
          {tab === 'other' && (
            <>
              {OTHER_ALLERGENS.map(group => {
                const filtered = filterItems(group.items);
                if (filtered.length === 0) return null;
                return (
                  <View key={group.category} style={s.group}>
                    <Text style={s.catLabel}>{group.category}</Text>
                    {filtered.map(a => (
                      <AllergenRow
                        key={a.id}
                        id={a.id} emoji={a.emoji} name={a.name}
                        entry={getEntry(a.id)}
                        onPress={() => setEditingId(a.id)}
                      />
                    ))}
                  </View>
                );
              })}

              {otherCustom.length > 0 && (() => {
                const filtered = filterItems(otherCustom);
                if (filtered.length === 0) return null;
                return (
                  <View style={s.group}>
                    <Text style={s.catLabel}>My Custom Allergens</Text>
                    {filtered.map(a => (
                      <AllergenRow
                        key={a.id}
                        id={a.id} emoji={a.emoji} name={a.name}
                        entry={getEntry(a.id)}
                        onPress={() => setEditingId(a.id)}
                        onDelete={() => removeCustom(a.id)}
                      />
                    ))}
                  </View>
                );
              })()}

              <TouchableOpacity style={s.addBtn} onPress={() => setShowAddCustom(true)} activeOpacity={0.75}
                accessibilityRole="button" accessibilityLabel="Add allergen">
                <Text style={s.addBtnText}>+ Add allergen</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={s.disclaimer}>
            <Text style={s.disclaimerText}>
              ⚕️ Consult your pediatrician before introducing allergenic foods, especially with a family history of food allergies or existing eczema.
            </Text>
          </View>
        </>
      )}

      {/* ── Modals ── */}
      {editingAllergen && (
        <DetailModal
          name={editingAllergen.name}
          emoji={editingAllergen.emoji}
          entry={getEntry(editingAllergen.id)}
          onSave={updated => saveEntry(editingAllergen.id, updated)}
          onClose={() => setEditingId(null)}
          onLogGivenToday={() => logGivenToday(editingAllergen.id)}
        />
      )}

      {showAddCustom && (
        <AddCustomModal
          tab={tab}
          onAdd={addCustom}
          onClose={() => setShowAddCustom(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (c: Colors) =>
  StyleSheet.create({
    container: { marginBottom: 16 },

    summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
    summaryChip: {
      flex: 1, minWidth: 72, borderRadius: 12, borderWidth: 1.5,
      paddingVertical: 9, paddingHorizontal: 6, alignItems: 'center',
    },
    summaryChipActive: { borderWidth: 3 },
    summaryCount: { fontSize: 18, fontWeight: '800' },
    summaryLabel: { fontSize: 10, fontWeight: '700', marginTop: 2, textAlign: 'center' },

    filterClearRow: { alignItems: 'center', paddingVertical: 6, marginBottom: 8 },
    filterClearText: { fontSize: 12, fontWeight: '700', color: c.primary },

    allergyBanner: {
      backgroundColor: '#FEF2F2', borderRadius: 14, borderWidth: 1.5, borderColor: '#FCA5A5',
      padding: 14, marginBottom: 14,
    },
    allergyBannerTitle: { fontSize: 13, fontWeight: '800', color: '#991B1B', marginBottom: 8 },
    allergyBannerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    allergyBannerChip:  { backgroundColor: '#FEE2E2', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#EF4444' },
    allergyBannerChipText: { fontSize: 13, fontWeight: '700', color: '#991B1B' },

    ageBanner: {
      backgroundColor: '#EFF6FF', borderRadius: 14, borderWidth: 1.5, borderColor: '#BFDBFE',
      padding: 14, marginBottom: 14,
    },
    ageBannerTitle:  { fontSize: 13, fontWeight: '800', color: '#1D4ED8', marginBottom: 4 },
    ageBannerSub:    { fontSize: 12, color: '#3B82F6', fontWeight: '500', marginBottom: 10, lineHeight: 17 },
    ageBannerChips:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    ageBannerChip:   { backgroundColor: '#DBEAFE', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#93C5FD' },
    ageBannerChipText: { fontSize: 13, fontWeight: '700', color: '#1D4ED8' },

    tabStrip: {
      flexDirection: 'row', backgroundColor: c.bgAlt,
      borderRadius: 12, padding: 4, marginBottom: 20, gap: 4,
    },
    tabBtn:       { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 9, alignItems: 'center' },
    tabBtnActive: { backgroundColor: c.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    tabLabel:     { fontSize: 13, fontWeight: '700', color: c.textMuted },
    tabLabelActive: { color: c.textPrimary },

    group:    { marginBottom: 18 },
    catLabel: {
      fontSize: 11, fontWeight: '800', color: c.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
    },

    addBtn:     { borderWidth: 1.5, borderColor: c.primary, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
    addBtnText: { fontSize: 14, fontWeight: '700', color: c.primary },

    disclaimer:     { backgroundColor: c.cardBlue, borderRadius: 12, padding: 14, marginTop: 4 },
    disclaimerText: { fontSize: 12, color: c.textSecondary, fontWeight: '500', lineHeight: 18 },
  });

const rowStyles = (c: Colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.card, borderRadius: 12, padding: 12,
      marginBottom: 7, gap: 10, borderWidth: 1, borderColor: c.separator,
    },
    emoji:      { fontSize: 22 },
    body:       { flex: 1, gap: 2 },
    name:       { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    date:       { fontSize: 11, color: c.textMuted, fontWeight: '500' },
    reExposure: { fontSize: 11, fontWeight: '700' },
    severity:   { fontSize: 11, fontWeight: '700' },
    symptoms:   { fontSize: 13, marginTop: 2 },
    notes:      { fontSize: 11, color: c.textMuted, fontWeight: '500' },
    badgeWrap:  { alignItems: 'flex-end', gap: 4 },
    badge:      { borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 4 },
    badgeText:  { fontSize: 10, fontWeight: '800' },
    deleteBtn:  { paddingHorizontal: 4 },
    deleteX:    { fontSize: 12, color: c.textMuted, fontWeight: '700' },
  });

const modalStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    cancel:      { fontSize: 16, color: c.textMuted, fontWeight: '600' },
    saveBtn:     { fontSize: 16, color: c.primary, fontWeight: '800' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    body:        { padding: 20, gap: 10, paddingBottom: 48 },
    label:       { fontSize: 13, fontWeight: '800', color: c.textMuted, marginTop: 8 },

    statusRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusChip:    { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8 },
    statusChipText:{ fontSize: 13, fontWeight: '800' },

    severityRow:  { flexDirection: 'row', gap: 8 },
    sevChip:      { flex: 1, borderRadius: 10, borderWidth: 2, paddingVertical: 10, alignItems: 'center' },
    sevChipText:  { fontSize: 13, fontWeight: '800' },

    symptomGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    symptomChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    symptomChipActive: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
    symptomEmoji:      { fontSize: 14 },
    symptomLabel:      { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    symptomLabelActive:{ color: '#92400E', fontWeight: '800' },

    logGivenBtn: {
      backgroundColor: '#D1FAE5', borderRadius: 12, paddingVertical: 12,
      alignItems: 'center', marginVertical: 4, borderWidth: 1.5, borderColor: '#059669',
    },
    logGivenText: { fontSize: 14, fontWeight: '800', color: '#065F46' },

    input: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1, borderColor: c.inputBorder,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary, fontWeight: '500',
    },
    multiInput: { minHeight: 88, paddingTop: 12 },
  });
