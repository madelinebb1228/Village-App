import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';
import { getTummyTimeSummary, logTummyTime, checkTummyTimeReminder } from '../lib/tummyTimeUtil';

interface Props {
  userId: string | null;
  babyId: string | null;
  babyName: string | null;
  refreshKey?: number;
}

const QUICK_MINUTES = [5, 10, 15];

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function TummyTimeCard({ userId, babyId, babyName, refreshKey }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [loading, setLoading] = useState(true);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [todaySessions, setTodaySessions] = useState(0);
  const [lastAgo, setLastAgo] = useState<string | null>(null);
  const [logging, setLogging] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!babyId) return;
    setLoading(true);
    try {
      const { todayMinutes, todaySessions, lastSession } = await getTummyTimeSummary(babyId);
      setTodayMinutes(todayMinutes);
      setTodaySessions(todaySessions);
      setLastAgo(lastSession ? timeAgo(lastSession.started_at) : null);
    } finally {
      setLoading(false);
    }
    if (userId) checkTummyTimeReminder(userId, babyId, babyName ?? 'Baby').catch(() => {});
  }, [babyId, userId, babyName, refreshKey]);

  useEffect(() => { load(); }, [load]);

  async function quickLog(minutes: number) {
    if (!babyId || !userId) return;
    setLogging(minutes);
    try {
      await logTummyTime(babyId, userId, minutes);
      await load();
    } finally {
      setLogging(null);
    }
  }

  if (!babyId) return null;

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>🤸</Text>
          <View>
            <Text style={s.headerTitle}>Tummy Time</Text>
            {loading ? (
              <ActivityIndicator size="small" color={c.textMuted} style={{ alignSelf: 'flex-start' }} />
            ) : (
              <Text style={s.subText}>
                {todayMinutes > 0
                  ? `${todayMinutes}m today · ${todaySessions} session${todaySessions === 1 ? '' : 's'}`
                  : 'No sessions logged today'}
                {lastAgo ? ` · last ${lastAgo}` : ''}
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={s.chipRow}>
        {QUICK_MINUTES.map(m => (
          <TouchableOpacity
            key={m}
            style={s.chip}
            onPress={() => quickLog(m)}
            disabled={logging !== null}
            activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel={`Log ${m} minutes of tummy time`}
          >
            {logging === m ? (
              <ActivityIndicator size="small" color={c.sage} />
            ) : (
              <Text style={s.chipText}>+{m}m</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.card, borderRadius: 16, marginBottom: 16,
      borderWidth: 1.5, borderColor: c.separator, overflow: 'hidden',
    },
    headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderLeftWidth: 4, borderLeftColor: c.sage },
    headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerEmoji: { fontSize: 26 },
    headerTitle: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    subText:     { fontSize: 12, color: c.textMuted, marginTop: 2 },

    chipRow: {
      flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14,
      borderTopWidth: 1, borderTopColor: c.separator, paddingTop: 12,
    },
    chip: {
      flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
      borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg,
    },
    chipText: { fontSize: 14, fontWeight: '700', color: c.sage },
  });
}
