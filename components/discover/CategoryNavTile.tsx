import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../../lib/theme';
import { Category, categoryAccent, categoryIcon } from '../../lib/resourcesData';
import { hitSlopFor } from '../../lib/accessibility';

interface Props {
  category: Category;
  active: boolean;
  onPress: () => void;
}

// Compact resource-library navigation tile: icon + label + semantic accent,
// clearly distinct from Browse Topics' text chips above it. Browse Topics =
// what parents are discussing (post tags); this = Parent Patch's own
// information/resource library (categoryAccent/categoryIcon, shared with the
// stage hub's compact rows so the two stay visually related).
export default function CategoryNavTile({ category, active, onPress }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const accent = categoryAccent(category, c);
  const icon = categoryIcon(category);

  return (
    <TouchableOpacity
      style={[
        s.tile,
        active ? { backgroundColor: accent.text, borderColor: accent.text } : { backgroundColor: accent.bg, borderColor: accent.bg },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={hitSlopFor(8)}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Browse ${category} resources`}
    >
      <Ionicons name={icon} size={20} color={active ? c.textOnColored : accent.text} />
      <Text style={[s.label, { color: active ? c.textOnColored : accent.text }]} numberOfLines={2}>
        {category}
      </Text>
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    tile: {
      width: 92,
      minHeight: 80,
      borderRadius: 16,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 12,
      gap: 8,
    },
    label: { fontSize: 11.5, fontWeight: '700', textAlign: 'center', lineHeight: 14 },
  });
}
