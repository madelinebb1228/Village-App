import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../lib/theme';
import { useAccessibility } from '../lib/AccessibilityContext';
import { MAX_FONT_SCALE } from '../lib/accessibility';
import {
  Activity, ActivityRating, areaIcon, cardPalette, difficultyLabel, ageRangeLabel,
  noMaterialsNeeded, ratingEmoji, ratingLabel,
} from '../lib/activitiesUtil';

interface Props {
  activity: Activity;
  onPress: () => void;
  /** undefined = never tried; null = tried but not yet rated */
  triedRating?: ActivityRating | null;
  /** 'featured' = larger editorial treatment for a single hero activity; default is the compact card. */
  variant?: 'default' | 'featured';
}

export default function ActivityCard({ activity, onPress, triedRating, variant = 'default' }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const palette = cardPalette(activity, c);
  const icon = areaIcon(activity.developmental_areas?.[0] ?? '');
  const featured = variant === 'featured';
  const { settings } = useAccessibility();
  const materialsText = noMaterialsNeeded(activity.materials_needed)
    ? 'No materials needed'
    : `Needs: ${activity.materials_needed.join(', ')}`;

  return (
    <TouchableOpacity
      style={[s.card, featured && s.cardFeatured]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${activity.title}, ${activity.duration_minutes} minutes, ${difficultyLabel(activity.difficulty)}`}
    >
      <View style={s.topRow}>
        <View style={[s.iconBubble, featured && s.iconBubbleFeatured, { backgroundColor: palette.bg }]}>
          <Ionicons name={icon} size={featured ? 26 : 20} color={palette.border} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[s.title, featured && s.titleFeatured]}
            numberOfLines={settings.largeText ? undefined : 1}
            allowFontScaling
            maxFontSizeMultiplier={MAX_FONT_SCALE}
          >
            {activity.title}
          </Text>
          <Text style={[s.ageBadge, { color: palette.border }]}>{ageRangeLabel(activity.age_min_months, activity.age_max_months)}</Text>
        </View>
        {triedRating !== undefined && (
          <View style={s.triedBadge}>
            <Text style={s.triedBadgeText}>{ratingEmoji(triedRating)} {ratingLabel(triedRating)}</Text>
          </View>
        )}
      </View>

      <Text
        style={s.description}
        numberOfLines={featured ? 3 : (settings.largeText ? 3 : 2)}
        allowFontScaling
        maxFontSizeMultiplier={MAX_FONT_SCALE}
      >
        {activity.description}
      </Text>

      <View style={s.metaRow}>
        <Ionicons name="time-outline" size={13} color={c.textMuted} />
        <Text style={s.metaText}>{activity.duration_minutes} min</Text>
        <Text style={s.metaDot}>·</Text>
        <Text style={s.metaText}>{difficultyLabel(activity.difficulty)}</Text>
        <Text style={s.metaDot}>·</Text>
        <View style={s.messRow} accessibilityLabel={`Mess level ${activity.mess_level} of 5`}>
          {Array.from({ length: activity.mess_level }).map((_, i) => (
            <Ionicons key={i} name="water" size={11} color={c.blue} />
          ))}
        </View>
      </View>

      <Text
        style={s.materials}
        numberOfLines={settings.largeText ? undefined : 1}
        allowFontScaling
        maxFontSizeMultiplier={MAX_FONT_SCALE}
      >
        {materialsText}
      </Text>

      <View style={s.footer}>
        <View style={s.tryBtn}>
          <Text style={s.tryBtnText}>Try It →</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: c.separator,
      backgroundColor: c.card,
      padding: 14,
      marginBottom: 12,
    },
    cardFeatured: {
      borderRadius: 20,
      padding: 20,
      flex: 1,
      justifyContent: 'space-between',
    },
    topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
    iconBubble: {
      width: 40, height: 40, borderRadius: 13,
      alignItems: 'center', justifyContent: 'center',
    },
    iconBubbleFeatured: { width: 52, height: 52, borderRadius: 16 },
    title: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    titleFeatured: { fontSize: 19, marginTop: 2 },
    ageBadge: { fontSize: 11, fontWeight: '700', marginTop: 2 },
    triedBadge: { backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: c.cardBorder },
    triedBadgeText: { fontSize: 10, fontWeight: '700', color: c.textSecondary },
    description: { fontSize: 12.5, color: c.textSecondary, lineHeight: 17, marginBottom: 8 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    metaText: { fontSize: 11, fontWeight: '700', color: c.textSecondary },
    metaDot: { fontSize: 11, color: c.textMuted },
    messRow: { flexDirection: 'row', gap: 1 },
    materials: { fontSize: 11, color: c.textMuted, fontWeight: '500', marginBottom: 10 },
    footer: { flexDirection: 'row', justifyContent: 'flex-end' },
    tryBtn: { backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 },
    tryBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  });
}
