import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { Reminder, ReminderUrgency, getReminderColors } from '../../types/feed';

interface RemindersCardProps {
  reminders: Reminder[];
}

function RemindersCard({ reminders }: RemindersCardProps) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const REMINDER_COLORS = useMemo(() => getReminderColors(c), [c]);

  const coloredReminders = useMemo(() => {
    const allKeys: ReminderUrgency[] = ['info', 'warning', 'alert', 'milestone', 'streak'];
    const result: ReminderUrgency[] = [];
    for (let i = 0; i < reminders.length; i++) {
      const preferred = reminders[i].urgency;
      if (i === 0 || REMINDER_COLORS[preferred].bg !== REMINDER_COLORS[result[i - 1]].bg) {
        result.push(preferred);
      } else {
        const alt = allKeys.find(k => REMINDER_COLORS[k].bg !== REMINDER_COLORS[result[i - 1]].bg) ?? preferred;
        result.push(alt);
      }
    }
    return result;
  }, [reminders, REMINDER_COLORS]);

  if (reminders.length === 0) return null;

  return (
    <View style={styles.remindersSection}>
      <Text style={styles.sectionTitle}>Reminders</Text>
      {reminders.map((r, idx) => {
        const rc = REMINDER_COLORS[coloredReminders[idx]];
        return (
          <View key={r.id} style={[styles.reminderCard, { backgroundColor: rc.bg, borderLeftColor: rc.border }]}>
            <Text style={styles.reminderEmoji}>{r.emoji}</Text>
            <Text style={[styles.reminderText, { color: rc.text }]}>{r.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default React.memo(RemindersCard);

function makeStyles(c: Colors) {
  return StyleSheet.create({
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 14,
    },
    remindersSection: {
      marginBottom: 28,
    },
    reminderCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderLeftWidth: 4,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 8,
      gap: 10,
    },
    reminderEmoji: {
      fontSize: 18,
    },
    reminderText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
    },
  });
}
