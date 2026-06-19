import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';

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

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

interface MovementLog {
  id: string;
  activity_type: string;
  duration_minutes: number | null;
  intensity: string | null;
  notes: string | null;
  logged_at: string;
}

export default function MovementTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [todayLogs, setTodayLogs] = useState<MovementLog[]>([]);
  const [weekMins,  setWeekMins]  = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [adding,    setAdding]    = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [expanded,  setExpanded]  = useState(false);

  const [activity,  setActivity]  = useState('walk');
  const [duration,  setDuration]  = useState('');
  const [intensity, setIntensity] = useState('gentle');
  const [notes,     setNotes]     = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [todayRes, weekRes] = await Promise.all([
      (supabase.from('mom_movement_logs') as any)
        .select('*').eq('user_id', userId)
        .gte('logged_at', todayStart())
        .order('logged_at', { ascending: false }),
      (supabase.from('mom_movement_logs') as any)
        .select('duration_minutes').eq('user_id', userId)
        .gte('logged_at', weekStart()),
    ]);
    setTodayLogs(todayRes.data ?? []);
    setWeekMins((weekRes.data ?? []).reduce((sum: number, r: any) => sum + (r.duration_minutes ?? 0), 0));
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!userId) return;
    setSaving(true);
    await (supabase.from('mom_movement_logs') as any).insert({
      user_id: userId,
      activity_type: activity,
      duration_minutes: parseInt(duration || '0') || null,
      intensity,
      notes: notes.trim() || null,
    });
    setSaving(false);
    setAdding(false);
    setActivity('walk'); setDuration(''); setIntensity('gentle'); setNotes('');
    load();
  }

  const todayMins = todayLogs.reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);

  if (loading) return <ActivityIndicator color={c.primary} style={{ margin: 24 }} />;

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(p => !p)} activeOpacity={0.8}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>🏃</Text>
          <View>
            <Text style={s.headerTitle}>Movement</Text>
            <Text style={s.headerSub}>
              {todayMins > 0 ? `Today: ${todayMins} min · This week: ${weekMins} min` : 'Every step counts 💚'}
            </Text>
          </View>
        </View>
        <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

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

          {/* Today's sessions */}
          {!adding && todayLogs.map(l => {
            const act = ACTIVITIES.find(a => a.value === l.activity_type);
            return (
              <View key={l.id} style={s.entryRow}>
                <Text style={s.entryEmoji}>{act?.emoji ?? '✨'}</Text>
                <Text style={s.entryName}>{act?.label ?? l.activity_type}</Text>
                {l.duration_minutes ? <Text style={s.entryDur}>{l.duration_minutes} min</Text> : null}
                {l.intensity ? <Text style={s.entryIntensity}>{INTENSITY.find(i => i.value === l.intensity)?.label}</Text> : null}
                <Text style={s.entryTime}>{fmtTime(l.logged_at)}</Text>
              </View>
            );
          })}

          {!adding ? (
            <TouchableOpacity style={s.addBtn} onPress={() => setAdding(true)}>
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
              />

              <Text style={s.formLabel}>Intensity</Text>
              <View style={s.chipRow}>
                {INTENSITY.map(i => (
                  <TouchableOpacity
                    key={i.value}
                    style={[s.chip, intensity === i.value && s.chipActive]}
                    onPress={() => setIntensity(i.value)}
                  >
                    <Text style={[s.chipText, intensity === i.value && { color: c.sage, fontWeight: '700' }]}>{i.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Notes <Text style={s.optional}>(optional)</Text></Text>
              <TextInput style={s.notesInput} placeholder="How did it feel?"
                placeholderTextColor={c.textMuted} value={notes} onChangeText={setNotes} maxLength={200} />

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setAdding(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Log It 💪</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: { backgroundColor: c.card, borderRadius: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: c.separator },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderLeftWidth: 4, borderLeftColor: '#059669' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerEmoji: { fontSize: 28 },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    headerSub:   { fontSize: 12, color: c.textMuted, marginTop: 2 },
    chevron:     { fontSize: 12, color: c.textMuted },
    body:        { padding: 16, borderTopWidth: 1, borderTopColor: c.separator },

    summaryRow:    { flexDirection: 'row', backgroundColor: c.cardSage, borderRadius: 12, padding: 14, marginBottom: 14, alignItems: 'center' },
    summaryItem:   { flex: 1, alignItems: 'center' },
    summaryNum:    { fontSize: 20, fontWeight: '800', color: c.sage },
    summaryLbl:    { fontSize: 11, color: c.textMuted, marginTop: 2 },
    summaryDivider:{ width: 1, height: 32, backgroundColor: c.separator },

    entryRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.separator },
    entryEmoji:    { fontSize: 18 },
    entryName:     { fontSize: 14, fontWeight: '700', color: c.textPrimary, flex: 1 },
    entryDur:      { fontSize: 13, color: c.sage, fontWeight: '700' },
    entryIntensity:{ fontSize: 11, color: c.textMuted },
    entryTime:     { fontSize: 11, color: c.textMuted, marginLeft: 4 },

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
  });
}
