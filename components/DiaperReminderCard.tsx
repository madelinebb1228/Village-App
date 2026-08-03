import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import {
  DiaperReminderSettings,
  cancelDiaperReminder,
  getDiaperReminderSettings,
  saveDiaperReminderSettings,
  scheduleNextDiaperReminder,
} from '../lib/diaperNotifications';

// ─── Poop color reference data ────────────────────────────────────────────────

const COLOR_GUIDE = [
  { color: '#F5D76E', label: 'Yellow',     meaning: 'Normal — typical for breastfed babies' },
  { color: '#8B5E3C', label: 'Brown',      meaning: 'Normal — typical for formula-fed babies' },
  { color: '#6B8F5E', label: 'Green',      meaning: 'Can indicate foremilk imbalance, fast gut transit, or diet change. Usually fine.' },
  { color: '#000000', label: 'Black',      meaning: 'Meconium in first 1–2 days is normal. Black stool later — contact your pediatrician.' },
  { color: '#E57373', label: 'Red',        meaning: 'Possible blood. Contact your pediatrician.' },
  { color: '#D3D3D3', label: 'White/Gray', meaning: 'Contact your pediatrician right away — may indicate a liver issue.' },
  { color: '#F4A460', label: 'Orange',     meaning: 'Usually harmless, often from certain foods or vitamins.' },
];

// ─── Quiet-hour presets ───────────────────────────────────────────────────────

const QUIET_PRESETS = [
  { label: 'None',        quietStart: null, quietEnd: null },
  { label: '9 PM – 6 AM', quietStart: 21,   quietEnd: 6   },
  { label: '10 PM – 7 AM',quietStart: 22,   quietEnd: 7   },
  { label: '11 PM – 7 AM',quietStart: 23,   quietEnd: 7   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(lastAt: Date): string {
  const ms = Date.now() - lastAt.getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function rashIsElevated(rash: string | null | undefined): boolean {
  return rash === 'moderate' || rash === 'severe';
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  userId: string | null;
  babyId: string | null;
  babyName: string | null;
  refreshKey?: number;
}

export default function DiaperReminderCard({ userId, babyId, babyName, refreshKey }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [loading,         setLoading]         = useState(true);
  const [lastLog,         setLastLog]         = useState<{ logged_at: string; rash: string | null } | null>(null);
  const [recentRash,      setRecentRash]      = useState<string[]>([]);
  const [elapsed,         setElapsed]         = useState('');
  const [showSettings,    setShowSettings]    = useState(false);
  const [showColorGuide,  setShowColorGuide]  = useState(false);
  const [settings,        setSettings]        = useState<DiaperReminderSettings>({
    enabled: false, intervalHours: 3, quietStart: null, quietEnd: null,
  });
  const [customInterval,  setCustomInterval]  = useState('');
  const [useCustom,       setUseCustom]       = useState(false);
  const [saving,          setSaving]          = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!userId || !babyId) return;
    setLoading(true);

    const [logsRes, savedSettings] = await Promise.all([
      (supabase.from('diaper_logs') as any)
        .select('logged_at, rash')
        .eq('baby_id', babyId)
        .order('logged_at', { ascending: false })
        .limit(10),
      getDiaperReminderSettings(userId, babyId),
    ]);

    const logs: { logged_at: string; rash: string | null }[] = logsRes.data ?? [];
    setLastLog(logs[0] ?? null);
    setRecentRash(logs.slice(0, 5).map(l => l.rash ?? 'none'));
    setSettings(savedSettings);

    setLoading(false);
  }, [userId, babyId, refreshKey]);

  useEffect(() => { load(); }, [load]);

  // ── Live elapsed timer ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!lastLog) { setElapsed(''); return; }
    const update = () => setElapsed(formatElapsed(new Date(lastLog.logged_at)));
    update();
    timerRef.current = setInterval(update, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [lastLog]);

  // ── Save settings & reschedule ─────────────────────────────────────────────

  async function applySettings(next: DiaperReminderSettings) {
    if (!userId || !babyId) return;
    setSaving(true);
    setSettings(next);
    await saveDiaperReminderSettings(userId, babyId, next);
    if (next.enabled && lastLog) {
      await scheduleNextDiaperReminder(
        babyId, babyName ?? 'Baby', new Date(lastLog.logged_at), next,
      );
    } else {
      await cancelDiaperReminder(babyId);
    }
    setSaving(false);
  }

  function setIntervalHours(h: number, custom = false) {
    setUseCustom(custom);
    if (!custom) setCustomInterval('');
    applySettings({ ...settings, intervalHours: h });
  }

  function commitCustomInterval() {
    const h = parseFloat(customInterval);
    if (h > 0) applySettings({ ...settings, intervalHours: h });
  }

  function setQuiet(start: number | null, end: number | null) {
    applySettings({ ...settings, quietStart: start, quietEnd: end });
  }

  // ── Rash nudge ─────────────────────────────────────────────────────────────

  const consecutiveElevated = recentRash.findIndex(r => !rashIsElevated(r));
  const showRashNudge = consecutiveElevated === -1
    ? recentRash.length >= 3
    : consecutiveElevated >= 3;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!babyId) return null;

  return (
    <View style={s.wrap}>

      {/* ── Header row: last changed + color guide ── */}
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>💩</Text>
          <View>
            <Text style={s.headerTitle}>Diaper Status</Text>
            {loading ? (
              <ActivityIndicator size="small" color={c.textMuted} style={{ alignSelf: 'flex-start' }} />
            ) : lastLog ? (
              <Text style={s.elapsedText}>Last changed {elapsed}</Text>
            ) : (
              <Text style={s.elapsedText}>No changes logged today</Text>
            )}
          </View>
        </View>
        <TouchableOpacity style={s.colorGuideBtn} onPress={() => setShowColorGuide(true)} activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel="Open poop color guide">
          <Text style={s.colorGuideBtnText}>🎨 Color guide</Text>
        </TouchableOpacity>
      </View>

      {/* ── Rash escalation nudge ── */}
      {showRashNudge && (
        <View style={s.rashNudge}>
          <Text style={s.rashNudgeTitle}>🩹 Diaper rash noticed</Text>
          <Text style={s.rashNudgeBody}>
            You've logged an elevated rash in recent changes. Your pediatrician may have cream or treatment suggestions.
          </Text>
        </View>
      )}

      {/* ── Reminder settings toggle ── */}
      <TouchableOpacity style={s.settingsToggle} onPress={() => setShowSettings(p => !p)} activeOpacity={0.8}
        accessibilityRole="button" accessibilityLabel={showSettings ? 'Hide reminder settings' : 'Show reminder settings'}>
        <View style={s.settingsToggleLeft}>
          <Text style={s.settingsToggleIcon}>🔔</Text>
          <Text style={s.settingsToggleLabel}>
            {settings.enabled
              ? `Reminder every ${settings.intervalHours}h`
              : 'Change reminder'}
          </Text>
        </View>
        <View style={s.settingsRight}>
          {saving && <ActivityIndicator size="small" color={c.sage} style={{ marginRight: 8 }} />}
          {/* Quick enable toggle always visible */}
          <TouchableOpacity
            style={[s.toggle, settings.enabled && { backgroundColor: c.trackDiaper }]}
            onPress={() => applySettings({ ...settings, enabled: !settings.enabled })}
            activeOpacity={0.8}
            accessibilityRole="switch" accessibilityLabel="Diaper change reminders" accessibilityState={{ checked: settings.enabled }}
          >
            <View style={[s.toggleThumb, settings.enabled && { transform: [{ translateX: 20 }] }]} />
          </TouchableOpacity>
          <Text style={s.chevron}>{showSettings ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {showSettings && (
        <View style={s.settingsBody}>

          <Text style={s.settingsLabel}>Remind me after</Text>
          <View style={s.chipRow}>
            {[
              { h: 2,  label: '2 hours' },
              { h: 3,  label: '3 hours' },
              { h: 4,  label: '4 hours' },
              { h: -1, label: 'Other…'  },
            ].map(opt => {
              const active = opt.h === -1 ? useCustom : (!useCustom && settings.intervalHours === opt.h);
              return (
                <TouchableOpacity
                  key={opt.h}
                  style={[s.chip, active && { backgroundColor: c.cardSage, borderColor: c.sage }]}
                  onPress={() => {
                    if (opt.h === -1) { setUseCustom(true); }
                    else setIntervalHours(opt.h);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button" accessibilityLabel={opt.label}
                >
                  <Text style={[s.chipText, active && { color: c.sage, fontWeight: '700' }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {useCustom && (
            <View style={s.customRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Hours between changes"
                placeholderTextColor={c.textMuted}
                keyboardType="numeric"
                value={customInterval}
                onChangeText={v => setCustomInterval(v.replace(/[^0-9.]/g, ''))}
                onEndEditing={commitCustomInterval}
                returnKeyType="done"
                onSubmitEditing={commitCustomInterval}
                accessibilityLabel="Hours between changes"
              />
              <Text style={s.customUnit}>hours</Text>
            </View>
          )}

          <Text style={s.settingsLabel}>Quiet hours (no notifications)</Text>
          <View style={s.chipRow}>
            {QUIET_PRESETS.map(p => {
              const active = settings.quietStart === p.quietStart && settings.quietEnd === p.quietEnd;
              return (
                <TouchableOpacity
                  key={p.label}
                  style={[s.chip, active && { backgroundColor: c.cardLavender, borderColor: c.lavender }]}
                  onPress={() => setQuiet(p.quietStart, p.quietEnd)}
                  activeOpacity={0.8}
                  accessibilityRole="button" accessibilityLabel={p.label}
                >
                  <Text style={[s.chipText, active && { color: c.lavender, fontWeight: '700' }]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {settings.enabled && lastLog && (
            <Text style={s.nextReminderNote}>
              🔔 Next reminder scheduled for{' '}
              {new Date(
                new Date(lastLog.logged_at).getTime() + settings.intervalHours * 3_600_000,
              ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </Text>
          )}
        </View>
      )}

      {/* ══ Color guide modal ═════════════════════════════════════════════════ */}
      <Modal visible={showColorGuide} transparent animationType="slide" onRequestClose={() => setShowColorGuide(false)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowColorGuide(false)}
            accessibilityRole="button" accessibilityLabel="Close" />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>🎨 Poop Color Guide</Text>
            <Text style={s.modalSubtitle}>What do different colors mean?</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 8 }}>
              {COLOR_GUIDE.map(entry => (
                <View key={entry.label} style={s.colorRow}>
                  <View style={[s.colorSwatch, { backgroundColor: entry.color }]} />
                  <View style={s.colorInfo}>
                    <Text style={s.colorLabel}>{entry.label}</Text>
                    <Text style={s.colorMeaning}>{entry.meaning}</Text>
                  </View>
                </View>
              ))}
              <Text style={s.colorDisclaimer}>
                This is general guidance only. When in doubt, contact your pediatrician.
              </Text>
            </ScrollView>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowColorGuide(false)} activeOpacity={0.8}
              accessibilityRole="button" accessibilityLabel="Got it">
              <Text style={s.closeBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.card, borderRadius: 16, marginBottom: 16,
      borderWidth: 1.5, borderColor: c.separator, overflow: 'hidden',
    },

    headerRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: 14, borderLeftWidth: 4, borderLeftColor: c.trackDiaper,
    },
    headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerEmoji: { fontSize: 26 },
    headerTitle: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    elapsedText: { fontSize: 12, color: c.textMuted, marginTop: 2 },

    colorGuideBtn:     { backgroundColor: c.cardSage, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5, borderColor: '#A7F3D0' },
    colorGuideBtnText: { fontSize: 12, fontWeight: '700', color: c.sage },

    rashNudge:     { margin: 12, marginTop: 0, backgroundColor: '#FDE68A', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#D97706' },
    rashNudgeTitle:{ fontSize: 13, fontWeight: '800', color: '#92400E', marginBottom: 4 },
    rashNudgeBody: { fontSize: 12, color: '#92400E', lineHeight: 17 },

    settingsToggle:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.separator },
    settingsToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    settingsToggleIcon: { fontSize: 16 },
    settingsToggleLabel:{ fontSize: 14, fontWeight: '600', color: c.textPrimary },
    settingsRight:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
    toggle:    { width: 46, height: 26, borderRadius: 13, backgroundColor: c.separator, justifyContent: 'center', paddingHorizontal: 2 },
    toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    chevron:   { fontSize: 11, color: c.textMuted, marginLeft: 4 },

    settingsBody:  { paddingHorizontal: 14, paddingBottom: 14, gap: 8, borderTopWidth: 1, borderTopColor: c.separator },
    settingsLabel: { fontSize: 12, fontWeight: '700', color: c.textSecondary, marginTop: 8 },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:    { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    chipText:{ fontSize: 13, color: c.textSecondary },

    customRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    customUnit: { fontSize: 14, color: c.textSecondary, fontWeight: '600' },
    input:      { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary },

    nextReminderNote: { fontSize: 12, color: c.textMuted, fontStyle: 'italic', marginTop: 4 },

    // Color guide modal
    modalOverlay:  { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    modalSheet:    { backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, maxHeight: '80%' },
    modalHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: c.separator, alignSelf: 'center', marginBottom: 16 },
    modalTitle:    { fontSize: 20, fontWeight: '900', color: c.textPrimary },
    modalSubtitle: { fontSize: 13, color: c.textMuted, marginTop: 4 },

    colorRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.separator },
    colorSwatch: { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, flexShrink: 0 },
    colorInfo:   { flex: 1 },
    colorLabel:  { fontSize: 14, fontWeight: '800', color: c.textPrimary },
    colorMeaning:{ fontSize: 13, color: c.textSecondary, lineHeight: 18, marginTop: 2 },
    colorDisclaimer: { fontSize: 11, color: c.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: 16, marginBottom: 8 },

    closeBtn:    { backgroundColor: c.trackDiaper, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
    closeBtnText:{ fontSize: 15, fontWeight: '800', color: '#fff' },
  });
}
