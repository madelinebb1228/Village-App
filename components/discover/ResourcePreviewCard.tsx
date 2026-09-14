import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { typography } from '../../lib/typography';
import { Resource } from '../../lib/resourcesData';

interface Props {
  resource: Resource;
  onPress: () => void;
  width?: number;
}

// Neutral, content-first resource card — used both in Explore Categories and
// in search results. Deliberately plain (white card, subtle border) rather
// than the old bright pastel tile, per the "social/content = neutral" rule.
export default function ResourcePreviewCard({ resource, onPress, width }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  return (
    <TouchableOpacity
      style={[s.card, width ? { width } : null]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${resource.title}. ${resource.category}. ${resource.description}`}
    >
      <Text style={s.emoji}>{resource.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{resource.title}</Text>
        <Text style={s.category}>{resource.category}</Text>
        <Text style={s.desc} numberOfLines={2}>{resource.description}</Text>
      </View>
      <Text style={s.chevron}>›</Text>
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
    emoji: { fontSize: 26 },
    title: { fontSize: 14.5, fontWeight: '700', color: c.textPrimary },
    category: { ...typography.badge, color: c.primary, marginTop: 1, marginBottom: 3 },
    desc: { ...typography.postMeta, color: c.textMuted, lineHeight: 16 },
    chevron: { fontSize: 20, color: c.textMuted, fontWeight: '700' },
  });
}
