import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete } from '../lib/syncService';

// ─── Constants ────────────────────────────────────────────────────────────────

const QUALITY_OPTS = [
  { value: 'poor', label: '😫 Poor' },
  { value: 'fair', label: '😴 Fair' },
  { value: 'good', label: '😌 Good' },
];

const SW = Dimensions.get('window').width;

function dateKey(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDuration(mins: number) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
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
  started_at: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MomSleepTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const chartWidth = Platform.OS === 'web' ? Math.min(SW - 96, 480) : SW - 96;

  const [logs,     setLogs]     = useState<SleepLog[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [sleepType,    setSleepType]    = useState<'night' | 'nap'>('night');
  const [durationHrs,  setDurationHrs]  = useState('');
  const [durationMins, setDurationMins] = useState('');
  const [quality,      setQuality]      = useState('fair');
  const [interrupts,   setInterrupts]   = useState('0');
  const [notes,        setNotes]        = useState('');

  // Live timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerType,    setTimerType]    = useState<'night' | 'nap'>('night');
  const [elapsed,      setElapsed]      = useState(0);
  const [finishing,    setFinishing]    = useState(false);
  const [finalMins,    setFinalMins]    = useState(0);
  const activeIdRef  = useRef<string | null>(null);
  const startMsRef   = useRef<number | null>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }
  useEffect(() => clearTimer, []);

  const load = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(0, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const { data } = await (supabase.from('mom_sleep_logs') as any)
      .select('*').eq('user_id', userId)
      .gte('logged_at', sevenDaysAgo.toISOString())
      .order('logged_at', { ascending: false });
    const rows: SleepLog[] = data ?? [];
    setLogs(rows);
    if (!silent) setLoading(false);

    // Resume an in-progress sleep (e.g. app was closed while a nap was running).
    const active = rows.find(l => l.duration_minutes == null);
    if (active && !timerRunning) {
      const startMs = new Date(active.started_at ?? active.logged_at).getTime();
      activeIdRef.current = active.id;
      startMsRef.current = startMs;
      setTimerType(active.sleep_type as 'night' | 'nap');
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
      setTimerRunning(true);
      clearTimer();
      intervalRef.current = setInterval(() => {
        if (startMsRef.current) setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000));
      }, 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const todayLogs = useMemo(() => {
    const todayKey = dateKey(new Date());
    return logs.filter(l => l.duration_minutes != null && dateKey(l.logged_at) === todayKey);
  }, [logs]);

  const chartDays = useMemo(() => {
    const days: { key: string; label: string; mins: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      days.push({ key: dateKey(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }), mins: 0 });
    }
    const map = new Map(days.map(d => [d.key, d]));
    logs.forEach(l => {
      if (l.duration_minutes == null) return;
      const entry = map.get(dateKey(l.logged_at));
      if (entry) entry.mins += l.duration_minutes;
    });
    return days;
  }, [logs]);

  const weeklyTotal = chartDays.reduce((s2, d) => s2 + d.mins, 0);
  const daysWithData = chartDays.filter(d => d.mins > 0).length;
  const weeklyAvgMins = daysWithData ? Math.round(weeklyTotal / daysWithData) : 0;

  function openNewEntry() {
    setEditingId(null);
    setSleepType('night'); setDurationHrs(''); setDurationMins('');
    setQuality('fair'); setInterrupts('0'); setNotes('');
    setAdding(true);
  }

  function openEditEntry(log: SleepLog) {
    setEditingId(log.id);
    setSleepType(log.sleep_type as 'night' | 'nap');
    const mins = log.duration_minutes ?? 0;
    setDurationHrs(String(Math.floor(mins / 60)));
    setDurationMins(String(mins % 60));
    setQuality(log.quality ?? 'fair');
    setInterrupts(String(log.interruptions ?? 0));
    setNotes(log.notes ?? '');
    setAdding(true);
  }

  async function save() {
    if (!userId) return;
    const h = parseInt(durationHrs || '0');
    const m = parseInt(durationMins || '0');
    const total = h * 60 + m;
    setSaving(true);
    const payload = {
      user_id: userId,
      sleep_type: sleepType,
      duration_minutes: total || null,
      quality,
      interruptions: parseInt(interrupts || '0'),
      notes: notes.trim() || null,
    };
    if (editingId) {
      await safeUpdate('mom_sleep_logs', editingId, payload);
    } else {
      await safeInsert('mom_sleep_logs', payload);
    }
    setSaving(false);
    setAdding(false);
    setEditingId(null);
    load(true);
  }

  async function deleteEntry(id: string) {
    await safeDelete('mom_sleep_logs', id);
    setLogs(prev => prev.filter(l => l.id !== id));
  }

  async function startTimer(type: 'night' | 'nap') {
    if (!userId) return;
    setTimerType(type);
    const startMs = Date.now();
    startMsRef.current = startMs;
    setElapsed(0);
    setTimerRunning(true);
    clearTimer();
    intervalRef.current = setInterval(() => {
      if (startMsRef.current) setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000));
    }, 1000);
    const { id } = await safeInsert('mom_sleep_logs', {
      user_id: userId,
      sleep_type: type,
      started_at: new Date(startMs).toISOString(),
      logged_at: new Date(startMs).toISOString(),
      duration_minutes: null,
    });
    activeIdRef.current = id;
  }

  function stopTimer() {
    const secs = startMsRef.current ? Math.floor((Date.now() - startMsRef.current) / 1000) : elapsed;
    clearTimer();
    setTimerRunning(false);
    setFinalMins(Math.max(1, Math.round(secs / 60)));
    setQuality('fair');
    setInterrupts('0');
    setNotes('');
    setFinishing(true);
  }

  async function finishTimerSave() {
    setSaving(true);
    if (activeIdRef.current) {
      await safeUpdate('mom_sleep_logs', activeIdRef.current, {
        duration_minutes: finalMins,
        quality,
        interruptions: parseInt(interrupts || '0'),
        notes: notes.trim() || null,
      });
    }
    activeIdRef.current = null;
    startMsRef.current = null;
    setSaving(false);
    setFinishing(false);
    load(true);
  }

  async function discardTimer() {
    if (activeIdRef.current) await safeDelete('mom_sleep_logs', activeIdRef.current);
    activeIdRef.current = null;
    startMsRef.current = null;
    setFinishing(false);
    load(true);
  }

  const todayTotal = todayLogs.reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);
  const nightTotal = todayLogs.filter(l => l.sleep_type === 'night').reduce((s2, l) => s2 + (l.duration_minutes ?? 0), 0);

  if (loading) return <ActivityIndicator color={c.primary} style={{ margin: 24 }} />;

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(p => !p)} activeOpacity={0.8}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>🌙</Text>
          <View>
            <Text style={s.headerTitle}>Your Sleep</Text>
            <Text style={s.headerSub}>
              {timerRunning
                ? `${timerType === 'night' ? 'Night sleep' : 'Nap'} in progress · ${fmtElapsed(elapsed)}`
                : todayTotal > 0 ? `Today: ${fmtDuration(todayTotal)} total` : 'Track your rest'}
            </Text>
          </View>
        </View>
        <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={s.body}>
          {/* Summary */}
          {todayLogs.length > 0 && !adding && !finishing && (
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

          {/* Weekly trend chart */}
          {!adding && !finishing && (
            weeklyTotal > 0 ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={s.chartLabel}>
                  WEEKLY TREND{weeklyAvgMins ? ` · avg ${fmtDuration(weeklyAvgMins)}/night` : ''}
                </Text>
                <LineChart
                  data={{
                    labels: chartDays.map(d => d.label),
                    datasets: [{ data: chartDays.map(d => +(d.mins / 60).toFixed(1)), color: () => '#7C3AED', strokeWidth: 2.5 }],
                  }}
                  width={chartWidth}
                  height={160}
                  fromZero
                  segments={4}
                  yAxisSuffix="h"
                  chartConfig={{
                    backgroundColor: c.card,
                    backgroundGradientFrom: c.card,
                    backgroundGradientTo: c.card,
                    decimalPlaces: 1,
                    color: (opacity = 1) => `rgba(124,58,237,${opacity})`,
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
                <Text style={s.chartPlaceholderText}>Log a few nights to see your weekly trend.</Text>
              </View>
            )
          )}

          {/* Today's entries */}
          {!adding && !finishing && todayLogs.map(l => (
            <View key={l.id} style={s.entryCard}>
              <Text style={s.entryType}>{l.sleep_type === 'night' ? '🌙 Night' : '☀️ Nap'}</Text>
              <Text style={s.entryDur}>{fmtDuration(l.duration_minutes ?? 0)}</Text>
              {l.quality && <Text style={s.entryQuality}>{QUALITY_OPTS.find(q => q.value === l.quality)?.label}</Text>}
              {(l.interruptions ?? 0) > 0 && <Text style={s.entryInterrupt}>{l.interruptions}x interrupted</Text>}
              <TouchableOpacity onPress={() => openEditEntry(l)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.entryAction}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteEntry(l.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[s.entryAction, { color: c.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Live timer card */}
          {timerRunning && (
            <View style={s.timerCard}>
              <Text style={s.timerType}>{timerType === 'night' ? '🌙 Night Sleep' : '☀️ Nap'}</Text>
              <Text style={s.timerDisplay}>{fmtElapsed(elapsed)}</Text>
              <TouchableOpacity style={s.wakeBtn} onPress={stopTimer}>
                <Text style={s.wakeBtnText}>I'm Awake</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Finishing (post-timer quality entry) */}
          {finishing && (
            <View>
              <Text style={s.timerType}>Slept for {fmtDuration(finalMins)}</Text>

              <Text style={s.formLabel}>Quality</Text>
              <View style={s.typeRow}>
                {QUALITY_OPTS.map(q => (
                  <TouchableOpacity key={q.value} style={[s.typeBtn, quality === q.value && s.typeBtnActive]} onPress={() => setQuality(q.value)}>
                    <Text style={[s.typeBtnText, quality === q.value && s.typeBtnTextActive]}>{q.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Times woken up</Text>
              <View style={s.typeRow}>
                {['0','1','2','3','4+'].map(n => (
                  <TouchableOpacity key={n} style={[s.smallChip, interrupts === n && s.smallChipActive]} onPress={() => setInterrupts(n)}>
                    <Text style={[s.smallChipText, interrupts === n && { color: c.primary, fontWeight: '700' }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Notes <Text style={{ fontWeight: '400', color: c.textMuted }}>(optional)</Text></Text>
              <TextInput style={s.notesInput} placeholder="Anything worth remembering..." placeholderTextColor={c.textMuted}
                value={notes} onChangeText={setNotes} multiline maxLength={300} />

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={discardTimer}>
                  <Text style={s.cancelBtnText}>Discard</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={finishTimerSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!adding && !timerRunning && !finishing && (
            <>
              <View style={s.startRow}>
                <TouchableOpacity style={s.startBtn} onPress={() => startTimer('night')}>
                  <Text style={s.startBtnText}>🌙 Start Night Sleep</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.startBtn} onPress={() => startTimer('nap')}>
                  <Text style={s.startBtnText}>☀️ Start Nap</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={openNewEntry}>
                <Text style={s.manualLink}>+ Log sleep manually</Text>
              </TouchableOpacity>
            </>
          )}

          {adding && (
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

              <Text style={s.formLabel}>Notes <Text style={{ fontWeight: '400', color: c.textMuted }}>(optional)</Text></Text>
              <TextInput style={s.notesInput} placeholder="Anything worth remembering..." placeholderTextColor={c.textMuted}
                value={notes} onChangeText={setNotes} multiline maxLength={300} />

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => { setAdding(false); setEditingId(null); }}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>{editingId ? 'Save Changes' : 'Save'}</Text>}
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

    chartLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600', marginBottom: 6 },
    chartPlaceholder: { alignItems: 'center', backgroundColor: c.bg, borderRadius: 14, padding: 16, marginBottom: 16 },
    chartPlaceholderText: { fontSize: 12, color: c.textMuted, textAlign: 'center' },

    entryCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.separator },
    entryType: { fontSize: 13, fontWeight: '700', color: c.textPrimary, width: 90 },
    entryDur:  { fontSize: 15, fontWeight: '800', color: '#7C3AED', flex: 1 },
    entryQuality: { fontSize: 12, color: c.textMuted },
    entryInterrupt: { fontSize: 11, color: c.textMuted },
    entryAction: { fontSize: 15, color: '#7C3AED', paddingHorizontal: 2 },

    startRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    startBtn: { flex: 1, backgroundColor: c.cardLavender, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#DDD6FE' },
    startBtnText: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
    manualLink: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 12, textDecorationLine: 'underline' },

    timerCard: { alignItems: 'center', backgroundColor: c.cardLavender, borderRadius: 14, padding: 20, marginTop: 12 },
    timerType: { fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 6 },
    timerDisplay: { fontSize: 32, fontWeight: '800', color: '#7C3AED', marginBottom: 14 },
    wakeBtn: { backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
    wakeBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

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

    notesInput: { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary, minHeight: 60, textAlignVertical: 'top' },

    btnRow:    { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    saveBtn:   { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#7C3AED' },
    saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  });
}
