import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const QUALITY_OPTS = [
  { value: 'poor', label: '😫 Poor' },
  { value: 'fair', label: '😴 Fair' },
  { value: 'good', label: '😌 Good' },
];

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fmtDuration(mins: number) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SleepLog {
  id: string;
  sleep_type: string;
  duration_minutes: number | null;
  quality: string | null;
  interruptions: number;
  notes: string | null;
  logged_at: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MomSleepTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [logs,     setLogs]     = useState<SleepLog[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [sleepType,    setSleepType]    = useState<'night' | 'nap'>('night');
  const [durationHrs,  setDurationHrs]  = useState('');
  const [durationMins, setDurationMins] = useState('');
  const [quality,      setQuality]      = useState('fair');
  const [interrupts,   setInterrupts]   = useState('0');
  const [notes,        setNotes]        = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await (supabase.from('mom_sleep_logs') as any)
      .select('*').eq('user_id', userId)
      .gte('logged_at', todayStart())
      .order('logged_at', { ascending: false });
    setLogs(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!userId) return;
    const h = parseInt(durationHrs || '0');
    const m = parseInt(durationMins || '0');
    const total = h * 60 + m;
    setSaving(true);
    await (supabase.from('mom_sleep_logs') as any).insert({
      user_id: userId,
      sleep_type: sleepType,
      duration_minutes: total || null,
      quality,
      interruptions: parseInt(interrupts || '0'),
      notes: notes.trim() || null,
    });
    setSaving(false);
    setAdding(false);
    setSleepType('night'); setDurationHrs(''); setDurationMins('');
    setQuality('fair'); setInterrupts('0'); setNotes('');
    load();
  }

  const todayTotal = logs.reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);
  const nightTotal = logs.filter(l => l.sleep_type === 'night').reduce((s, l) => s + (l.duration_minutes ?? 0), 0);

  if (loading) return <ActivityIndicator color={c.primary} style={{ margin: 24 }} />;

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(p => !p)} activeOpacity={0.8}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>🌙</Text>
          <View>
            <Text style={s.headerTitle}>Your Sleep</Text>
            <Text style={s.headerSub}>
              {todayTotal > 0 ? `Today: ${fmtDuration(todayTotal)} total` : 'Track your rest'}
            </Text>
          </View>
        </View>
        <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={s.body}>
          {/* Summary */}
          {logs.length > 0 && !adding && (
            <View style={s.summaryRow}>
              <View style={s.summaryItem}>
                <Text style={s.summaryNum}>{fmtDuration(nightTotal)}</Text>
                <Text style={s.summaryLbl}>Night sleep</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryNum}>{fmtDuration(todayTotal - nightTotal)}</Text>
                <Text style={s.summaryLbl}>Naps</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryNum}>{fmtDuration(todayTotal)}</Text>
                <Text style={s.summaryLbl}>Total</Text>
              </View>
            </View>
          )}

          {/* Today's entries */}
          {!adding && logs.map(l => (
            <View key={l.id} style={s.entryCard}>
              <Text style={s.entryType}>{l.sleep_type === 'night' ? '🌙 Night' : '☀️ Nap'}</Text>
              <Text style={s.entryDur}>{fmtDuration(l.duration_minutes ?? 0)}</Text>
              {l.quality && <Text style={s.entryQuality}>{QUALITY_OPTS.find(q => q.value === l.quality)?.label}</Text>}
              {(l.interruptions ?? 0) > 0 && <Text style={s.entryInterrupt}>{l.interruptions}x interrupted</Text>}
            </View>
          ))}

          {!adding ? (
            <TouchableOpacity style={s.addBtn} onPress={() => setAdding(true)}>
              <Text style={s.addBtnText}>+ Log Sleep</Text>
            </TouchableOpacity>
          ) : (
            <View>
              {/* Type toggle */}
              <Text style={s.formLabel}>Type</Text>
              <View style={s.typeRow}>
                {(['night', 'nap'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[s.typeBtn, sleepType === t && s.typeBtnActive]}
                    onPress={() => setSleepType(t)}
                  >
                    <Text style={[s.typeBtnText, sleepType === t && s.typeBtnTextActive]}>
                      {t === 'night' ? '🌙 Night Sleep' : '☀️ Nap'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Duration */}
              <Text style={s.formLabel}>Duration</Text>
              <View style={s.durationRow}>
                <TextInput style={[s.durInput, { flex: 1 }]} placeholder="hrs" placeholderTextColor={c.textMuted}
                  keyboardType="number-pad" value={durationHrs} onChangeText={setDurationHrs} maxLength={2} />
                <Text style={s.durSep}>h</Text>
                <TextInput style={[s.durInput, { flex: 1 }]} placeholder="mins" placeholderTextColor={c.textMuted}
                  keyboardType="number-pad" value={durationMins} onChangeText={setDurationMins} maxLength={2} />
                <Text style={s.durSep}>m</Text>
              </View>

              {/* Quality */}
              <Text style={s.formLabel}>Quality</Text>
              <View style={s.typeRow}>
                {QUALITY_OPTS.map(q => (
                  <TouchableOpacity key={q.value} style={[s.typeBtn, quality === q.value && s.typeBtnActive]} onPress={() => setQuality(q.value)}>
                    <Text style={[s.typeBtnText, quality === q.value && s.typeBtnTextActive]}>{q.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Interruptions */}
              <Text style={s.formLabel}>Times woken up</Text>
              <View style={s.typeRow}>
                {['0','1','2','3','4+'].map(n => (
                  <TouchableOpacity key={n} style={[s.smallChip, interrupts === n && s.smallChipActive]} onPress={() => setInterrupts(n)}>
                    <Text style={[s.smallChipText, interrupts === n && { color: c.primary, fontWeight: '700' }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setAdding(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save</Text>}
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderLeftWidth: 4, borderLeftColor: '#7C3AED' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerEmoji: { fontSize: 28 },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    headerSub:   { fontSize: 12, color: c.textMuted, marginTop: 2 },
    chevron:     { fontSize: 12, color: c.textMuted },
    body:        { padding: 16, borderTopWidth: 1, borderTopColor: c.separator },

    summaryRow:    { flexDirection: 'row', backgroundColor: c.cardLavender, borderRadius: 12, padding: 14, marginBottom: 14, alignItems: 'center' },
    summaryItem:   { flex: 1, alignItems: 'center' },
    summaryNum:    { fontSize: 18, fontWeight: '800', color: '#7C3AED' },
    summaryLbl:    { fontSize: 11, color: c.textMuted, marginTop: 2 },
    summaryDivider:{ width: 1, height: 32, backgroundColor: c.separator },

    entryCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.separator },
    entryType: { fontSize: 13, fontWeight: '700', color: c.textPrimary, width: 90 },
    entryDur:  { fontSize: 15, fontWeight: '800', color: '#7C3AED', flex: 1 },
    entryQuality: { fontSize: 12, color: c.textMuted },
    entryInterrupt: { fontSize: 11, color: c.textMuted },

    addBtn:     { backgroundColor: c.cardLavender, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12, borderWidth: 1.5, borderColor: '#DDD6FE' },
    addBtnText: { fontSize: 14, fontWeight: '700', color: '#7C3AED' },

    formLabel: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 8, marginTop: 14 },
    typeRow:   { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    typeBtn:   { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    typeBtnActive: { backgroundColor: c.cardLavender, borderColor: '#7C3AED' },
    typeBtnText: { fontSize: 13, color: c.textMuted },
    typeBtnTextActive: { color: '#7C3AED', fontWeight: '700' },

    durationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    durInput:  { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 16, color: c.textPrimary, textAlign: 'center' },
    durSep:    { fontSize: 16, color: c.textMuted, fontWeight: '700' },

    smallChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    smallChipActive: { backgroundColor: c.cardLavender, borderColor: '#7C3AED' },
    smallChipText: { fontSize: 13, color: c.textSecondary },

    btnRow:    { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    saveBtn:   { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#7C3AED' },
    saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  });
}
