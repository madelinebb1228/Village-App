import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors, Colors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Status   = 'not_tried' | 'introduced' | 'allergy' | 'watchlist';
type Severity = 'mild' | 'moderate' | 'severe';
type TabKey   = 'food' | 'other';

interface AllergenEntry {
  status: Status;
  dateIntroduced?: string;
  reactionNotes?: string;
  severity?: Severity;
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

// ─── Built-in allergen definitions ───────────────────────────────────────────

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

// ─── Status config ────────────────────────────────────────────────────────────

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

const STORAGE_KEY = '@village_allergen_tracker_v2';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({
  name, emoji, entry,
  onSave, onClose,
}: {
  name: string; emoji: string; entry: AllergenEntry;
  onSave: (e: AllergenEntry) => void; onClose: () => void;
}) {
  const c = useColors();
  const s = modalStyles(c);
  const [status,   setStatus]   = useState<Status>(entry.status);
  const [dateText, setDateText] = useState(entry.dateIntroduced ?? '');
  const [notes,    setNotes]    = useState(entry.reactionNotes ?? '');
  const [severity, setSeverity] = useState<Severity | undefined>(entry.severity);

  function save() {
    if (dateText.trim() && isNaN(new Date(dateText.trim()).getTime())) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format, e.g. 2025-06-01');
      return;
    }
    onSave({
      status,
      dateIntroduced: dateText.trim() || undefined,
      reactionNotes:  notes.trim()    || undefined,
      severity:       status === 'allergy' ? severity : undefined,
    });
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{emoji} {name}</Text>
          <TouchableOpacity onPress={save} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.saveBtn}>Save</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>Status</Text>
          <View style={s.statusRow}>
            {(['not_tried', 'introduced', 'watchlist', 'allergy'] as Status[]).map(st => {
              const cfg = STATUS[st];
              return (
                <TouchableOpacity
                  key={st}
                  style={[s.statusChip, { backgroundColor: cfg.bg, borderColor: cfg.border, opacity: status === st ? 1 : 0.4 }]}
                  onPress={() => setStatus(st)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.statusChipText, { color: cfg.text }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

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

          <Text style={s.label}>Date first encountered</Text>
          <TextInput
            style={s.input}
            value={dateText}
            onChangeText={setDateText}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={c.textMuted}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
          />

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

// ─── Add custom allergen modal ────────────────────────────────────────────────

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
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add {tab === 'food' ? 'Food' : 'Other'} Allergen</Text>
          <TouchableOpacity onPress={add} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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

  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.75}>
      <Text style={s.emoji}>{emoji}</Text>
      <View style={s.body}>
        <Text style={s.name}>{name}</Text>
        {entry.dateIntroduced ? <Text style={s.date}>{formatDate(entry.dateIntroduced)}</Text> : null}
        {entry.status === 'allergy' && entry.severity
          ? <Text style={[s.severity, { color: SEVERITY[entry.severity].color }]}>{SEVERITY[entry.severity].label} reaction</Text>
          : null}
        {entry.reactionNotes ? <Text style={s.notes} numberOfLines={1}>{entry.reactionNotes}</Text> : null}
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
          >
            <Text style={s.deleteX}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AllergenTracker() {
  const c = useColors();
  const s = styles(c);

  const [collapsed,   setCollapsed]   = useState(false);
  const [tab,         setTab]         = useState<TabKey>('food');
  const [entries,     setEntries]     = useState<Record<string, AllergenEntry>>({});
  const [custom,      setCustom]      = useState<CustomAllergen[]>([]);
  const [loaded,      setLoaded]      = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);

  // ── Persistence ────────────────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        const d: StoredData = JSON.parse(raw);
        setEntries(d.entries ?? {});
        setCustom(d.custom ?? []);
      }
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((nextEntries: Record<string, AllergenEntry>, nextCustom: CustomAllergen[]) => {
    const d: StoredData = { entries: nextEntries, custom: nextCustom };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  }, []);

  function getEntry(id: string): AllergenEntry {
    return entries[id] ?? { status: 'not_tried' };
  }

  function saveEntry(id: string, updated: AllergenEntry) {
    const next = { ...entries, [id]: updated };
    setEntries(next);
    persist(next, custom);
    setEditingId(null);
  }

  function addCustom(ca: CustomAllergen) {
    const next = [...custom, ca];
    setCustom(next);
    persist(entries, next);
    setShowAddCustom(false);
    setEditingId(ca.id);
  }

  function removeCustom(id: string) {
    const nextCustom = custom.filter(c => c.id !== id);
    const nextEntries = { ...entries };
    delete nextEntries[id];
    setCustom(nextCustom);
    setEntries(nextEntries);
    persist(nextEntries, nextCustom);
  }

  // ── Summary counts ─────────────────────────────────────────────────────────

  const allIds = [
    ...FOOD_ALLERGENS.flatMap(g => g.items.map(i => i.id)),
    ...OTHER_ALLERGENS.flatMap(g => g.items.map(i => i.id)),
    ...custom.map(c => c.id),
  ];
  const counts = { not_tried: 0, introduced: 0, allergy: 0, watchlist: 0 };
  for (const id of allIds) counts[getEntry(id).status]++;

  // ── Resolve editing allergen ───────────────────────────────────────────────

  const editingAllergen = editingId
    ? (() => {
        for (const g of [...FOOD_ALLERGENS, ...OTHER_ALLERGENS]) {
          const found = (g.items as readonly { id: string; emoji: string; name: string }[]).find(i => i.id === editingId);
          if (found) return found;
        }
        return custom.find(c => c.id === editingId) ?? null;
      })()
    : null;

  if (!loaded) return null;

  const foodCustom  = custom.filter(c => c.tab === 'food');
  const otherCustom = custom.filter(c => c.tab === 'other');

  return (
    <View style={s.container}>
      {/* ── Section header ── */}
      <TouchableOpacity style={s.sectionHeader} onPress={() => setCollapsed(v => !v)} activeOpacity={0.7}>
        <Text style={s.sectionTitle}>🚨 Allergen Tracker</Text>
        <Text style={s.chevron}>{collapsed ? '›' : '⌄'}</Text>
      </TouchableOpacity>

      {!collapsed && (
        <>
          {/* Summary */}
          <View style={s.summaryRow}>
            {(Object.keys(STATUS) as Status[]).map(st => {
              const cfg = STATUS[st];
              return (
                <View key={st} style={[s.summaryChip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                  <Text style={[s.summaryCount, { color: cfg.text }]}>{counts[st]}</Text>
                  <Text style={[s.summaryLabel, { color: cfg.text }]}>{cfg.label}</Text>
                </View>
              );
            })}
          </View>

          {/* Tab strip */}
          <View style={s.tabStrip}>
            {(['food', 'other'] as TabKey[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[s.tabBtn, tab === t && s.tabBtnActive]}
                onPress={() => setTab(t)}
                activeOpacity={0.75}
              >
                <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>
                  {t === 'food' ? '🍽  Food' : '🌿  Environmental & Other'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Food tab */}
          {tab === 'food' && (
            <>
              {FOOD_ALLERGENS.map(group => (
                <View key={group.category} style={s.group}>
                  <Text style={s.catLabel}>{group.category}</Text>
                  {(group.items as readonly { id: string; emoji: string; name: string }[]).map(a => (
                    <AllergenRow
                      key={a.id}
                      id={a.id} emoji={a.emoji} name={a.name}
                      entry={getEntry(a.id)}
                      onPress={() => setEditingId(a.id)}
                    />
                  ))}
                </View>
              ))}

              {foodCustom.length > 0 && (
                <View style={s.group}>
                  <Text style={s.catLabel}>My Custom Food Allergens</Text>
                  {foodCustom.map(a => (
                    <AllergenRow
                      key={a.id}
                      id={a.id} emoji={a.emoji} name={a.name}
                      entry={getEntry(a.id)}
                      onPress={() => setEditingId(a.id)}
                      onDelete={() => removeCustom(a.id)}
                    />
                  ))}
                </View>
              )}

              <TouchableOpacity style={s.addBtn} onPress={() => setShowAddCustom(true)} activeOpacity={0.75}>
                <Text style={s.addBtnText}>+ Add food allergen</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Other tab */}
          {tab === 'other' && (
            <>
              {OTHER_ALLERGENS.map(group => (
                <View key={group.category} style={s.group}>
                  <Text style={s.catLabel}>{group.category}</Text>
                  {(group.items as readonly { id: string; emoji: string; name: string }[]).map(a => (
                    <AllergenRow
                      key={a.id}
                      id={a.id} emoji={a.emoji} name={a.name}
                      entry={getEntry(a.id)}
                      onPress={() => setEditingId(a.id)}
                    />
                  ))}
                </View>
              ))}

              {otherCustom.length > 0 && (
                <View style={s.group}>
                  <Text style={s.catLabel}>My Custom Allergens</Text>
                  {otherCustom.map(a => (
                    <AllergenRow
                      key={a.id}
                      id={a.id} emoji={a.emoji} name={a.name}
                      entry={getEntry(a.id)}
                      onPress={() => setEditingId(a.id)}
                      onDelete={() => removeCustom(a.id)}
                    />
                  ))}
                </View>
              )}

              <TouchableOpacity style={s.addBtn} onPress={() => setShowAddCustom(true)} activeOpacity={0.75}>
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

      {/* Modals */}
      {editingAllergen && (
        <DetailModal
          name={editingAllergen.name}
          emoji={editingAllergen.emoji}
          entry={getEntry(editingAllergen.id)}
          onSave={updated => saveEntry(editingAllergen.id, updated)}
          onClose={() => setEditingId(null)}
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
    container: { marginBottom: 24 },

    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
    chevron: { fontSize: 22, color: c.textMuted, fontWeight: '700' },

    summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
    summaryChip: {
      flex: 1, minWidth: 72, borderRadius: 12, borderWidth: 1.5,
      paddingVertical: 9, paddingHorizontal: 6, alignItems: 'center',
    },
    summaryCount: { fontSize: 18, fontWeight: '800' },
    summaryLabel: { fontSize: 10, fontWeight: '700', marginTop: 2, textAlign: 'center' },

    tabStrip: {
      flexDirection: 'row',
      backgroundColor: c.bgAlt,
      borderRadius: 12,
      padding: 4,
      marginBottom: 20,
      gap: 4,
    },
    tabBtn: {
      flex: 1, paddingVertical: 8, paddingHorizontal: 6,
      borderRadius: 9, alignItems: 'center',
    },
    tabBtnActive: { backgroundColor: c.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    tabLabel: { fontSize: 13, fontWeight: '700', color: c.textMuted },
    tabLabelActive: { color: c.textPrimary },

    group: { marginBottom: 18 },
    catLabel: {
      fontSize: 11, fontWeight: '800', color: c.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
    },

    addBtn: {
      borderWidth: 1.5, borderColor: c.primary, borderStyle: 'dashed',
      borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 16,
    },
    addBtnText: { fontSize: 14, fontWeight: '700', color: c.primary },

    disclaimer: { backgroundColor: c.cardBlue, borderRadius: 12, padding: 14, marginTop: 4 },
    disclaimerText: { fontSize: 12, color: c.textSecondary, fontWeight: '500', lineHeight: 18 },
  });

const rowStyles = (c: Colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.card, borderRadius: 12, padding: 12,
      marginBottom: 7, gap: 10, borderWidth: 1, borderColor: c.separator,
    },
    emoji: { fontSize: 22 },
    body: { flex: 1, gap: 2 },
    name: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    date: { fontSize: 11, color: c.textMuted, fontWeight: '500' },
    severity: { fontSize: 11, fontWeight: '700' },
    notes: { fontSize: 11, color: c.textMuted, fontWeight: '500' },
    badgeWrap: { alignItems: 'flex-end', gap: 4 },
    badge: { borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 4 },
    badgeText: { fontSize: 10, fontWeight: '800' },
    deleteBtn: { paddingHorizontal: 4 },
    deleteX: { fontSize: 12, color: c.textMuted, fontWeight: '700' },
  });

const modalStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    cancel: { fontSize: 16, color: c.textMuted, fontWeight: '600' },
    saveBtn: { fontSize: 16, color: c.primary, fontWeight: '800' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    body: { padding: 20, gap: 10, paddingBottom: 48 },
    label: { fontSize: 13, fontWeight: '800', color: c.textMuted, marginTop: 8 },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusChip: { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8 },
    statusChipText: { fontSize: 13, fontWeight: '800' },
    severityRow: { flexDirection: 'row', gap: 8 },
    sevChip: { flex: 1, borderRadius: 10, borderWidth: 2, paddingVertical: 10, alignItems: 'center' },
    sevChipText: { fontSize: 13, fontWeight: '800' },
    input: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1, borderColor: c.inputBorder,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary, fontWeight: '500',
    },
    multiInput: { minHeight: 88, paddingTop: 12 },
  });
