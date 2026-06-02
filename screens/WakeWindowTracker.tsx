import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';

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

function makeWWStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      marginHorizontal: 16,
      marginBottom: 20,
      borderWidth: 1.5,
      borderColor: c.separator,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    headerEmoji: { fontSize: 22, marginRight: 8 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: c.text, flex: 1 },
    ageText: { fontSize: 13, color: c.textMuted, marginBottom: 16 },
    suggestionBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
      gap: 12,
    },
    suggestionEmoji: { fontSize: 28 },
    suggestionLabelText: { fontSize: 12, color: c.textMuted, marginBottom: 2 },
    suggestionValueText: { fontSize: 16, fontWeight: '700', color: c.text },
    awakeBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 2 },
    awakeBtnLabel: { fontSize: 15, fontWeight: '700' },
    timerSection: { marginBottom: 14 },
    timerCaption: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginBottom: 4 },
    timerDisplay: { fontSize: 36, fontWeight: '800', textAlign: 'center', letterSpacing: 1, marginBottom: 10 },
    progressTrack: {
      height: 10,
      backgroundColor: c.inputBg,
      borderRadius: 5,
      overflow: 'hidden',
      marginBottom: 6,
    },
    progressFill: { height: '100%' as any, borderRadius: 5 },
    progressEndLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    progressEndText: { fontSize: 11, color: c.textMuted },
    statusPill: {
      alignSelf: 'center',
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 99,
      marginBottom: 14,
    },
    statusPillText: { fontSize: 13, fontWeight: '700' },
    napBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 2 },
    napBtnText: { fontSize: 14, fontWeight: '700' },
  });
}

export default function WakeWindowTracker({ babyBirthDate }: { babyBirthDate: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeWWStyles(c), [c]);
  const [isAwake, setIsAwake] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const range = useMemo(() => getRange(babyBirthDate), [babyBirthDate]);

  const ageLabel = useMemo(() => {
    if (!babyBirthDate) return 'Add a baby profile to see age-specific windows';
    const days = Math.floor((Date.now() - new Date(babyBirthDate).getTime()) / (24 * 3600 * 1000));
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} old · ${range.label}`;
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return `${weeks} week${weeks !== 1 ? 's' : ''} old · ${range.label}`;
    const months = Math.floor(days / 30.44);
    return `${months} month${months !== 1 ? 's' : ''} old · ${range.label}`;
  }, [babyBirthDate, range]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function startAwake() {
    setIsAwake(true);
    setElapsed(0);
    intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

    timeoutRef.current = setTimeout(() => {
      Alert.alert(
        '⏰ Nap Time!',
        `It's been ${fmtMins(range.maxMin)}! Time to start your nap routine. ${range.label} babies do best with ${fmtMins(range.minMin)}–${fmtMins(range.maxMin)} of wake time.`,
        [{ text: 'Got it', style: 'default' }],
      );
    }, range.maxMin * 60 * 1000);
  }

  function stopAwake() {
    setIsAwake(false);
    setElapsed(0);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }

  const maxSecs = range.maxMin * 60;
  const minSecs = range.minMin * 60;
  const progress = Math.min(elapsed / maxSecs, 1);

  const isOvertime = elapsed >= maxSecs;
  const isNapReady = elapsed >= minSecs && !isOvertime;

  const barColor  = isOvertime ? c.blush : isNapReady ? c.honey : c.sage;
  const statusBg  = isOvertime ? c.cardBlush : isNapReady ? c.cardHoney : c.cardSage;
  const statusClr = isOvertime ? c.blush : isNapReady ? c.honey : c.sage;
  const statusMsg = isOvertime
    ? 'Overtime — start nap now!'
    : isNapReady
    ? 'Nap window is open!'
    : 'In wake window';

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.headerEmoji}>🌤</Text>
        <Text style={s.headerTitle}>Wake Window Tracker</Text>
      </View>
      <Text style={s.ageText}>{ageLabel}</Text>

      <View style={s.suggestionBox}>
        <Text style={s.suggestionEmoji}>😴</Text>
        <View>
          <Text style={s.suggestionLabelText}>Suggested wake window</Text>
          <Text style={s.suggestionValueText}>{fmtMins(range.minMin)} – {fmtMins(range.maxMin)}</Text>
        </View>
      </View>

      {!isAwake ? (
        <TouchableOpacity
          style={[s.awakeBtn, { backgroundColor: c.cardSage, borderColor: c.sage }]}
          onPress={startAwake}
          activeOpacity={0.8}
        >
          <Text style={[s.awakeBtnLabel, { color: c.sage }]}>☀️  Baby is Awake</Text>
        </TouchableOpacity>
      ) : (
        <>
          <View style={s.timerSection}>
            <Text style={s.timerCaption}>Awake for</Text>
            <Text style={[s.timerDisplay, { color: barColor }]}>{fmtElapsed(elapsed)}</Text>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress * 100}%` as any, backgroundColor: barColor }]} />
            </View>
            <View style={s.progressEndLabels}>
              <Text style={s.progressEndText}>0m</Text>
              <Text style={[s.progressEndText, { color: c.honey }]}>
                Nap ready at {fmtMins(range.minMin)}
              </Text>
              <Text style={[s.progressEndText, { color: c.blush }]}>{fmtMins(range.maxMin)}</Text>
            </View>
          </View>

          <View style={[s.statusPill, { backgroundColor: statusBg }]}>
            <Text style={[s.statusPillText, { color: statusClr }]}>{statusMsg}</Text>
          </View>

          <TouchableOpacity
            style={[s.napBtn, { borderColor: c.lavender }]}
            onPress={stopAwake}
            activeOpacity={0.8}
          >
            <Text style={[s.napBtnText, { color: c.lavender }]}>🌙  Baby is Napping</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
