import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useColors, Colors } from '../lib/theme';
import { Activity, ActivityRating } from '../lib/activitiesUtil';
import ActivityCard from './ActivityCard';

interface Props {
  activities: Activity[];
  loading: boolean;
  onSelect: (activity: Activity) => void;
  triedMap?: Map<string, ActivityRating | null>;
}

export default function ActivitiesFeed({ activities, loading, onSelect, triedMap }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  if (loading) {
    return <ActivityIndicator color={c.primary} style={{ marginVertical: 24 }} />;
  }

  if (activities.length === 0) {
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyEmoji}>🧸</Text>
        <Text style={s.emptyText}>No activities match your filters right now. Try widening them.</Text>
      </View>
    );
  }

  return (
    <View>
      {activities.map(activity => (
        <ActivityCard
          key={activity.id}
          activity={activity}
          onPress={() => onSelect(activity)}
          triedRating={triedMap?.get(activity.id)}
        />
      ))}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyEmoji: { fontSize: 32 },
    emptyText: { fontSize: 13, color: c.textMuted, fontWeight: '600', textAlign: 'center', paddingHorizontal: 20 },
  });
}
