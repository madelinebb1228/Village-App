import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../../lib/theme';
import { hitSlopFor } from '../../lib/accessibility';

interface Props {
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  accentBg: string;
  accentColor: string;
  title: string;
  meta: string;
  onPress: () => void;
}

// Compact "secondary" row for the stage hub — deliberately lighter-weight
// than a full ActivityCard/ResourcePreviewCard so a hub made of one featured
// card + a few of these reads as layered (varied scale) instead of a stack
// of same-weight cards.
export default function StageItemRow({ icon, accentBg, accentColor, title, meta, onPress }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  return (
    <TouchableOpacity
      style={s.row}
      onPress={onPress}
      activeOpacity={0.75}
      hitSlop={hitSlopFor(6)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${meta}`}
    >
      <View style={[s.iconBubble, { backgroundColor: accentBg }]}>
        <Ionicons name={icon} size={17} color={accentColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.meta} numberOfLines={1}>{meta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.separator,
      borderRadius: 13,
      paddingVertical: 9,
      paddingHorizontal: 11,
      minHeight: 56,
    },
    iconBubble: {
      width: 34, height: 34, borderRadius: 11,
      alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 13.5, fontWeight: '700', color: c.textPrimary },
    meta: { fontSize: 11.5, color: c.textMuted, fontWeight: '600', marginTop: 1 },
  });
}
