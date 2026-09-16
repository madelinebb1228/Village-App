import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../../lib/theme';
import { typography } from '../../lib/typography';
import { Resource, categoryAccent } from '../../lib/resourcesData';

interface Props {
  resource: Resource;
  onPress: () => void;
  width?: number;
  /** 'featured' = larger editorial treatment for a single hero resource; default is the compact list/grid row. */
  variant?: 'default' | 'featured';
  /** Overrides the resource's own emoji with a functional Ionicon — for
   *  placements (e.g. Near You) where this card stands in for category
   *  navigation chrome rather than the resource's own content identity.
   *  Omit to keep the default emoji. */
  icon?: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
}

// Content-first resource card — a neutral white/dark card (per the
// "social = neutral" rule) whose emoji bubble and category label carry a
// restrained, category-specific accent color so the color communicates what
// kind of resource this is (see lib/resourcesData#categoryAccent) rather
// than just decorating the card. Used in Explore Categories, search
// results, and Discover's "For Your Family" / featured placements.
export default function ResourcePreviewCard({ resource, onPress, width, variant = 'default', icon }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const accent = categoryAccent(resource.category, c);
  const featured = variant === 'featured';

  return (
    <TouchableOpacity
      style={[s.card, featured && s.cardFeatured, width ? { width } : null]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${resource.title}. ${resource.category}. ${resource.description}`}
    >
      <View style={[s.emojiBubble, featured && s.emojiBubbleFeatured, { backgroundColor: accent.bg }]}>
        {icon ? (
          <Ionicons name={icon} size={featured ? 26 : 20} color={accent.text} />
        ) : (
          <Text style={featured ? s.emojiFeatured : s.emoji}>{resource.emoji}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.category, { color: accent.text }]}>{resource.category}</Text>
        <Text style={[s.title, featured && s.titleFeatured]} numberOfLines={featured ? 2 : 1}>{resource.title}</Text>
        <Text style={s.desc} numberOfLines={featured ? 3 : 2}>{resource.description}</Text>
      </View>
      {!featured && <Ionicons name="chevron-forward" size={18} color={c.textMuted} />}
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.separator,
      borderRadius: 14,
      padding: 14,
    },
    cardFeatured: {
      flex: 1,
      flexDirection: 'column',
      alignItems: 'flex-start',
      borderRadius: 18,
      padding: 18,
      gap: 4,
    },
    emojiBubble: {
      width: 44, height: 44, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
    },
    emojiBubbleFeatured: { width: 56, height: 56, borderRadius: 16, marginBottom: 10 },
    emoji: { fontSize: 22 },
    emojiFeatured: { fontSize: 28 },
    title: { fontSize: 14.5, fontWeight: '700', color: c.textPrimary },
    titleFeatured: { fontSize: 19, fontWeight: '800', marginTop: 1 },
    category: { ...typography.badge, marginTop: 1, marginBottom: 3 },
    desc: { ...typography.postMeta, color: c.textMuted, lineHeight: 16 },
  });
}
