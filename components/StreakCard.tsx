import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors, Colors } from '../lib/theme';
import Patchy, { PatchyMood } from './Patchy';
import { getStreak, getTodayDateStr, StreakData } from '../lib/streakService';

interface Props {
  userId: string | null;
  refreshKey?: number;
}

function getMood(data: StreakData, loggedToday: boolean): PatchyMood {
  if (!loggedToday) return 'encouraging';
  if (data.current_streak >= 7) return 'celebrating';
  return 'happy';
}

function getMessage(data: StreakData, loggedToday: boolean): string {
  if (!loggedToday) {
    return data.current_streak > 0
      ? `Don't break your ${data.current_streak}-day streak!`
      : 'Start your streak — log something today!';
  }
  const s = data.current_streak;
  if (s === 1) return "Day 1! You've started something great.";
  if (s < 7)   return `${s} days in a row — keep it up!`;
  if (s < 30)  return `${s} days strong! You're on fire 🔥`;
  if (s < 100) return `${s} days! You're absolutely amazing 🌟`;
  return `${s} days!! You're a legend 🏆`;
}

export default function StreakCard({ userId, refreshKey }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const [data, setData] = useState<StreakData | null>(null);

  useEffect(() => {
    if (!userId) return;
    getStreak(userId).then(setData);
  }, [userId, refreshKey]);

  if (!userId || !data) return null;

  const loggedToday = data.last_log_date === getTodayDateStr();
  const mood = getMood(data, loggedToday);
  const message = getMessage(data, loggedToday);

  return (
    <View style={[s.card, loggedToday ? s.cardLogged : s.cardNudge]}>
      {/* Patchy */}
      <View style={s.patchyWrap}>
        <Patchy mood={mood} size={80} />
      </View>

      {/* Streak info */}
      <View style={s.center}>
        <View style={s.streakRow}>
          <Text style={s.streakNum}>{data.current_streak}</Text>
          <Text style={s.streakLabel}> day{data.current_streak !== 1 ? 's' : ''}</Text>
        </View>
        <Text style={s.message} numberOfLines={2}>{message}</Text>

        {/* Freeze indicators */}
        <View style={s.freezeRow}>
          {data.freeze_count > 0 ? (
            [...Array(Math.min(data.freeze_count, 3))].map((_, i) => (
              <Text key={i} style={s.freezeIcon}>❄️</Text>
            ))
          ) : (
            <Text style={s.noFreeze}>No freezes left</Text>
          )}
        </View>
      </View>

      {/* Personal best */}
      {data.longest_streak > 1 && (
        <View style={s.bestCol}>
          <Text style={s.bestLabel}>Best</Text>
          <Text style={s.bestNum}>{data.longest_streak}</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      borderRadius: 20,
      borderWidth: 2,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    cardLogged: {
      backgroundColor: c.cardLavender,
      borderColor: c.lavender,
    },
    cardNudge: {
      backgroundColor: c.cardBlush,
      borderColor: c.blush,
    },
    patchyWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    center: {
      flex: 1,
      gap: 2,
    },
    streakRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    streakNum: {
      fontSize: 32,
      fontWeight: '900',
      color: c.textPrimary,
    },
    streakLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: c.textSecondary,
    },
    message: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
      lineHeight: 18,
    },
    freezeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginTop: 4,
    },
    freezeIcon: {
      fontSize: 14,
    },
    noFreeze: {
      fontSize: 12,
      color: c.textMuted,
      fontWeight: '500',
    },
    bestCol: {
      alignItems: 'center',
      minWidth: 44,
    },
    bestLabel: {
      fontSize: 11,
      color: c.textMuted,
      fontWeight: '600',
    },
    bestNum: {
      fontSize: 22,
      fontWeight: '800',
      color: c.textPrimary,
    },
  });
