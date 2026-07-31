import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate } from '../lib/syncService';
import { getRange, getSleepGoal, scheduleWindDownNow, handleNapEnded } from '../lib/napSchedule';

type Mode = 'idle' | 'awake' | 'sleeping' | 'quality' | 'manual';
type SleepType = 'nap' | 'night';
type SleepQuality = 'great' | 'good' | 'fair' | 'poor';

type SleepLog = {
  id: string;
  sleep_type: SleepType;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  quality: SleepQuality | null;
  notes: string | null;
};

const QUALITY_OPTIONS: { value: SleepQuality; emoji: string; label: string }[] = [
  { value: 'great', emoji: '😊', label: 'Great' },
  { value: 'good',  emoji: '🙂', label: 'Good'  },
  { value: 'fair',  emoji: '😐', label: 'Fair'  },
  { value: 'poor',  emoji: '😣', label: 'Poor'  },
];

function fmtMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60); const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60); const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function parseTimeInput(raw: string, yesterday: boolean): Date | null {
  const s = raw.trim();
  let h: number, min: number;
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    h = parseInt(m[1]); min = parseInt(m[2]);
  } else {
    m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (!m) return null;
    h = parseInt(m[1]); min = parseInt(m[2]);
    const ap = m[3].toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  const d = new Date();
  if (yesterday) d.setDate(d.getDate() - 1);
  d.setHours(h, min, 0, 0);
  return d;
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.card, borderRadius: 16, padding: 20,
      marginBottom: 16, borderWidth: 1.5, borderColor: c.separator,
    },
    headerRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    headerEmoji:{ fontSize: 22, marginRight: 8 },
    headerTitle:{ fontSize: 18, fontWeight: '700', color: c.text, flex: 1 },
    ageText:    { fontSize: 13, color: c.textMuted, marginBottom: 14 },

    // Summary
    summaryRow:   { flexDirection: 'row', gap: 10, marginBottom: 10 },
    summaryBox:   { flex: 1, backgroundColor: c.inputBg, borderRadius: 12, padding: 10, alignItems: 'center' },
    summaryLabel: { fontSize: 10, color: c.textMuted, marginBottom: 3, textAlign: 'center' },
    summaryValue: { fontSize: 14, fontWeight: '700', color: c.text },
    summarySubtext: { fontSize: 10, color: c.textMuted, marginTop: 2, textAlign: 'center' },

    // Sleep goal bar
    goalWrap:   { marginBottom: 14 },
    goalRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    goalLabel:  { fontSize: 11, color: c.textMuted, fontWeight: '600' },
    goalValue:  { fontSize: 11, color: c.textMuted },
    goalTrack:  { height: 8, backgroundColor: c.inputBg, borderRadius: 4, overflow: 'hidden' },
    goalFill:   { height: '100%' as any, borderRadius: 4 },

    // Wake window suggestion
    suggestionBox: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: c.inputBg,
      borderRadius: 12, padding: 14, marginBottom: 14, gap: 12,
    },
    suggestionEmoji: { fontSize: 26 },
    suggestionLabel: { fontSize: 12, color: c.textMuted, marginBottom: 2 },
    suggestionValue: { fontSize: 16, fontWeight: '700', color: c.text },
    suggestionSub:   { fontSize: 11, color: c.textMuted, marginTop: 2 },

    // Timers
    timerCaption: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginBottom: 4 },
    timerDisplay: { fontSize: 36, fontWeight: '800', textAlign: 'center', letterSpacing: 1, marginBottom: 10 },

    // Wake progress bar
    progressTrack:     { height: 10, backgroundColor: c.inputBg, borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
    progressFill:      { height: '100%' as any, borderRadius: 5 },
    progressEndLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    progressEndText:   { fontSize: 11, color: c.textMuted },
    statusPill:        { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, marginBottom: 14 },
    statusPillText:    { fontSize: 13, fontWeight: '700' },

    // Sleep type toggle
    typeRow:         { flexDirection: 'row', gap: 8, marginBottom: 12 },
    typeBtn:         { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 2, borderColor: c.separator, backgroundColor: c.inputBg },
    typeBtnActive:   { borderColor: c.lavender, backgroundColor: c.cardLavender },
    typeBtnText:     { fontSize: 14, fontWeight: '600', color: c.textSecondary },
    sunIcon:         { width: 14, height: 14 },
    sunIconLg:       { width: 16, height: 16 },
    moonIcon:        { width: 14, height: 14 },
    moonIconLg:      { width: 16, height: 16 },
    moonIconXl:      { width: 22, height: 22 },
    typeBtnTextActive: { color: c.lavender },

    // Buttons
    btn:     { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 2 },
    btnText: { fontSize: 15, fontWeight: '700' },
    btnRow:  { flexDirection: 'row', gap: 8 },

    // Quality
    qualitySleptFor:     { fontSize: 14, textAlign: 'center', color: c.textSecondary, marginBottom: 12 },
    qualitySleptForBold: { fontWeight: '700', color: c.text },
    qualityLabel:        { fontSize: 13, color: c.textMuted, textAlign: 'center', marginBottom: 8 },
    qualityRow:          { flexDirection: 'row', gap: 8, marginBottom: 14 },
    qualityBtn:          { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.inputBg },
    qualityBtnActive:    { borderColor: c.sage, backgroundColor: c.cardSage },
    qualityBtnText:      { fontSize: 12, fontWeight: '600', color: c.textSecondary, marginTop: 2 },
    qualityBtnTextActive:{ color: c.sage },
    skipBtn:             { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16, marginBottom: 10 },
    skipBtnText:         { fontSize: 13, color: c.textMuted },

    // Notes
    notesInput: {
      backgroundColor: c.inputBg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator,
      padding: 12, fontSize: 13, color: c.text, marginBottom: 14, minHeight: 44,
    },

    // Sessions list
    sessionsSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: c.separator, paddingTop: 12 },
    sessionsTitle:   { fontSize: 12, color: c.textMuted, fontWeight: '600', marginBottom: 6 },
    sessionItem:     { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.separator },
    sessionItemLast: { borderBottomWidth: 0 },
    sessionRow:      { flexDirection: 'row', alignItems: 'center' },
    sessionEmoji:    { fontSize: 14, marginRight: 8, width: 20 },
    sessionTimeRange:{ flex: 1, fontSize: 13, color: c.text },
    sessionDuration: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    sessionQuality:  { fontSize: 14, marginLeft: 6 },
    sessionNotes:    { fontSize: 11, color: c.textMuted, fontStyle: 'italic', marginTop: 3, marginLeft: 28 },

    // Manual entry
    manualSection:   { marginTop: 2, borderTopWidth: 1, borderTopColor: c.separator, paddingTop: 14 },
    manualTitle:     { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 12 },
    manualLabel:     { fontSize: 12, color: c.textMuted, fontWeight: '600', marginBottom: 6 },
    manualDateRow:   { flexDirection: 'row', gap: 8, marginBottom: 14 },
    manualDateBtn:   { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.inputBg },
    manualDateBtnActive: { borderColor: c.lavender, backgroundColor: c.cardLavender },
    manualDateText:  { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    manualDateTextActive: { color: c.lavender },
    manualTimeRow:   { flexDirection: 'row', gap: 10, marginBottom: 14 },
    manualTimeWrap:  { flex: 1 },
    manualTimeInput: { backgroundColor: c.inputBg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 15, color: c.text, textAlign: 'center', fontWeight: '600' },
    manualTimeDash:  { fontSize: 20, color: c.textMuted, alignSelf: 'center', marginTop: 4 },
    manualTimeLabel: { fontSize: 10, color: c.textMuted, textAlign: 'center', marginTop: 4 },
    logPastBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, marginTop: 8, gap: 6 },
    logPastBtnText:  { fontSize: 13, color: c.textMuted, fontWeight: '600' },
  });
}

export default function SleepTracker({
  babyId,
  babyBirthDate,
  userId,
  babyName,
}: {
  babyId: string | null;
  babyBirthDate: string | null;
  userId?: string | null;
  babyName?: string | null;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [mode,           setMode]           = useState<Mode>('idle');
  const [elapsed,        setElapsed]        = useState(0);
  const [sleepType,      setSleepType]      = useState<SleepType>('nap');
  const [quality,        setQuality]        = useState<SleepQuality | null>(null);
  const [notes,          setNotes]          = useState('');
  const [finalSleepSecs, setFinalSleepSecs] = useState(0);
  const [saving,         setSaving]         = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [todayLogs,      setTodayLogs]      = useState<SleepLog[]>([]);

  // Manual entry state
  const [manualYesterday, setManualYesterday] = useState(false);
  const [manualStart,     setManualStart]     = useState('');
  const [manualEnd,       setManualEnd]       = useState('');
  const [manualType,      setManualType]      = useState<SleepType>('nap');
  const [manualQuality,   setManualQuality]   = useState<SleepQuality | null>(null);
  const [manualNotes,     setManualNotes]     = useState('');
  const [manualSaving,    setManualSaving]    = useState(false);

  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef       = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const activeSleepIdRef = useRef<string | null>(null);
  const modeStartTimeRef = useRef<number | null>(null);
  const modeRef          = useRef<Mode>('idle');

  const range     = useMemo(() => getRange(babyBirthDate),     [babyBirthDate]);
  const sleepGoal = useMemo(() => getSleepGoal(babyBirthDate), [babyBirthDate]);

  const ageLabel = useMemo(() => {
    if (!babyBirthDate) return 'Add a baby profile to see age-specific windows';
    const days = Math.floor((Date.now() - new Date(babyBirthDate).getTime()) / (24 * 3600 * 1000));
    if (days < 7)  return `${days} day${days !== 1 ? 's' : ''} old · ${range.label}`;
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return `${weeks} week${weeks !== 1 ? 's' : ''} old · ${range.label}`;
    const months = Math.floor(days / 30.44);
    return `${months} month${months !== 1 ? 's' : ''} old · ${range.label}`;
  }, [babyBirthDate, range]);

  useEffect(() => {
    loadTodayLogs();
    if (babyId) checkActiveSession();
    return () => clearTimers();
  }, [babyId]);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') return;
      if (!modeStartTimeRef.current) return;
      const secs = Math.floor((Date.now() - modeStartTimeRef.current) / 1000);
      setElapsed(secs);
      if (modeRef.current === 'awake') {
        const maxSecs = getRange(babyBirthDate).maxMin * 60;
        if (secs >= maxSecs) {
          const r = getRange(babyBirthDate);
          Alert.alert(
            '⏰ Nap Time!',
            `It's been over ${fmtMins(r.maxMin)}! ${r.label} babies do best with ${fmtMins(r.minMin)}–${fmtMins(r.maxMin)} of wake time.`,
            [{ text: 'Got it' }],
          );
        }
      }
    });
    return () => sub.remove();
  }, [babyBirthDate]);

  const loadTodayLogs = useCallback(async () => {
    if (!babyId) return;
    setLoading(true);
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end   = new Date(); end.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from('sleep_logs')
        .select('id, sleep_type, start_time, end_time, duration_minutes, quality, notes')
        .eq('baby_id', babyId)
        .gte('start_time', start.toISOString())
        .lte('start_time', end.toISOString())
        .order('start_time', { ascending: false });
      setTodayLogs((data ?? []) as SleepLog[]);
    } catch (err) {
      console.error('Sleep load error:', err);
    } finally {
      setLoading(false);
    }
  }, [babyId]);

  async function checkActiveSession() {
    if (!babyId) return;
    try {
      const { data } = await supabase
        .from('sleep_logs')
        .select('id, sleep_type, start_time')
        .eq('baby_id', babyId)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        const startMs = new Date(data.start_time).getTime();
        modeStartTimeRef.current = startMs;
        activeSleepIdRef.current = data.id;
        setSleepType(data.sleep_type as SleepType);
        setElapsed(Math.floor((Date.now() - startMs) / 1000));
        setMode('sleeping');
        intervalRef.current = setInterval(() => {
          if (modeStartTimeRef.current) setElapsed(Math.floor((Date.now() - modeStartTimeRef.current) / 1000));
        }, 1000);
      }
    } catch (err) {
      console.error('Active session check:', err);
    }
  }

  function clearTimers() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (timeoutRef.current)  { clearTimeout(timeoutRef.current);   timeoutRef.current  = null; }
  }

  function startAwake() {
    clearTimers();
    modeStartTimeRef.current = Date.now();
    setElapsed(0);
    setMode('awake');
    intervalRef.current = setInterval(() => {
      if (modeStartTimeRef.current) setElapsed(Math.floor((Date.now() - modeStartTimeRef.current) / 1000));
    }, 1000);
    timeoutRef.current = setTimeout(() => {
      Alert.alert(
        '⏰ Nap Time!',
        `It's been ${fmtMins(range.maxMin)}! ${range.label} babies do best with ${fmtMins(range.minMin)}–${fmtMins(range.maxMin)} of wake time.`,
        [{ text: 'Got it' }],
      );
    }, range.maxMin * 60 * 1000);
    scheduleWindDownNow(userId ?? null, babyId, babyName ?? null, babyBirthDate).catch(() => {});
  }

  async function startSleep() {
    if (!babyId) {
      Alert.alert('No Baby Profile', 'Add a baby profile in the Profile tab first.');
      return;
    }
    clearTimers();
    modeStartTimeRef.current = Date.now();
    setElapsed(0);
    setMode('sleeping');
    intervalRef.current = setInterval(() => {
      if (modeStartTimeRef.current) setElapsed(Math.floor((Date.now() - modeStartTimeRef.current) / 1000));
    }, 1000);
    const { id } = await safeInsert('sleep_logs', {
      baby_id: babyId, sleep_type: sleepType, start_time: new Date().toISOString(),
    });
    activeSleepIdRef.current = id;
  }

  function handleWakeUp() {
    const finalSecs = modeStartTimeRef.current
      ? Math.floor((Date.now() - modeStartTimeRef.current) / 1000)
      : elapsed;
    clearTimers();
    modeStartTimeRef.current = null;
    setFinalSleepSecs(finalSecs);
    setQuality(null);
    setNotes('');
    setMode('quality');
  }

  async function saveAndStartAwake(skipQuality = false) {
    setSaving(true);
    try {
      const wasNap = sleepType === 'nap';
      const durationMinutes = Math.round(finalSleepSecs / 60);
      if (activeSleepIdRef.current) {
        await safeUpdate('sleep_logs', activeSleepIdRef.current, {
          end_time: new Date().toISOString(),
          duration_minutes: durationMinutes,
          ...(!skipQuality && quality ? { quality } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
        activeSleepIdRef.current = null;
      }
      setNotes('');
      await loadTodayLogs();
      startAwake();

      if (wasNap) {
        const result = await handleNapEnded(userId ?? null, babyId, babyBirthDate, durationMinutes);
        if (result && result.shiftedCount > 0) {
          const early = result.deltaMinutes > 0;
          Alert.alert(
            'Plans adjusted',
            `${babyName || 'Baby'} ${early ? 'woke up' : 'napped'} ${Math.abs(result.deltaMinutes)} min ${early ? 'early' : 'longer than usual'} — shifted ${result.shiftedCount} flexible task${result.shiftedCount === 1 ? '' : 's'} ${early ? 'later' : 'earlier'} on your Personal calendar.`,
          );
        }
      }
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function saveManualEntry() {
    if (!babyId) return;
    const startDate = parseTimeInput(manualStart, manualYesterday);
    const endDate   = parseTimeInput(manualEnd,   manualYesterday);
    if (!startDate || !endDate) {
      Alert.alert('Invalid Time', 'Enter times as HH:MM or H:MM AM/PM');
      return;
    }
    // Handle midnight crossing (e.g. night sleep 10:00 PM – 6:00 AM)
    if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
    if (endDate > new Date()) {
      Alert.alert('Invalid Time', 'End time cannot be in the future.');
      return;
    }
    setManualSaving(true);
    try {
      const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
      await safeInsert('sleep_logs', {
        baby_id: babyId,
        sleep_type: manualType,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        duration_minutes: durationMinutes,
        ...(manualQuality ? { quality: manualQuality } : {}),
        ...(manualNotes.trim() ? { notes: manualNotes.trim() } : {}),
      });
      await loadTodayLogs();
      setManualStart(''); setManualEnd(''); setManualNotes('');
      setManualQuality(null); setManualYesterday(false);
      setMode('idle');
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Unknown error');
    } finally {
      setManualSaving(false);
    }
  }

  // Wake window progress
  const maxSecs       = range.maxMin * 60;
  const minSecs       = range.minMin * 60;
  const awakeProgress = mode === 'awake' ? Math.min(elapsed / maxSecs, 1) : 0;
  const isOvertime    = mode === 'awake' && elapsed >= maxSecs;
  const isNapReady    = mode === 'awake' && elapsed >= minSecs && !isOvertime;
  const barColor      = isOvertime ? c.blush : isNapReady ? c.honey : c.sage;
  const statusBg      = isOvertime ? c.cardBlush : isNapReady ? c.cardHoney : c.cardSage;
  const statusClr     = isOvertime ? c.blush : isNapReady ? c.honey : c.sage;
  const statusMsg     = isOvertime ? 'Overtime — start nap now!' : isNapReady ? 'Nap window is open!' : 'In wake window';

  // Next sleep window times (shown during awake mode)
  const sleepWindowOpen  = modeStartTimeRef.current ? new Date(modeStartTimeRef.current + range.minMin * 60000) : null;
  const sleepWindowClose = modeStartTimeRef.current ? new Date(modeStartTimeRef.current + range.maxMin * 60000) : null;

  // Today's summary
  const completedLogs  = todayLogs.filter(l => l.duration_minutes != null);
  const totalSleepMins = completedLogs.reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);
  // Include current sleeping session in total for goal progress display
  const effectiveTotalMins = totalSleepMins + (mode === 'sleeping' ? Math.floor(elapsed / 60) : 0);
  const napCount       = completedLogs.filter(l => l.sleep_type === 'nap').length;
  const lastLog        = completedLogs[0];
  const lastWokeLabel  = lastLog?.end_time ? fmtTime(lastLog.end_time) : '—';

  // Sleep goal
  const goalMaxMins = sleepGoal.maxHours * 60;
  const goalPct     = Math.min(effectiveTotalMins / goalMaxMins, 1);
  const goalColor   = effectiveTotalMins >= sleepGoal.minHours * 60 ? c.sage : effectiveTotalMins >= sleepGoal.minHours * 45 ? c.honey : c.blush;

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Image source={require('../assets/moon-icon.png')} resizeMode="contain" style={[s.headerEmoji, s.moonIconXl]} />
        <Text style={s.headerTitle}>Sleep & Wake</Text>
        {loading && <ActivityIndicator size="small" color={c.lavender} />}
      </View>
      <Text style={s.ageText}>{ageLabel}</Text>

      {/* Summary row */}
      <View style={s.summaryRow}>
        <View style={s.summaryBox}>
          <Text style={s.summaryLabel}>Total sleep</Text>
          <Text style={s.summaryValue}>{effectiveTotalMins > 0 ? fmtDuration(effectiveTotalMins) : '—'}</Text>
        </View>
        <View style={s.summaryBox}>
          <Text style={s.summaryLabel}>Naps today</Text>
          <Text style={s.summaryValue}>{napCount > 0 ? `${napCount} nap${napCount !== 1 ? 's' : ''}` : '—'}</Text>
          {babyBirthDate && (
            <Text style={s.summarySubtext}>
              goal: {sleepGoal.minNaps === sleepGoal.maxNaps ? `${sleepGoal.minNaps}` : `${sleepGoal.minNaps}–${sleepGoal.maxNaps}`}
            </Text>
          )}
        </View>
        <View style={s.summaryBox}>
          <Text style={s.summaryLabel}>Last woke</Text>
          <Text style={s.summaryValue}>{lastWokeLabel}</Text>
        </View>
      </View>

      {/* Sleep goal progress bar */}
      {babyBirthDate && (
        <View style={s.goalWrap}>
          <View style={s.goalRow}>
            <Text style={s.goalLabel}>Daily sleep goal</Text>
            <Text style={s.goalValue}>
              {effectiveTotalMins > 0 ? fmtDuration(effectiveTotalMins) : '0m'} / {sleepGoal.minHours}–{sleepGoal.maxHours}h recommended
            </Text>
          </View>
          <View style={s.goalTrack}>
            <View style={[s.goalFill, { width: `${goalPct * 100}%` as any, backgroundColor: goalColor }]} />
          </View>
        </View>
      )}

      {/* Wake window suggestion (idle + awake states) */}
      {(mode === 'idle' || mode === 'awake') && (
        <View style={s.suggestionBox}>
          <Text style={s.suggestionEmoji}>😴</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.suggestionLabel}>Suggested wake window</Text>
            <Text style={s.suggestionValue}>{fmtMins(range.minMin)} – {fmtMins(range.maxMin)}</Text>
            {mode === 'awake' && sleepWindowOpen && sleepWindowClose && (
              <Text style={s.suggestionSub}>
                Sleep window: {fmtClock(sleepWindowOpen)} – {fmtClock(sleepWindowClose)}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Awake timer + progress bar */}
      {mode === 'awake' && (
        <>
          <Text style={s.timerCaption}>Awake for</Text>
          <Text style={[s.timerDisplay, { color: barColor }]}>{fmtElapsed(elapsed)}</Text>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${awakeProgress * 100}%` as any, backgroundColor: barColor }]} />
          </View>
          <View style={s.progressEndLabels}>
            <Text style={s.progressEndText}>0m</Text>
            <Text style={[s.progressEndText, { color: c.honey }]}>Nap ready at {fmtMins(range.minMin)}</Text>
            <Text style={[s.progressEndText, { color: c.blush }]}>{fmtMins(range.maxMin)}</Text>
          </View>
          <View style={[s.statusPill, { backgroundColor: statusBg }]}>
            <Text style={[s.statusPillText, { color: statusClr }]}>{statusMsg}</Text>
          </View>
        </>
      )}

      {/* Sleep timer */}
      {mode === 'sleeping' && (
        <>
          <Text style={s.timerCaption}>Sleeping for</Text>
          <Text style={[s.timerDisplay, { color: c.lavender }]}>{fmtElapsed(elapsed)}</Text>
        </>
      )}

      {/* Quality picker */}
      {mode === 'quality' && (
        <>
          <Text style={s.qualitySleptFor}>
            Baby slept for{' '}
            <Text style={s.qualitySleptForBold}>{fmtElapsed(finalSleepSecs)}</Text>
          </Text>
          <Text style={s.qualityLabel}>How did baby sleep? (optional)</Text>
          <View style={s.qualityRow}>
            {QUALITY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[s.qualityBtn, quality === opt.value && s.qualityBtnActive]}
                onPress={() => setQuality(q => q === opt.value ? null : opt.value)}
                activeOpacity={0.75}
                accessibilityRole="button" accessibilityLabel={opt.label}
              >
                <Text style={{ fontSize: 20 }}>{opt.emoji}</Text>
                <Text style={[s.qualityBtnText, quality === opt.value && s.qualityBtnTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={s.notesInput}
            placeholder="Notes (optional) — car nap, fought sleep, transferred..."
            placeholderTextColor={c.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            accessibilityLabel="Notes"
          />
        </>
      )}

      {/* Sleep type toggle — shown before sleeping */}
      {(mode === 'idle' || mode === 'awake') && (
        <View style={s.typeRow}>
          {(['nap', 'night'] as SleepType[]).map(type => (
            <TouchableOpacity
              key={type}
              style={[s.typeBtn, sleepType === type && s.typeBtnActive]}
              onPress={() => setSleepType(type)}
              activeOpacity={0.75}
              accessibilityRole="button" accessibilityLabel={type === 'nap' ? 'Nap' : 'Night sleep'}
            >
              <Text style={[s.typeBtnText, sleepType === type && s.typeBtnTextActive]}>
                {type === 'nap'
                  ? <><Image source={require('../assets/sun-icon.png')} style={s.sunIcon} />{'  Nap'}</>
                  : <><Image source={require('../assets/moon-icon.png')} resizeMode="contain" style={s.moonIcon} />{'  Night Sleep'}</>}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Action buttons */}
      {mode === 'idle' && (
        <View style={{ gap: 10 }}>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: c.cardSage, borderColor: c.sage }]}
            onPress={startAwake} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Baby is awake"
          >
            <Text style={[s.btnText, { color: c.sage }]}>
              <Image source={require('../assets/sun-icon.png')} style={s.sunIconLg} />{'  Baby is Awake'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: c.cardLavender, borderColor: c.lavender }]}
            onPress={startSleep} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Baby is sleeping"
          >
            <Text style={[s.btnText, { color: c.lavender }]}>
              <Image source={require('../assets/moon-icon.png')} resizeMode="contain" style={s.moonIconLg} />{'  Baby is Sleeping'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'awake' && (
        <TouchableOpacity
          style={[s.btn, { backgroundColor: c.cardLavender, borderColor: c.lavender }]}
          onPress={startSleep} activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel="Baby is sleeping"
        >
          <Text style={[s.btnText, { color: c.lavender }]}>
            <Image source={require('../assets/moon-icon.png')} resizeMode="contain" style={s.moonIconLg} />{'  Baby is Sleeping'}
          </Text>
        </TouchableOpacity>
      )}

      {mode === 'sleeping' && (
        <TouchableOpacity
          style={[s.btn, { backgroundColor: c.cardHoney, borderColor: c.honey }]}
          onPress={handleWakeUp} activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel="Baby woke up"
        >
          <Text style={[s.btnText, { color: c.honey }]}>
            <Image source={require('../assets/sun-icon.png')} style={s.sunIconLg} />{'  Baby Woke Up'}
          </Text>
        </TouchableOpacity>
      )}

      {mode === 'quality' && (
        <View style={{ gap: 8 }}>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: c.cardSage, borderColor: c.sage }, saving && { opacity: 0.6 }]}
            onPress={() => saveAndStartAwake(false)} disabled={saving} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Save and start wake timer"
          >
            {saving
              ? <ActivityIndicator color={c.sage} />
              : <Text style={[s.btnText, { color: c.sage }]}>Save & Start Wake Timer</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={s.skipBtn} onPress={() => saveAndStartAwake(true)} disabled={saving} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel="Skip">
            <Text style={s.skipBtnText}>Skip →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Today's sessions */}
      {completedLogs.length > 0 && (
        <View style={s.sessionsSection}>
          <Text style={s.sessionsTitle}>Today's sessions ({completedLogs.length})</Text>
          {completedLogs.map((log, i) => (
            <View key={log.id} style={[s.sessionItem, i === completedLogs.length - 1 && s.sessionItemLast]}>
              <View style={s.sessionRow}>
                <Text style={s.sessionEmoji}>
                  {log.sleep_type === 'nap'
                    ? <Image source={require('../assets/sun-icon.png')} style={s.sunIcon} />
                    : <Image source={require('../assets/moon-icon.png')} resizeMode="contain" style={s.moonIcon} />}
                </Text>
                <Text style={s.sessionTimeRange}>
                  {fmtTime(log.start_time)}{log.end_time ? ` – ${fmtTime(log.end_time)}` : ''}
                </Text>
                <Text style={s.sessionDuration}>
                  {log.duration_minutes != null ? fmtDuration(log.duration_minutes) : '—'}
                </Text>
                {log.quality && (
                  <Text style={s.sessionQuality}>
                    {QUALITY_OPTIONS.find(q => q.value === log.quality)?.emoji ?? ''}
                  </Text>
                )}
              </View>
              {log.notes ? <Text style={s.sessionNotes}>{log.notes}</Text> : null}
            </View>
          ))}
        </View>
      )}

      {/* Manual past entry */}
      {mode !== 'quality' && mode !== 'sleeping' && (
        mode === 'manual' ? (
          <View style={s.manualSection}>
            <Text style={s.manualTitle}>📝 Log past sleep</Text>

            <Text style={s.manualLabel}>Date</Text>
            <View style={s.manualDateRow}>
              {[{ label: 'Today', val: false }, { label: 'Yesterday', val: true }].map(opt => (
                <TouchableOpacity
                  key={opt.label}
                  style={[s.manualDateBtn, manualYesterday === opt.val && s.manualDateBtnActive]}
                  onPress={() => setManualYesterday(opt.val)}
                  activeOpacity={0.8}
                  accessibilityRole="button" accessibilityLabel={opt.label}
                >
                  <Text style={[s.manualDateText, manualYesterday === opt.val && s.manualDateTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.manualLabel}>Time (HH:MM or H:MM AM/PM)</Text>
            <View style={s.manualTimeRow}>
              <View style={s.manualTimeWrap}>
                <TextInput
                  style={s.manualTimeInput}
                  placeholder="10:30 AM"
                  placeholderTextColor={c.textMuted}
                  value={manualStart}
                  onChangeText={setManualStart}
                  returnKeyType="next"
                  accessibilityLabel="Start time"
                />
                <Text style={s.manualTimeLabel}>Start</Text>
              </View>
              <Text style={s.manualTimeDash}>–</Text>
              <View style={s.manualTimeWrap}>
                <TextInput
                  style={s.manualTimeInput}
                  placeholder="12:00 PM"
                  placeholderTextColor={c.textMuted}
                  value={manualEnd}
                  onChangeText={setManualEnd}
                  returnKeyType="done"
                  accessibilityLabel="End time"
                />
                <Text style={s.manualTimeLabel}>End</Text>
              </View>
            </View>

            <Text style={s.manualLabel}>Type</Text>
            <View style={[s.typeRow, { marginBottom: 14 }]}>
              {(['nap', 'night'] as SleepType[]).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[s.typeBtn, manualType === type && s.typeBtnActive]}
                  onPress={() => setManualType(type)}
                  activeOpacity={0.75}
                  accessibilityRole="button" accessibilityLabel={type === 'nap' ? 'Nap' : 'Night sleep'}
                >
                  <Text style={[s.typeBtnText, manualType === type && s.typeBtnTextActive]}>
                    {type === 'nap'
                      ? <><Image source={require('../assets/sun-icon.png')} style={s.sunIcon} />{'  Nap'}</>
                      : <><Image source={require('../assets/moon-icon.png')} resizeMode="contain" style={s.moonIcon} />{'  Night Sleep'}</>}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.manualLabel}>Quality (optional)</Text>
            <View style={[s.qualityRow, { marginBottom: 14 }]}>
              {QUALITY_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[s.qualityBtn, manualQuality === opt.value && s.qualityBtnActive]}
                  onPress={() => setManualQuality(q => q === opt.value ? null : opt.value)}
                  activeOpacity={0.75}
                  accessibilityRole="button" accessibilityLabel={opt.label}
                >
                  <Text style={{ fontSize: 20 }}>{opt.emoji}</Text>
                  <Text style={[s.qualityBtnText, manualQuality === opt.value && s.qualityBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[s.notesInput, { marginBottom: 12 }]}
              placeholder="Notes (optional)"
              placeholderTextColor={c.textMuted}
              value={manualNotes}
              onChangeText={setManualNotes}
              multiline
              accessibilityLabel="Notes"
            />

            <View style={s.btnRow}>
              <TouchableOpacity
                style={[s.btn, { flex: 1, backgroundColor: c.inputBg, borderColor: c.separator }]}
                onPress={() => setMode('idle')} activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel="Cancel"
              >
                <Text style={[s.btnText, { color: c.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btn, { flex: 2, backgroundColor: c.cardLavender, borderColor: c.lavender }, manualSaving && { opacity: 0.6 }]}
                onPress={saveManualEntry} disabled={manualSaving} activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel="Save"
              >
                {manualSaving
                  ? <ActivityIndicator color={c.lavender} />
                  : <Text style={[s.btnText, { color: c.lavender }]}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={s.logPastBtn} onPress={() => setMode('manual')} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel="Log past sleep">
            <Text style={s.logPastBtnText}>+ Log past sleep</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}
