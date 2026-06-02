import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';

type Mode = 'idle' | 'awake' | 'sleeping' | 'quality';
type SleepType = 'nap' | 'night';
type SleepQuality = 'great' | 'good' | 'fair' | 'poor';

type SleepLog = {
  id: string;
  sleep_type: SleepType;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  quality: SleepQuality | null;
};

type WakeRange = { maxWeeks: number; label: string; minMin: number; maxMin: number };

const WAKE_RANGES: WakeRange[] = [
  { maxWeeks: 4,    label: 'Newborn (0–4 weeks)',  minMin: 45,  maxMin: 60  },
  { maxWeeks: 8,    label: '1–2 months',            minMin: 60,  maxMin: 90  },
  { maxWeeks: 12,   label: '2–3 months',            minMin: 75,  maxMin: 90  },
  { maxWeeks: 16,   label: '3–4 months',            minMin: 90,  maxMin: 120 },
  { maxWeeks: 20,   label: '4–5 months',            minMin: 90,  maxMin: 120 },
  { maxWeeks: 24,   label: '5–6 months',            minMin: 90,  maxMin: 150 },
  { maxWeeks: 36,   label: '6–9 months',            minMin: 120, maxMin: 180 },
  { maxWeeks: 52,   label: '9–12 months',           minMin: 150, maxMin: 210 },
  { maxWeeks: 78,   label: '12–18 months',          minMin: 180, maxMin: 300 },
  { maxWeeks: 104,  label: '18–24 months',          minMin: 240, maxMin: 360 },
  { maxWeeks: 9999, label: '2+ years',              minMin: 300, maxMin: 480 },
];

const QUALITY_OPTIONS: { value: SleepQuality; emoji: string; label: string }[] = [
  { value: 'great', emoji: '😊', label: 'Great' },
  { value: 'good',  emoji: '🙂', label: 'Good'  },
  { value: 'fair',  emoji: '😐', label: 'Fair'  },
  { value: 'poor',  emoji: '😣', label: 'Poor'  },
];

function getRange(birthDate: string | null): WakeRange {
  if (!birthDate) return WAKE_RANGES[1];
  const ageWeeks = Math.floor((Date.now() - new Date(birthDate).getTime()) / (7 * 24 * 3600 * 1000));
  return WAKE_RANGES.find(r => ageWeeks < r.maxWeeks) ?? WAKE_RANGES[WAKE_RANGES.length - 1];
}

function fmtMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
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
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.card, borderRadius: 16, padding: 20,
      marginHorizontal: 16, marginBottom: 20, borderWidth: 1.5, borderColor: c.separator,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    headerEmoji: { fontSize: 22, marginRight: 8 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: c.text, flex: 1 },
    ageText: { fontSize: 13, color: c.textMuted, marginBottom: 14 },
    // Summary
    summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    summaryBox: {
      flex: 1, backgroundColor: c.inputBg, borderRadius: 12, padding: 10, alignItems: 'center',
    },
    summaryLabel: { fontSize: 10, color: c.textMuted, marginBottom: 3, textAlign: 'center' },
    summaryValue: { fontSize: 14, fontWeight: '700', color: c.text },
    // Wake window suggestion
    suggestionBox: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: c.inputBg,
      borderRadius: 12, padding: 14, marginBottom: 14, gap: 12,
    },
    suggestionEmoji: { fontSize: 26 },
    suggestionLabel: { fontSize: 12, color: c.textMuted, marginBottom: 2 },
    suggestionValue: { fontSize: 16, fontWeight: '700', color: c.text },
    // Timers
    timerCaption: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginBottom: 4 },
    timerDisplay: { fontSize: 36, fontWeight: '800', textAlign: 'center', letterSpacing: 1, marginBottom: 10 },
    // Wake progress bar
    progressTrack: {
      height: 10, backgroundColor: c.inputBg, borderRadius: 5, overflow: 'hidden', marginBottom: 6,
    },
    progressFill: { height: '100%' as any, borderRadius: 5 },
    progressEndLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    progressEndText: { fontSize: 11, color: c.textMuted },
    statusPill: {
      alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, marginBottom: 14,
    },
    statusPillText: { fontSize: 13, fontWeight: '700' },
    // Sleep type toggle
    typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    typeBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
      borderWidth: 2, borderColor: c.separator, backgroundColor: c.inputBg,
    },
    typeBtnActive: { borderColor: c.lavender, backgroundColor: c.cardLavender },
    typeBtnText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
    typeBtnTextActive: { color: c.lavender },
    // Buttons
    btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 2 },
    btnText: { fontSize: 15, fontWeight: '700' },
    // Quality
    qualitySleptFor: { fontSize: 14, textAlign: 'center', color: c.textSecondary, marginBottom: 12 },
    qualitySleptForBold: { fontWeight: '700', color: c.text },
    qualityLabel: { fontSize: 13, color: c.textMuted, textAlign: 'center', marginBottom: 8 },
    qualityRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    qualityBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
      borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.inputBg,
    },
    qualityBtnActive: { borderColor: c.sage, backgroundColor: c.cardSage },
    qualityBtnText: { fontSize: 12, fontWeight: '600', color: c.textSecondary, marginTop: 2 },
    qualityBtnTextActive: { color: c.sage },
    // Sessions list
    sessionsSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: c.separator, paddingTop: 12 },
    sessionsTitle: { fontSize: 12, color: c.textMuted, fontWeight: '600', marginBottom: 6 },
    sessionItem: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    sessionItemLast: { borderBottomWidth: 0 },
    sessionEmoji: { fontSize: 14, marginRight: 8, width: 20 },
    sessionTimeRange: { flex: 1, fontSize: 13, color: c.text },
    sessionDuration: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    sessionQuality: { fontSize: 14, marginLeft: 6 },
  });
}

export default function SleepTracker({
  babyId,
  babyBirthDate,
}: {
  babyId: string | null;
  babyBirthDate: string | null;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [mode, setMode] = useState<Mode>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [sleepType, setSleepType] = useState<SleepType>('nap');
  const [quality, setQuality] = useState<SleepQuality | null>(null);
  const [finalSleepSecs, setFinalSleepSecs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [todayLogs, setTodayLogs] = useState<SleepLog[]>([]);

  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef       = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const activeSleepIdRef = useRef<string | null>(null);
  // Wall-clock start time for the current timed mode (ms since epoch).
  // Elapsed is always computed as Date.now() - modeStartTimeRef so that
  // backgrounded/throttled intervals self-correct on the next tick.
  const modeStartTimeRef = useRef<number | null>(null);
  const modeRef          = useRef<Mode>('idle');

  const range = useMemo(() => getRange(babyBirthDate), [babyBirthDate]);

  const ageLabel = useMemo(() => {
    if (!babyBirthDate) return 'Add a baby profile to see age-specific windows';
    const days = Math.floor((Date.now() - new Date(babyBirthDate).getTime()) / (24 * 3600 * 1000));
    if (days < 7)   return `${days} day${days !== 1 ? 's' : ''} old · ${range.label}`;
    const weeks = Math.floor(days / 7);
    if (weeks < 8)  return `${weeks} week${weeks !== 1 ? 's' : ''} old · ${range.label}`;
    const months = Math.floor(days / 30.44);
    return `${months} month${months !== 1 ? 's' : ''} old · ${range.label}`;
  }, [babyBirthDate, range]);

  useEffect(() => {
    loadTodayLogs();
    if (babyId) checkActiveSession();
    return () => clearTimers();
  }, [babyId]);

  // Keep modeRef in sync so the AppState callback always sees the current mode.
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Re-sync timer whenever the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') return;
      if (!modeStartTimeRef.current) return;
      const secs = Math.floor((Date.now() - modeStartTimeRef.current) / 1000);
      setElapsed(secs);
      // Fire the nap-time alert if wake window expired while backgrounded.
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
        .select('id, sleep_type, start_time, end_time, duration_minutes, quality')
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

  // Resume any in-progress sleep session from Supabase (survives app restarts)
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
    // Fallback alert when app stays open; AppState handler covers the backgrounded case.
    timeoutRef.current = setTimeout(() => {
      Alert.alert(
        '⏰ Nap Time!',
        `It's been ${fmtMins(range.maxMin)}! ${range.label} babies do best with ${fmtMins(range.minMin)}–${fmtMins(range.maxMin)} of wake time.`,
        [{ text: 'Got it' }],
      );
    }, range.maxMin * 60 * 1000);
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

    const { data } = await supabase
      .from('sleep_logs')
      .insert({ baby_id: babyId, sleep_type: sleepType, start_time: new Date().toISOString() })
      .select('id')
      .single();
    if (data) activeSleepIdRef.current = data.id;
  }

  function handleWakeUp() {
    const finalSecs = modeStartTimeRef.current
      ? Math.floor((Date.now() - modeStartTimeRef.current) / 1000)
      : elapsed;
    clearTimers();
    modeStartTimeRef.current = null;
    setFinalSleepSecs(finalSecs);
    setQuality(null);
    setMode('quality');
  }

  async function saveAndStartAwake() {
    setSaving(true);
    try {
      if (activeSleepIdRef.current) {
        await supabase.from('sleep_logs').update({
          end_time: new Date().toISOString(),
          duration_minutes: Math.round(finalSleepSecs / 60),
          quality,
        }).eq('id', activeSleepIdRef.current);
        activeSleepIdRef.current = null;
      }
      await loadTodayLogs();
      startAwake();
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  // Wake window progress
  const maxSecs      = range.maxMin * 60;
  const minSecs      = range.minMin * 60;
  const awakeProgress = mode === 'awake' ? Math.min(elapsed / maxSecs, 1) : 0;
  const isOvertime   = mode === 'awake' && elapsed >= maxSecs;
  const isNapReady   = mode === 'awake' && elapsed >= minSecs && !isOvertime;
  const barColor     = isOvertime ? c.blush : isNapReady ? c.honey : c.sage;
  const statusBg     = isOvertime ? c.cardBlush : isNapReady ? c.cardHoney : c.cardSage;
  const statusClr    = isOvertime ? c.blush : isNapReady ? c.honey : c.sage;
  const statusMsg    = isOvertime ? 'Overtime — start nap now!' : isNapReady ? 'Nap window is open!' : 'In wake window';

  // Today's summary
  const completedLogs  = todayLogs.filter(l => l.duration_minutes != null);
  const totalSleepMins = completedLogs.reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);
  const napCount       = completedLogs.filter(l => l.sleep_type === 'nap').length;
  const lastLog        = completedLogs[0];
  const lastWokeLabel  = lastLog?.end_time ? fmtTime(lastLog.end_time) : '—';

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.headerEmoji}>🌙</Text>
        <Text style={s.headerTitle}>Sleep & Wake</Text>
        {loading && <ActivityIndicator size="small" color={c.lavender} />}
      </View>
      <Text style={s.ageText}>{ageLabel}</Text>

      {/* Summary row */}
      <View style={s.summaryRow}>
        <View style={s.summaryBox}>
          <Text style={s.summaryLabel}>Total sleep</Text>
          <Text style={s.summaryValue}>{totalSleepMins > 0 ? fmtDuration(totalSleepMins) : '—'}</Text>
        </View>
        <View style={s.summaryBox}>
          <Text style={s.summaryLabel}>Naps today</Text>
          <Text style={s.summaryValue}>{napCount > 0 ? `${napCount} nap${napCount !== 1 ? 's' : ''}` : '—'}</Text>
        </View>
        <View style={s.summaryBox}>
          <Text style={s.summaryLabel}>Last woke</Text>
          <Text style={s.summaryValue}>{lastWokeLabel}</Text>
        </View>
      </View>

      {/* Wake window suggestion (idle + awake states) */}
      {(mode === 'idle' || mode === 'awake') && (
        <View style={s.suggestionBox}>
          <Text style={s.suggestionEmoji}>😴</Text>
          <View>
            <Text style={s.suggestionLabel}>Suggested wake window</Text>
            <Text style={s.suggestionValue}>{fmtMins(range.minMin)} – {fmtMins(range.maxMin)}</Text>
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
          <Text style={s.qualityLabel}>How did baby sleep?</Text>
          <View style={s.qualityRow}>
            {QUALITY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[s.qualityBtn, quality === opt.value && s.qualityBtnActive]}
                onPress={() => setQuality(opt.value)}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 20 }}>{opt.emoji}</Text>
                <Text style={[s.qualityBtnText, quality === opt.value && s.qualityBtnTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
            >
              <Text style={[s.typeBtnText, sleepType === type && s.typeBtnTextActive]}>
                {type === 'nap' ? '☀️  Nap' : '🌙  Night Sleep'}
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
          >
            <Text style={[s.btnText, { color: c.sage }]}>☀️  Baby is Awake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: c.cardLavender, borderColor: c.lavender }]}
            onPress={startSleep} activeOpacity={0.8}
          >
            <Text style={[s.btnText, { color: c.lavender }]}>🌙  Baby is Sleeping</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'awake' && (
        <TouchableOpacity
          style={[s.btn, { backgroundColor: c.cardLavender, borderColor: c.lavender }]}
          onPress={startSleep} activeOpacity={0.8}
        >
          <Text style={[s.btnText, { color: c.lavender }]}>🌙  Baby is Sleeping</Text>
        </TouchableOpacity>
      )}

      {mode === 'sleeping' && (
        <TouchableOpacity
          style={[s.btn, { backgroundColor: c.cardHoney, borderColor: c.honey }]}
          onPress={handleWakeUp} activeOpacity={0.8}
        >
          <Text style={[s.btnText, { color: c.honey }]}>☀️  Baby Woke Up</Text>
        </TouchableOpacity>
      )}

      {mode === 'quality' && (
        <TouchableOpacity
          style={[s.btn, { backgroundColor: c.cardSage, borderColor: c.sage }, saving && { opacity: 0.6 }]}
          onPress={saveAndStartAwake} disabled={saving} activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator color={c.sage} />
            : <Text style={[s.btnText, { color: c.sage }]}>Save & Start Wake Timer</Text>
          }
        </TouchableOpacity>
      )}

      {/* All today's sessions — no cap, newborns have many naps */}
      {completedLogs.length > 0 && (
        <View style={s.sessionsSection}>
          <Text style={s.sessionsTitle}>
            Today's sessions ({completedLogs.length})
          </Text>
          {completedLogs.map((log, i) => (
            <View
              key={log.id}
              style={[s.sessionItem, i === completedLogs.length - 1 && s.sessionItemLast]}
            >
              <Text style={s.sessionEmoji}>{log.sleep_type === 'nap' ? '☀️' : '🌙'}</Text>
              <Text style={s.sessionTimeRange}>
                {fmtTime(log.start_time)}
                {log.end_time ? ` – ${fmtTime(log.end_time)}` : ''}
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
          ))}
        </View>
      )}
    </View>
  );
}
