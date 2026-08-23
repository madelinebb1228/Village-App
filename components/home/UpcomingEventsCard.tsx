import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import PaywallGate from '../PaywallGate';

interface UpcomingEvent {
  id: string;
  title: string;
  starts_at: string;
  all_day: boolean;
  calendar_type: 'personal' | 'shared';
}

interface UpcomingEventsCardProps {
  events: UpcomingEvent[];
  onPress: () => void;
}

function formatUpcomingWhen(startsAt: string, allDay: boolean): string {
  const d = new Date(startsAt);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const day = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (allDay) return day;
  return `${day}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function UpcomingEventsCard({ events, onPress }: UpcomingEventsCardProps) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <PaywallGate feature="shared_calendar" title="Upcoming" description="See what's coming up from your calendar." emoji="📅">
      {events.length > 0 && (
        <TouchableOpacity
          style={styles.upcomingCard}
          onPress={onPress}
          activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel="Open calendar"
        >
          <Text style={styles.sectionTitle}>Upcoming</Text>
          {events.map(e => (
            <View key={e.id} style={styles.upcomingRow}>
              <Text style={styles.upcomingEmoji}>{e.calendar_type === 'personal' ? '🔒' : '👥'}</Text>
              <Text style={styles.upcomingTitle} numberOfLines={1}>{e.title}</Text>
              <Text style={styles.upcomingWhen}>{formatUpcomingWhen(e.starts_at, e.all_day)}</Text>
            </View>
          ))}
        </TouchableOpacity>
      )}
    </PaywallGate>
  );
}

export default React.memo(UpcomingEventsCard);

function makeStyles(c: Colors) {
  return StyleSheet.create({
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 14,
    },
    upcomingCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 28,
      borderWidth: 1.5,
      borderColor: c.separator,
    },
    upcomingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: c.separator,
    },
    upcomingEmoji: { fontSize: 14 },
    upcomingTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary },
    upcomingWhen: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
  });
}
