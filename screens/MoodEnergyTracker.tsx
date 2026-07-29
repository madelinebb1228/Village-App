import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete } from '../lib/syncService';

// ─── Constants ────────────────────────────────────────────────────────────────

const MOOD_OPTS  = ['😔','😕','😐','🙂','😊'] as const;
const ENERGY_OPTS = ['🪫','🔋','🔋','⚡','⚡⚡'] as const;

const EMOTION_CHIPS = [
  'Grateful','Hopeful','Connected','Calm',
  'Anxious','Overwhelmed','Lonely','Irritable',
  'Exhausted','Proud','Numb','Weepy',
];

// Emotions that, when they show up repeatedly, nudge toward a mental health check-in.
const CONCERNING_EMOTIONS = ['Anxious', 'Overwhelmed', 'Lonely', 'Numb', 'Weepy'];

const EXPANDED_KEY = 'mood_energy_expanded';
const SW = Dimensions.get('window').width;

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fmtShort(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtChartLabel(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MoodLog {
  id: string;
  logged_date: string;
  mood_score: number;
  energy_score: number;
  emotions: string[];
  notes: string | null;
  created_at: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MoodEnergyTracker({
  userId, onSuggestCheckIn,
}: {
  userId: string | null;
  onSuggestCheckIn?: () => void;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const chartWidth = Platform.OS === 'web' ? Math.min(SW - 96, 480) : SW - 96;

  const [entries, setEntries]   = useState<MoodLog[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  const [mood,     setMood]     = useState(3);
  const [energy,   setEnergy]   = useState(3);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [notes,    setNotes]    = useState('');
  const [customEmotion, setCustomEmotion] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(EXPANDED_KEY).then(v => { if (v != null) setExpanded(v === '1'); });
  }, []);

  function toggleExpanded() {
    setExpanded(v => {
      const next = !v;
      AsyncStorage.setItem(EXPANDED_KEY, next ? '1' : '0').catch(() => {});
      return next;
    });
  }

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await (supabase.from('mom_mood_logs') as any)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    setEntries(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const todayEntries = useMemo(() => entries.filter(e => e.logged_date === todayStr()), [entries]);

  // ── Cross-tracker nudge ───────────────────────────────────────────────────
  const recentForNudge = entries.slice(0, 5);
  const concerningCount = recentForNudge.filter(e => e.emotions.some(em => CONCERNING_EMOTIONS.includes(em))).length;
  const avgRecentMood = recentForNudge.length
    ? recentForNudge.reduce((sum, e) => sum + e.mood_score, 0) / recentForNudge.length
    : null;
  const showNudge = onSuggestCheckIn && recentForNudge.length >= 3
    && (concerningCount >= 3 || (avgRecentMood !== null && avgRecentMood <= 2));

  function openNewEntry() {
    setEditingLogId(null);
    setMood(3); setEnergy(3); setEmotions([]); setNotes(''); setCustomEmotion('');
    setShowForm(true);
  }

  function openEditEntry(entry: MoodLog) {
    setEditingLogId(entry.id);
    setMood(entry.mood_score); setEnergy(entry.energy_score);
    setEmotions(entry.emotions); setNotes(entry.notes ?? ''); setCustomEmotion('');
    setShowForm(true);
  }

  function toggleEmotion(e: string) {
    setEmotions(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  function addCustomEmotion() {
    const val = customEmotion.trim();
    if (!val) return;
    if (!emotions.includes(val)) setEmotions(prev => [...prev, val]);
    setCustomEmotion('');
  }

  const customChips = emotions.filter(e => !EMOTION_CHIPS.includes(e));

  async function save() {
    if (!userId) return;
    setSaving(true);
    try {
      const editing = editingLogId ? entries.find(e => e.id === editingLogId) : null;
      const payload = {
        user_id: userId,
        logged_date: editing?.logged_date ?? todayStr(),
        mood_score: mood, energy_score: energy, emotions, notes: notes.trim() || null,
      };
      if (editingLogId) {
        await safeUpdate('mom_mood_logs', editingLogId, payload);
      } else {
        await safeInsert('mom_mood_logs', payload);
      }
      setShowForm(false);
      setEditingLogId(null);
      await load();
    } catch (err: any) {
      Alert.alert('Couldn\'t save check-in', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    await safeDelete('mom_mood_logs', id);
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  const chartEntries = [...entries].slice(0, 10).reverse();

  if (loading) return <ActivityIndicator color={c.primary} style={{ margin: 24 }} />;

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.header} onPress={toggleExpanded} activeOpacity={0.8}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>🌈</Text>
          <View>
            <Text style={s.headerTitle}>Mood & Energy</Text>
            {todayEntries.length > 0 ? (
              <Text style={s.headerSub}>
                {todayEntries.length > 1
                  ? `${todayEntries.length} check-ins today`
                  : `Today: ${MOOD_OPTS[todayEntries[0].mood_score - 1]}  Energy: ${todayEntries[0].energy_score}/5`}
              </Text>
            ) : (
              <Text style={s.headerSub}>How are you feeling today?</Text>
            )}
          </View>
        </View>
        <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={s.body}>
          {!showForm ? (
            <>
              {showNudge && (
                <TouchableOpacity style={s.nudgeBanner} onPress={onSuggestCheckIn} activeOpacity={0.85}>
                  <Text style={s.nudgeText}>
                    💜 We've noticed some tough days lately. Consider taking a Postpartum Mental Health check-in.
                  </Text>
                  <Text style={s.nudgeArrow}>›</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={s.logBtn} onPress={openNewEntry}>
                <Text style={s.logBtnText}>✏️  Log a Check-in</Text>
              </TouchableOpacity>

              {/* Trend chart */}
              {chartEntries.length >= 2 ? (
                <View style={{ marginBottom: 16 }}>
                  <Text style={s.chartLabel}>MOOD & ENERGY OVER TIME</Text>
                  <LineChart
                    data={{
                      labels: chartEntries.map(e => fmtChartLabel(e.logged_date)),
                      datasets: [
                        { data: chartEntries.map(e => e.mood_score), color: () => '#DB2777', strokeWidth: 2.5 },
                        { data: chartEntries.map(e => e.energy_score), color: () => c.sage, strokeWidth: 2.5 },
                      ],
                      legend: ['Mood', 'Energy'],
                    }}
                    width={chartWidth}
                    height={160}
                    fromZero
                    segments={4}
                    chartConfig={{
                      backgroundColor: c.card,
                      backgroundGradientFrom: c.card,
                      backgroundGradientTo: c.card,
                      decimalPlaces: 0,
                      color: (opacity = 1) => `rgba(219,39,119,${opacity})`,
                      labelColor: () => c.textMuted,
                      propsForDots: { r: '3.5', strokeWidth: '2' },
                    }}
                    bezier
                    style={{ borderRadius: 14 }}
                    withInnerLines={false}
                    withOuterLines={false}
                  />
                </View>
              ) : (
                <View style={s.chartPlaceholder}>
                  <Text style={s.chartPlaceholderText}>Log one more check-in to see your trend over time.</Text>
                </View>
              )}

              {/* Recent check-ins */}
              {entries.length > 0 && (
                <View style={s.histWrap}>
                  <Text style={s.histTitle}>Recent check-ins</Text>
                  {entries.map(entry => (
                    <View key={entry.id} style={s.entryRow}>
                      <Text style={s.entryEmoji}>{MOOD_OPTS[entry.mood_score - 1]}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.entryDate}>
                          {entry.logged_date === todayStr() ? `Today · ${fmtTime(entry.created_at)}` : fmtShort(entry.logged_date)}
                        </Text>
                        <Text style={s.entryMeta}>
                          Mood {entry.mood_score}/5 · Energy {entry.energy_score}/5
                          {entry.emotions.length > 0 ? `  ·  ${entry.emotions.join(', ')}` : ''}
                        </Text>
                        {entry.notes ? <Text style={s.entryNotes}>"{entry.notes}"</Text> : null}
                      </View>
                      <TouchableOpacity onPress={() => openEditEntry(entry)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={s.entryAction}>✎</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteEntry(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={[s.entryAction, { color: c.textMuted }]}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            /* ── Log form ── */
            <View>
              <Text style={s.formLabel}>How's your mood?</Text>
              <View style={s.emojiRow}>
                {MOOD_OPTS.map((e, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.emojiBtn, mood === i + 1 && { backgroundColor: c.cardLavender, borderColor: c.lavender }]}
                    onPress={() => setMood(i + 1)}
                  >
                    <Text style={s.emojiBtnText}>{e}</Text>
                    <Text style={s.emojiBtnNum}>{i + 1}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Energy level?</Text>
              <View style={s.emojiRow}>
                {ENERGY_OPTS.map((e, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.emojiBtn, energy === i + 1 && { backgroundColor: c.cardSage, borderColor: c.sage }]}
                    onPress={() => setEnergy(i + 1)}
                  >
                    <Text style={s.emojiBtnText}>{e}</Text>
                    <Text style={s.emojiBtnNum}>{i + 1}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>How are you feeling? <Text style={s.optional}>(pick any)</Text></Text>
              <View style={s.chipsWrap}>
                {[...EMOTION_CHIPS, ...customChips].map(e => (
                  <TouchableOpacity
                    key={e}
                    style={[s.chip, emotions.includes(e) && { backgroundColor: c.cardBlush, borderColor: c.blush }]}
                    onPress={() => toggleEmotion(e)}
                  >
                    <Text style={[s.chipText, emotions.includes(e) && { color: c.blush, fontWeight: '700' }]}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.customRow}>
                <TextInput
                  style={s.customInput}
                  placeholder="Add your own..."
                  placeholderTextColor={c.textMuted}
                  value={customEmotion}
                  onChangeText={setCustomEmotion}
                  onSubmitEditing={addCustomEmotion}
                  returnKeyType="done"
                />
                <TouchableOpacity style={s.customAddBtn} onPress={addCustomEmotion} disabled={!customEmotion.trim()}>
                  <Text style={s.customAddBtnText}>Add</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.formLabel}>Any notes? <Text style={s.optional}>(optional)</Text></Text>
              <TextInput
                style={s.notesInput}
                placeholder="Just a few words..."
                placeholderTextColor={c.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                maxLength={300}
              />

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowForm(false); setEditingLogId(null); }}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>{editingLogId ? 'Save Changes' : 'Save Check-In'}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: { backgroundColor: c.card, borderRadius: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: c.separator },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderLeftWidth: 4, borderLeftColor: '#DB2777' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerEmoji: { fontSize: 28 },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    headerSub:   { fontSize: 12, color: c.textMuted, marginTop: 2 },
    chevron:     { fontSize: 12, color: c.textMuted },
    body:        { padding: 16, borderTopWidth: 1, borderTopColor: c.separator },

    nudgeBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.cardLavender, borderRadius: 12, padding: 12, marginBottom: 14,
      borderWidth: 1.5, borderColor: c.lavender,
    },
    nudgeText: { flex: 1, fontSize: 12, color: c.textPrimary, lineHeight: 17, fontWeight: '600' },
    nudgeArrow: { fontSize: 18, color: c.lavender, fontWeight: '700' },

    logBtn:     { backgroundColor: c.cardBlush, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 14, borderWidth: 1.5, borderColor: '#FBCFE8' },
    logBtnText: { fontSize: 15, fontWeight: '700', color: '#831843' },

    chartLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600', marginBottom: 6 },
    chartPlaceholder: {
      alignItems: 'center', backgroundColor: c.bg, borderRadius: 14,
      padding: 16, marginBottom: 16,
    },
    chartPlaceholderText: { fontSize: 12, color: c.textMuted, textAlign: 'center' },

    histWrap:  { marginTop: 4 },
    histTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 8 },
    entryRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    entryEmoji: { fontSize: 22 },
    entryDate:  { fontSize: 12, fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
    entryMeta:  { fontSize: 12, color: c.textSecondary },
    entryNotes: { fontSize: 12, color: c.textMuted, fontStyle: 'italic', marginTop: 2 },
    entryAction: { fontSize: 15, color: '#DB2777', paddingHorizontal: 2 },

    formLabel:  { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 10, marginTop: 12 },
    optional:   { fontWeight: '400', color: c.textMuted },
    emojiRow:   { flexDirection: 'row', gap: 8, marginBottom: 4 },
    emojiBtn:   { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    emojiBtnText: { fontSize: 22 },
    emojiBtnNum:  { fontSize: 10, color: c.textMuted, marginTop: 2 },

    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    chip:      { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    chipText:  { fontSize: 13, color: c.textSecondary },

    customRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    customInput: {
      flex: 1, backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator,
      paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: c.textPrimary,
    },
    customAddBtn: { paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10, backgroundColor: c.cardBlush, borderWidth: 1.5, borderColor: '#FBCFE8' },
    customAddBtnText: { fontSize: 13, fontWeight: '700', color: '#831843' },

    notesInput: { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary, minHeight: 70, textAlignVertical: 'top', marginBottom: 16 },
    btnRow:     { flexDirection: 'row', gap: 10 },
    cancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    saveBtn:    { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#DB2777' },
    saveBtnText:{ fontSize: 14, fontWeight: '800', color: '#fff' },
  });
}
