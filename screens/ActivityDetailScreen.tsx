import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useColors, Colors } from '../lib/theme';
import {
  Activity, primaryEmoji, cardPalette, difficultyLabel, ageRangeLabel,
  noMaterialsNeeded, areaEmoji, areaLabel,
} from '../lib/activitiesUtil';
import ActivityCommunitySection from '../components/ActivityCommunitySection';

interface Props {
  activity: Activity;
  onBack: () => void;
}

export default function ActivityDetailScreen({ activity, onBack }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const palette = cardPalette(activity, c);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button" accessibilityLabel="Back to Activities">
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Activities</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        <View style={[s.hero, { backgroundColor: palette.bg, borderColor: palette.border }]}>
          <Text style={s.heroEmoji}>{primaryEmoji(activity)}</Text>
          <Text style={s.heroTitle}>{activity.title}</Text>
          <Text style={s.heroDesc}>{activity.description}</Text>
        </View>

        <View style={s.metaGrid}>
          <MetaPill s={s} label="Age" value={ageRangeLabel(activity.age_min_months, activity.age_max_months)} />
          <MetaPill s={s} label="Time" value={`${activity.duration_minutes} min`} />
          <MetaPill s={s} label="Difficulty" value={difficultyLabel(activity.difficulty)} />
          <MetaPill s={s} label="Mess" value={'💧'.repeat(activity.mess_level)} />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>🎯 Develops</Text>
          <View style={s.tagRow}>
            {activity.developmental_areas.map(area => (
              <View key={area} style={s.tag}>
                <Text style={s.tagText}>{areaEmoji(area)} {areaLabel(area)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>🧺 What you'll need</Text>
          <Text style={s.bodyText}>
            {noMaterialsNeeded(activity.materials_needed) ? 'Nothing — just you and baby!' : activity.materials_needed.join(', ')}
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>📋 How to play</Text>
          <Text style={s.bodyText}>{activity.instructions}</Text>
        </View>

        {activity.benefits ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>🌱 Why it helps</Text>
            <Text style={s.bodyText}>{activity.benefits}</Text>
          </View>
        ) : null}

        {activity.tags.length > 0 ? (
          <View style={s.section}>
            <View style={s.tagRow}>
              {activity.tags.map(tag => (
                <View key={tag} style={s.tagMuted}>
                  <Text style={s.tagMutedText}>#{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <ActivityCommunitySection activityId={activity.id} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaPill({ s, label, value }: { s: any; label: string; value: string }) {
  return (
    <View style={s.metaPill}>
      <Text style={s.metaPillLabel}>{label}</Text>
      <Text style={s.metaPillValue}>{value}</Text>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow: { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel: { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
    body: { padding: 20, paddingBottom: 40, gap: 18 },

    hero: { borderRadius: 20, borderWidth: 2, padding: 24, alignItems: 'center', gap: 8 },
    heroEmoji: { fontSize: 44 },
    heroTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary, textAlign: 'center' },
    heroDesc: { fontSize: 13.5, color: c.textSecondary, fontWeight: '500', textAlign: 'center', lineHeight: 19 },

    metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    metaPill: {
      flexGrow: 1, minWidth: '22%', backgroundColor: c.card, borderRadius: 14,
      borderWidth: 1.5, borderColor: c.cardBorder, paddingVertical: 10, alignItems: 'center',
    },
    metaPillLabel: { fontSize: 10, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
    metaPillValue: { fontSize: 14, fontWeight: '800', color: c.textPrimary, marginTop: 2 },

    section: { gap: 8 },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: c.textPrimary },
    bodyText: { fontSize: 14, color: c.textSecondary, lineHeight: 21, fontWeight: '500' },

    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: { backgroundColor: c.card, borderWidth: 1.5, borderColor: c.cardBorder, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
    tagText: { fontSize: 12.5, fontWeight: '700', color: c.textSecondary },
    tagMuted: { backgroundColor: c.bgAlt, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
    tagMutedText: { fontSize: 11.5, fontWeight: '600', color: c.textMuted },
  });
}
