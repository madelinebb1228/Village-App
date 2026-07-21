import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import {
  FeedReminderSettings,
  cancelFeedReminder,
  getFeedReminderSettings,
  saveFeedReminderSettings,
  scheduleNextFeedReminder,
} from '../lib/feedNotifications';

// ─── Quiet-hour presets ───────────────────────────────────────────────────────

const QUIET_PRESETS = [
  { label: 'None',         quietStart: null, quietEnd: null },
  { label: '9 PM – 6 AM',  quietStart: 21,   quietEnd: 6   },
  { label: '10 PM – 7 AM', quietStart: 22,   quietEnd: 7   },
  { label: '11 PM – 7 AM', quietStart: 23,   quietEnd: 7   },
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

function feedSummary(log: LastFeedLog): string {
  if (log.feed_type === 'breast') {
    const side = log.breast_side === 'both' ? 'both sides'
      : log.breast_side === 'left' ? 'left breast'
      : log.breast_side === 'right' ? 'right breast'
      : 'breast';
    const dur = log.duration_seconds ? ` · ${Math.round(log.duration_seconds / 60)}m` : '';
    return `${side}${dur}`;
  }
  if (log.feed_type === 'bottle') {
    const src = log.bottle_source === 'mixed' ? 'mixed'
      : log.bottle_source === 'formula' ? 'formula'
      : 'breastmilk';
    const total = (log.breastmilk_oz ?? 0) + (log.formula_oz ?? 0) + (log.bottle_amount_oz ?? 0);
    return total > 0 ? `${total.toFixed(1)} oz ${src}` : src;
  }
  if (log.feed_type === 'solids') return 'solids';
  return log.feed_type ?? '';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface LastFeedLog {
  logged_at: string;
  feed_type: string | null;
  breast_side: string | null;
  duration_seconds: number | null;
  bottle_source: string | null;
  bottle_amount_oz: number | null;
  breastmilk_oz: number | null;
  formula_oz: number | null;
}

interface Props {
  userId: string | null;
  babyId: string | null;
  babyName: string | null;
  onLastFeedLoaded?: (log: LastFeedLog | null) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FeedReminderCard({ userId, babyId, babyName, onLastFeedLoaded }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [loading,       setLoading]       = useState(true);
  const [lastLog,       setLastLog]       = useState<LastFeedLog | null>(null);
  const [elapsed,       setElapsed]       = useState('');
  const [showSettings,  setShowSettings]  = useState(false);
  const [settings,      setSettings]      = useState<FeedReminderSettings>({
    enabled: false, intervalHours: 3, quietStart: null, quietEnd: null,
  });
  const [customInterval,setCustomInterval]= useState('');
  const [useCustom,     setUseCustom]     = useState(false);
  const [saving,        setSaving]        = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load last feed ─────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!userId || !babyId) return;
    setLoading(true);
    const [logsRes, savedSettings] = await Promise.all([
      (supabase.from('feeds') as any)
        .select('logged_at,feed_type,breast_side,duration_seconds,bottle_source,bottle_amount_oz,breastmilk_oz,formula_oz')
        .eq('baby_id', babyId)
        .order('logged_at', { ascending: false })
        .limit(1),
      getFeedReminderSettings(userId, babyId),
    ]);
    const log: LastFeedLog | null = logsRes.data?.[0] ?? null;
    setLastLog(log);
    setSettings(savedSettings);
    onLastFeedLoaded?.(log);
    setLoading(false);
  }, [userId, babyId, onLastFeedLoaded]);

  useEffect(() => { load(); }, [load]);

  // ── Live elapsed timer ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!lastLog) { setElapsed(''); return; }
    const update = () => setElapsed(formatElapsed(new Date(lastLog.logged_at)));
    update();
    timerRef.current = setInterval(update, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [lastLog]);

  // ── Settings helpers ───────────────────────────────────────────────────────

  async function applySettings(next: FeedReminderSettings) {
    if (!userId || !babyId) return;
    setSaving(true);
    setSettings(next);
    await saveFeedReminderSettings(userId, babyId, next);
    if (next.enabled && lastLog) {
      await scheduleNextFeedReminder(
        babyId, babyName ?? 'Baby', new Date(lastLog.logged_at), next,
      );
    } else {
      await cancelFeedReminder(babyId);
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

  if (!babyId) return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.wrap}>

      {/* ── Header: last fed info ── */}
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>🍼</Text>
          <View>
            <Text style={s.headerTitle}>Last Feed</Text>
            {loading ? (
              <ActivityIndicator size="small" color={c.textMuted} style={{ alignSelf: 'flex-start' }} />
            ) : lastLog ? (
              <Text style={s.elapsedText}>
                {elapsed} · {feedSummary(lastLog)}
              </Text>
            ) : (
              <Text style={s.elapsedText}>No feeds logged yet</Text>
            )}
          </View>
        </View>
      </View>

      {/* ── Reminder toggle ── */}
      <TouchableOpacity style={s.settingsToggle} onPress={() => setShowSettings(p => !p)} activeOpacity={0.8}>
        <View style={s.settingsToggleLeft}>
          <Text style={s.settingsToggleIcon}>🔔</Text>
          <Text style={s.settingsToggleLabel}>
            {settings.enabled
              ? `Feed reminder every ${settings.intervalHours}h`
              : 'Feed reminder'}
          </Text>
        </View>
        <View style={s.settingsRight}>
          {saving && <ActivityIndicator size="small" color={c.trackFeed} style={{ marginRight: 8 }} />}
          <TouchableOpacity
            style={[s.toggle, settings.enabled && { backgroundColor: c.trackFeed }]}
            onPress={() => applySettings({ ...settings, enabled: !settings.enabled })}
            activeOpacity={0.8}
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
                  style={[s.chip, active && { backgroundColor: c.cardLavender, borderColor: c.lavender }]}
                  onPress={() => {
                    if (opt.h === -1) setUseCustom(true);
                    else setIntervalHours(opt.h);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.chipText, active && { color: c.lavender, fontWeight: '700' }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {useCustom && (
            <View style={s.customRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Hours between feeds"
                placeholderTextColor={c.textMuted}
                keyboardType="numeric"
                value={customInterval}
                onChangeText={v => setCustomInterval(v.replace(/[^0-9.]/g, ''))}
                onEndEditing={commitCustomInterval}
                returnKeyType="done"
                onSubmitEditing={commitCustomInterval}
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
                >
                  <Text style={[s.chipText, active && { color: c.lavender, fontWeight: '700' }]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {settings.enabled && lastLog && (
            <Text style={s.nextNote}>
              🔔 Next reminder ~{new Date(
                new Date(lastLog.logged_at).getTime() + settings.intervalHours * 3_600_000,
              ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </Text>
          )}
        </View>
      )}
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
    headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderLeftWidth: 4, borderLeftColor: c.trackFeed },
    headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerEmoji: { fontSize: 26 },
    headerTitle: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    elapsedText: { fontSize: 12, color: c.textMuted, marginTop: 2 },

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
    customRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    customUnit:  { fontSize: 14, color: c.textSecondary, fontWeight: '600' },
    input:       { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary },
    nextNote:    { fontSize: 12, color: c.textMuted, fontStyle: 'italic', marginTop: 4 },
  });
}
