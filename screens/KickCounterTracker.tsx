import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';
import TrackerHeader from '../components/TrackerHeader';
import { useCollapsed } from '../lib/useCollapsed';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete } from '../lib/syncService';

// Standard "count to 10" method: most kicks are felt within 2 hours; a
// session running long is worth flagging so parents know to check in with
// their provider (reduced fetal movement is a recognized warning sign).
const KICK_GOAL = 10;
const LONG_SESSION_SECONDS = 2 * 60 * 60;

function historyStart() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

function fmtElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

interface KickSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  kick_count: number;
  duration_seconds: number | null;
}

export default function KickCounterTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [history,  setHistory]  = useState<KickSession[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, toggleExpanded, setExpanded] = useCollapsed('kick_counter_collapsed');

  const [activeId, setActiveId]   = useState<string | null>(null);
  const [kicks,    setKicks]      = useState(0);
  const [elapsed,  setElapsed]    = useState(0);
  const [saving,   setSaving]     = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await (supabase.from('mom_kick_sessions') as any)
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

  async function startSession() {
    if (!userId) return;
    const startedAt = new Date().toISOString();
    startedAtRef.current = startedAt;
    setKicks(0);
    setElapsed(0);
    const { id } = await safeInsert('mom_kick_sessions', { user_id: userId, started_at: startedAt, kick_count: 0 });
    setActiveId(id);
    setExpanded(true);
  }

  function logKick() {
    setKicks(k => k + 1);
  }

  async function endSession() {
    if (!activeId) return;
    setSaving(true);
    await safeUpdate('mom_kick_sessions', activeId, {
      ended_at: new Date().toISOString(),
      kick_count: kicks,
      duration_seconds: elapsed,
    });
    setSaving(false);
    setActiveId(null);
    startedAtRef.current = null;
    load();
  }

  async function deleteEntry(id: string) {
    await safeDelete('mom_kick_sessions', id);
    setHistory(prev => prev.filter(h => h.id !== id));
  }

  const lastSession = history[0];
  const goalHit = kicks >= KICK_GOAL;
  const isLongSession = elapsed >= LONG_SESSION_SECONDS;

  if (loading) return <ActivityIndicator color={c.primary} style={{ margin: 24 }} />;

  return (
    <View style={s.wrap}>
      <TrackerHeader
        emoji="🦶" title="Kick Counter"
        subtitle={activeId ? `Session in progress · ${kicks} kicks` :
          lastSession ? `Last: ${lastSession.kick_count} kicks in ${fmtElapsed(lastSession.duration_seconds ?? 0)}` :
          'Count to 10 method'}
        collapsed={!expanded} onToggle={toggleExpanded}
        accentBg={c.cardBlush} accentColor={c.blush}
      />

      {expanded && (
        <View style={s.body}>
          {!activeId ? (
            <>
              <Text style={s.helpText}>
                Find a quiet moment, get comfortable, and start a session. We'll count how long it takes to feel {KICK_GOAL} movements.
              </Text>
              <TouchableOpacity style={s.startBtn} onPress={startSession} activeOpacity={0.85}
                accessibilityRole="button" accessibilityLabel="Start kick counting session">
                <Text style={s.startBtnText}>Start Session</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={s.activeCard}>
                <Text style={s.elapsedText}>{fmtElapsed(elapsed)}</Text>
                <Text style={s.kickCount}>{kicks} / {KICK_GOAL} kicks</Text>
                {goalHit && <Text style={s.goalText}>🎉 Goal reached — great job!</Text>}
                {isLongSession && !goalHit && (
                  <Text style={s.warnText}>
                    This is taking longer than usual. If movement feels reduced, contact your provider.
                  </Text>
                )}
                <TouchableOpacity style={s.kickBtn} onPress={logKick} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel="Log a kick">
                  <Text style={s.kickBtnText}>👣 Tap for Kick</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.endBtn} onPress={endSession} disabled={saving} activeOpacity={0.85}
                  accessibilityRole="button" accessibilityLabel="End session">
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.endBtnText}>End Session</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}

          {history.length > 0 && (
            <View style={s.histWrap}>
              <Text style={s.histTitle}>Recent sessions</Text>
              {history.slice(0, 10).map(h => (
                <View key={h.id} style={s.entryRow}>
                  <Text style={s.entryEmoji}>🦶</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.entryName}>{h.kick_count} kicks</Text>
                    <Text style={s.histMeta}>
                      {fmtDate(h.started_at)} · {fmtTime(h.started_at)}
                      {h.duration_seconds != null ? ` · ${fmtElapsed(h.duration_seconds)}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteEntry(h.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button" accessibilityLabel="Delete session">
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
    wrap: { marginBottom: 16 },
    body: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5, borderColor: c.separator, padding: 16, marginTop: 14 },

    helpText: { fontSize: 13, color: c.textSecondary, marginBottom: 14, lineHeight: 18 },

    startBtn: { backgroundColor: c.blush, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    startBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

    activeCard: { backgroundColor: c.cardBlush, borderRadius: 16, padding: 20, alignItems: 'center' },
    elapsedText: { fontSize: 32, fontWeight: '800', color: c.textPrimary, fontVariant: ['tabular-nums'] },
    kickCount: { fontSize: 14, fontWeight: '700', color: c.blush, marginTop: 4, marginBottom: 12 },
    goalText: { fontSize: 13, fontWeight: '700', color: '#059669', marginBottom: 12, textAlign: 'center' },
    warnText: { fontSize: 12, fontWeight: '600', color: '#B45309', marginBottom: 12, textAlign: 'center', paddingHorizontal: 8 },

    kickBtn: { backgroundColor: c.blush, borderRadius: 100, width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    kickBtnText: { fontSize: 16, fontWeight: '800', color: '#fff', textAlign: 'center' },

    endBtn: { backgroundColor: c.bg, borderWidth: 1.5, borderColor: c.blush, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
    endBtnText: { fontSize: 14, fontWeight: '700', color: c.blush },

    entryRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.separator },
    entryEmoji:{ fontSize: 18 },
    entryName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    entryAction: { fontSize: 15, paddingHorizontal: 2 },

    histWrap:  { marginTop: 16 },
    histTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 4 },
    histMeta:  { fontSize: 11, color: c.textMuted, marginTop: 1 },
  });
}
