import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';
import TrackerHeader from '../components/TrackerHeader';
import { useCollapsed } from '../lib/useCollapsed';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete } from '../lib/syncService';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVITIES = [
  { value: 'walk',          label: 'Walk',           emoji: '🚶' },
  { value: 'yoga',          label: 'Yoga',           emoji: '🧘' },
  { value: 'pelvic_floor',  label: 'Pelvic Floor',   emoji: '🌸' },
  { value: 'stretching',    label: 'Stretching',     emoji: '🤸' },
  { value: 'swimming',      label: 'Swimming',       emoji: '🏊' },
  { value: 'strength',      label: 'Strength',       emoji: '💪' },
  { value: 'other',         label: 'Other',          emoji: '✨' },
];

const INTENSITY = [
  { value: 'gentle',   label: '🌿 Gentle' },
  { value: 'moderate', label: '⚡ Moderate' },
  { value: 'vigorous', label: '🔥 Vigorous' },
];

// ACOG postpartum guidance: aim for ~150 min/week of moderate activity once cleared to exercise.
const WEEKLY_GOAL_MIN = 150;

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function historyStart() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

interface MovementLog {
  id: string;
  activity_type: string;
  duration_minutes: number | null;
  intensity: string | null;
  calories_burned: number | null;
  notes: string | null;
  logged_at: string;
}

export default function MovementTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [history,   setHistory]   = useState<MovementLog[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [adding,    setAdding]    = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [expanded, toggleExpanded] = useCollapsed('movement_collapsed');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [activity,  setActivity]  = useState('walk');
  const [duration,  setDuration]  = useState('');
  const [intensity, setIntensity] = useState('gentle');
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [notes,     setNotes]     = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await (supabase.from('mom_movement_logs') as any)
      .select('*').eq('user_id', userId)
      .gte('logged_at', historyStart())
      .order('logged_at', { ascending: false });
    setHistory(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const todayLogs = useMemo(() => history.filter(l => isToday(l.logged_at)), [history]);
  const pastLogs  = useMemo(() => history.filter(l => !isToday(l.logged_at)), [history]);
  const todayMins = todayLogs.reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);

  const weekMins = useMemo(() => {
    const cutoff = new Date(weekStart()).getTime();
    return history
      .filter(l => new Date(l.logged_at).getTime() >= cutoff)
      .reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);
  }, [history]);

  const goalProgress = Math.min(weekMins / WEEKLY_GOAL_MIN, 1);
  const goalHit = weekMins >= WEEKLY_GOAL_MIN;

  function openEditor(existing?: MovementLog) {
    setEditingId(existing?.id ?? null);
    setActivity(existing?.activity_type ?? 'walk');
    setDuration(existing?.duration_minutes != null ? String(existing.duration_minutes) : '');
    setIntensity(existing?.intensity ?? 'gentle');
    setCaloriesBurned(existing?.calories_burned != null ? String(existing.calories_burned) : '');
    setNotes(existing?.notes ?? '');
    setAdding(true);
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    const payload = {
      activity_type: activity,
      duration_minutes: parseInt(duration || '0') || null,
      intensity,
      calories_burned: parseFloat(caloriesBurned) || null,
      notes: notes.trim() || null,
    };
    if (editingId) {
      await safeUpdate('mom_movement_logs', editingId, payload);
    } else {
      await safeInsert('mom_movement_logs', { user_id: userId, logged_at: new Date().toISOString(), ...payload });
    }
    setSaving(false);
    setAdding(false);
    setEditingId(null);
    setActivity('walk'); setDuration(''); setIntensity('gentle'); setCaloriesBurned(''); setNotes('');
    load();
  }

  async function deleteEntry(id: string) {
    await safeDelete('mom_movement_logs', id);
    setHistory(prev => prev.filter(l => l.id !== id));
  }

  if (loading) return <ActivityIndicator color={c.primary} style={{ margin: 24 }} />;

  return (
    <View style={s.wrap}>
      <TrackerHeader
        emoji="🏃" title="Movement"
        subtitle={todayMins > 0 ? `Today: ${todayMins} min · This week: ${weekMins} min` : 'Every step counts 💚'}
        collapsed={!expanded} onToggle={toggleExpanded}
        accentBg={c.cardSage} accentColor={c.sage}
      />

      {expanded && (
        <View style={s.body}>
          {/* Week summary */}
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <Text style={s.summaryNum}>{todayMins}</Text>
              <Text style={s.summaryLbl}>Today (min)</Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryNum}>{weekMins}</Text>
              <Text style={s.summaryLbl}>This week</Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryNum}>{todayLogs.length}</Text>
              <Text style={s.summaryLbl}>Sessions today</Text>
            </View>
          </View>

          {/* Weekly goal */}
          <View style={s.goalCard}>
            <View style={s.goalHeaderRow}>
              <Text style={s.goalLabel}>{goalHit ? '🎉 Weekly goal hit!' : 'Weekly movement goal'}</Text>
              <Text style={s.goalCount}>{weekMins} / {WEEKLY_GOAL_MIN} min</Text>
            </View>
            <View style={s.goalTrack}>
              <View style={[s.goalFill, { width: `${goalProgress * 100}%` }, goalHit && s.goalFillHit]} />
            </View>
          </View>

          {/* Today's sessions */}
          {!adding && todayLogs.map(l => {
            const act = ACTIVITIES.find(a => a.value === l.activity_type);
            return (
              <View key={l.id} style={s.entryRow}>
                <Text style={s.entryEmoji}>{act?.emoji ?? '✨'}</Text>
                <Text style={s.entryName}>{act?.label ?? l.activity_type}</Text>
                {l.duration_minutes ? <Text style={s.entryDur}>{l.duration_minutes} min</Text> : null}
                {l.calories_burned ? <Text style={s.entryDur}>{l.calories_burned} kcal</Text> : null}
                {l.intensity ? <Text style={s.entryIntensity}>{INTENSITY.find(i => i.value === l.intensity)?.label}</Text> : null}
                <Text style={s.entryTime}>{fmtTime(l.logged_at)}</Text>
                <TouchableOpacity onPress={() => openEditor(l)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button" accessibilityLabel="Edit activity">
                  <Text style={s.entryAction}>✎</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteEntry(l.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button" accessibilityLabel="Delete activity">
                  <Text style={[s.entryAction, { color: c.textMuted }]}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {!adding ? (
            <TouchableOpacity style={s.addBtn} onPress={() => openEditor()}
              accessibilityRole="button" accessibilityLabel="Log activity">
              <Text style={s.addBtnText}>+ Log Activity</Text>
            </TouchableOpacity>
          ) : (
            <View>
              <Text style={s.formLabel}>Activity</Text>
              <View style={s.activityGrid}>
                {ACTIVITIES.map(a => (
                  <TouchableOpacity
                    key={a.value}
                    style={[s.activityBtn, activity === a.value && s.activityBtnActive]}
                    onPress={() => setActivity(a.value)}
                    accessibilityRole="button" accessibilityLabel={a.label}
                  >
                    <Text style={s.activityEmoji}>{a.emoji}</Text>
                    <Text style={[s.activityLabel, activity === a.value && { color: c.sage, fontWeight: '700' }]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Duration (minutes)</Text>
              <TextInput
                style={s.durInput}
                placeholder="e.g. 20"
                placeholderTextColor={c.textMuted}
                keyboardType="number-pad"
                value={duration}
                onChangeText={setDuration}
                maxLength={3}
                accessibilityLabel="Duration in minutes"
              />

              <Text style={s.formLabel}>Intensity</Text>
              <View style={s.chipRow}>
                {INTENSITY.map(i => (
                  <TouchableOpacity
                    key={i.value}
                    style={[s.chip, intensity === i.value && s.chipActive]}
                    onPress={() => setIntensity(i.value)}
                    accessibilityRole="button" accessibilityLabel={i.label}
                  >
                    <Text style={[s.chipText, intensity === i.value && { color: c.sage, fontWeight: '700' }]}>{i.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Calories burned <Text style={s.optional}>(optional — auto-estimated if left blank)</Text></Text>
              <TextInput
                style={s.durInput}
                placeholder="e.g. 150"
                placeholderTextColor={c.textMuted}
                keyboardType="number-pad"
                value={caloriesBurned}
                onChangeText={setCaloriesBurned}
                maxLength={4}
                accessibilityLabel="Calories burned"
              />

              <Text style={s.formLabel}>Notes <Text style={s.optional}>(optional)</Text></Text>
              <TextInput style={s.notesInput} placeholder="How did it feel?"
                placeholderTextColor={c.textMuted} value={notes} onChangeText={setNotes} maxLength={200} />

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => { setAdding(false); setEditingId(null); }}
                  accessibilityRole="button" accessibilityLabel="Cancel">
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}
                  accessibilityRole="button" accessibilityLabel={editingId ? 'Save changes' : 'Log it'}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>{editingId ? 'Save Changes' : 'Log It 💪'}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* History */}
          {!adding && pastLogs.length > 0 && (
            <View style={s.histWrap}>
              <Text style={s.histTitle}>Recent sessions</Text>
              {pastLogs.slice(0, 10).map(l => {
                const act = ACTIVITIES.find(a => a.value === l.activity_type);
                return (
                  <View key={l.id} style={s.entryRow}>
                    <Text style={s.entryEmoji}>{act?.emoji ?? '✨'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.entryName}>{act?.label ?? l.activity_type}</Text>
                      <Text style={s.histMeta}>
                        {fmtDate(l.logged_at)}
                        {l.duration_minutes ? ` · ${l.duration_minutes} min` : ''}
                        {l.calories_burned ? ` · ${l.calories_burned} kcal` : ''}
                        {l.intensity ? ` · ${INTENSITY.find(i => i.value === l.intensity)?.label}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => openEditor(l)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={s.entryAction}>✎</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteEntry(l.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[s.entryAction, { color: c.textMuted }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: { marginBottom: 16 },
    body: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5, borderColor: c.separator, padding: 16, marginTop: 14 },

    summaryRow:    { flexDirection: 'row', backgroundColor: c.cardSage, borderRadius: 12, padding: 14, marginBottom: 14, alignItems: 'center' },
    summaryItem:   { flex: 1, alignItems: 'center' },
    summaryNum:    { fontSize: 20, fontWeight: '800', color: c.sage },
    summaryLbl:    { fontSize: 11, color: c.textMuted, marginTop: 2 },
    summaryDivider:{ width: 1, height: 32, backgroundColor: c.separator },

    goalCard:      { marginBottom: 14 },
    goalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    goalLabel:     { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    goalCount:     { fontSize: 12, color: c.textMuted },
    goalTrack:     { height: 8, borderRadius: 4, backgroundColor: c.separator, overflow: 'hidden' },
    goalFill:      { height: '100%', borderRadius: 4, backgroundColor: c.sage },
    goalFillHit:   { backgroundColor: '#059669' },

    entryRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.separator },
    entryEmoji:    { fontSize: 18 },
    entryName:     { fontSize: 14, fontWeight: '700', color: c.textPrimary, flex: 1 },
    entryDur:      { fontSize: 13, color: c.sage, fontWeight: '700' },
    entryIntensity:{ fontSize: 11, color: c.textMuted },
    entryTime:     { fontSize: 11, color: c.textMuted, marginLeft: 4 },
    entryAction:   { fontSize: 15, color: c.sage, paddingHorizontal: 2 },

    addBtn:     { backgroundColor: c.cardSage, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12, borderWidth: 1.5, borderColor: '#A7F3D0' },
    addBtnText: { fontSize: 14, fontWeight: '700', color: c.sage },

    formLabel: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 8, marginTop: 14 },
    optional:  { fontWeight: '400', color: c.textMuted },

    activityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    activityBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    activityBtnActive: { backgroundColor: c.cardSage, borderColor: c.sage },
    activityEmoji: { fontSize: 18 },
    activityLabel: { fontSize: 12, color: c.textMuted },

    durInput:  { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 16, color: c.textPrimary, width: 100, textAlign: 'center' },

    chipRow:   { flexDirection: 'row', gap: 8 },
    chip:      { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    chipActive:{ backgroundColor: c.cardSage, borderColor: c.sage },
    chipText:  { fontSize: 13, color: c.textSecondary },

    notesInput:{ backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary, marginBottom: 16 },

    btnRow:    { flexDirection: 'row', gap: 10 },
    cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    saveBtn:   { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: c.sage },
    saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

    histWrap:  { marginTop: 4 },
    histTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 4, marginTop: 4 },
    histMeta:  { fontSize: 11, color: c.textMuted, marginTop: 1 },
  });
}
