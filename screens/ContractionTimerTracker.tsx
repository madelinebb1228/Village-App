import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete } from '../lib/syncService';

function historyStart() {
  const d = new Date();
  d.setHours(d.getHours() - 24);
  return d.toISOString();
}

function fmtElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

interface ContractionLog {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

export default function ContractionTimerTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [history,  setHistory]  = useState<ContractionLog[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(false);

  const [activeId,   setActiveId]   = useState<string | null>(null);
  const [activeStart, setActiveStart] = useState<string | null>(null);
  const [elapsed,    setElapsed]    = useState(0);
  const [saving,     setSaving]     = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await (supabase.from('mom_contraction_logs') as any)
      .select('*').eq('user_id', userId)
      .gte('started_at', historyStart())
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false });
    setHistory(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!activeId) return;
    intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeId]);

  async function startContraction() {
    if (!userId) return;
    const startedAt = new Date().toISOString();
    setElapsed(0);
    setActiveStart(startedAt);
    const { id } = await safeInsert('mom_contraction_logs', { user_id: userId, started_at: startedAt });
    setActiveId(id);
    setExpanded(true);
  }

  async function endContraction() {
    if (!activeId) return;
    setSaving(true);
    await safeUpdate('mom_contraction_logs', activeId, {
      ended_at: new Date().toISOString(),
      duration_seconds: elapsed,
    });
    setSaving(false);
    setActiveId(null);
    setActiveStart(null);
    load();
  }

  async function deleteEntry(id: string) {
    await safeDelete('mom_contraction_logs', id);
    setHistory(prev => prev.filter(h => h.id !== id));
  }

  // Intervals measured start-to-start between consecutive contractions.
  const withIntervals = useMemo(() => {
    return history.map((h, i) => {
      const prev = history[i + 1]; // history is newest-first
      const intervalSeconds = prev ? Math.round((new Date(h.started_at).getTime() - new Date(prev.started_at).getTime()) / 1000) : null;
      return { ...h, intervalSeconds };
    });
  }, [history]);

  // 5-1-1 rule: contractions ~5 min apart, lasting ~1 min, for at least an hour.
  const patternMatch = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    const recent = withIntervals.filter(h => new Date(h.started_at).getTime() >= cutoff && h.intervalSeconds != null);
    if (recent.length < 4) return false;
    const avgInterval = recent.reduce((sum, h) => sum + (h.intervalSeconds ?? 0), 0) / recent.length;
    const withDuration = recent.filter(h => h.duration_seconds != null);
    const avgDuration = withDuration.length
      ? withDuration.reduce((sum, h) => sum + (h.duration_seconds ?? 0), 0) / withDuration.length
      : 0;
    return avgInterval <= 300 && avgDuration >= 60;
  }, [withIntervals]);

  if (loading) return <ActivityIndicator color={c.primary} style={{ margin: 24 }} />;

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(p => !p)} activeOpacity={0.8}
        accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse Contraction Timer section' : 'Expand Contraction Timer section'}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>⏱️</Text>
          <View>
            <Text style={s.headerTitle}>Contraction Timer</Text>
            <Text style={s.headerSub}>
              {activeId ? 'Timing in progress…' :
                history[0] ? `Last: ${fmtTime(history[0].started_at)}` : 'Tap to start timing'}
            </Text>
          </View>
        </View>
        <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={s.body}>
          {patternMatch && (
            <View style={s.patternBanner}>
              <Text style={s.patternText}>
                ⚠️ Your last hour matches the 5-1-1 pattern (about 5 min apart, lasting 1 min). Many providers use this as a cue to call or head in — check with yours.
              </Text>
            </View>
          )}

          {!activeId ? (
            <TouchableOpacity style={s.startBtn} onPress={startContraction} activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel="Start timing a contraction">
              <Text style={s.startBtnText}>Start Contraction</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.activeCard}>
              <Text style={s.elapsedText}>{fmtElapsed(elapsed)}</Text>
              <Text style={s.activeSub}>Started at {activeStart ? fmtTime(activeStart) : ''}</Text>
              <TouchableOpacity style={s.endBtn} onPress={endContraction} disabled={saving} activeOpacity={0.85}
                accessibilityRole="button" accessibilityLabel="End contraction">
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.endBtnText}>End Contraction</Text>}
              </TouchableOpacity>
            </View>
          )}

          {withIntervals.length > 0 && (
            <View style={s.histWrap}>
              <Text style={s.histTitle}>Last 24 hours</Text>
              {withIntervals.slice(0, 20).map(h => (
                <View key={h.id} style={s.entryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.entryName}>{fmtTime(h.started_at)}</Text>
                    <Text style={s.histMeta}>
                      {h.duration_seconds != null ? `Lasted ${fmtElapsed(h.duration_seconds)}` : 'In progress'}
                      {h.intervalSeconds != null ? ` · ${fmtElapsed(h.intervalSeconds)} since previous` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteEntry(h.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button" accessibilityLabel="Delete contraction">
                    <Text style={[s.entryAction, { color: c.textMuted }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderLeftWidth: 4, borderLeftColor: c.lavender },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerEmoji: { fontSize: 28 },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    headerSub:   { fontSize: 12, color: c.textMuted, marginTop: 2 },
    chevron:     { fontSize: 12, color: c.textMuted },
    body:        { padding: 16, borderTopWidth: 1, borderTopColor: c.separator },

    patternBanner: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#FDE68A' },
    patternText: { fontSize: 12, fontWeight: '600', color: '#92400E', lineHeight: 17 },

    startBtn: { backgroundColor: c.lavender, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    startBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

    activeCard: { backgroundColor: c.cardLavender, borderRadius: 16, padding: 20, alignItems: 'center' },
    elapsedText: { fontSize: 36, fontWeight: '800', color: c.textPrimary, fontVariant: ['tabular-nums'] },
    activeSub: { fontSize: 12, color: c.textMuted, marginTop: 4, marginBottom: 14 },

    endBtn: { backgroundColor: c.lavender, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
    endBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    entryRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.separator },
    entryName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    entryAction: { fontSize: 15, paddingHorizontal: 2 },

    histWrap:  { marginTop: 16 },
    histTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 4 },
    histMeta:  { fontSize: 11, color: c.textMuted, marginTop: 1 },
  });
}
