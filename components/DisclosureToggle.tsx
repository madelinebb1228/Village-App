import React from 'react';
import { Text, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { useColors } from '../lib/theme';

/** Consistent "show more" text link for in-card disclosures (extra form
 * fields, extra info) — one glyph/style used everywhere instead of each
 * tracker inventing its own (▲/▼, boxed toggles, etc). */
export default function DisclosureToggle({
  label, expanded, onPress, style,
}: {
  label: string;
  expanded: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      style={style}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>
        {expanded ? '▾' : '▸'} {label}
      </Text>
    </TouchableOpacity>
  );
}
