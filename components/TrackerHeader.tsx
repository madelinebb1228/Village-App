import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useColors } from '../lib/theme';

/** Consistent collapsible header for the dashboard's tracker widgets
 * (Nutrition, Vaccine, Growth, Allergen, Med, Movement) — same shape,
 * chevron, and type scale everywhere; only the accent color differs
 * per tracker so the dashboard reads as one system while staying
 * scannable by tracker. `children`, when provided, renders inside the
 * header box (below the title row) only while expanded — e.g. a
 * tracker-specific progress bar that used to live in a bespoke header. */
export default function TrackerHeader({
  emoji, title, subtitle, collapsed, onToggle, accentBg, accentColor,
  rightLabel, onRightPress, rightAccessibilityLabel, children, alert,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  collapsed: boolean;
  onToggle: () => void;
  accentBg: string;
  accentColor: string;
  rightLabel?: string;
  onRightPress?: () => void;
  rightAccessibilityLabel?: string;
  children?: React.ReactNode;
  /** Small red dot next to the chevron, visible even while collapsed —
   * for something urgent the parent needs to know about without expanding. */
  alert?: boolean;
}) {
  const c = useColors();
  return (
    <TouchableOpacity
      style={{
        backgroundColor: accentBg, borderRadius: 14, borderWidth: 2, borderColor: accentColor,
        paddingHorizontal: 16, paddingTop: 13, paddingBottom: children && !collapsed ? 10 : 13,
      }}
      onPress={onToggle}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={collapsed ? `Expand ${title}` : `Collapse ${title}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary }}>{emoji} {title}</Text>
          {subtitle ? (
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{subtitle}</Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {alert && (
            <Text style={{ fontSize: 10, color: '#DC2626' }} accessibilityLabel="Needs attention">●</Text>
          )}
          {!collapsed && rightLabel && onRightPress && (
            <TouchableOpacity
              onPress={e => { e.stopPropagation?.(); onRightPress(); }}
              accessibilityRole="button" accessibilityLabel={rightAccessibilityLabel ?? rightLabel}
            >
              <Text style={{ fontSize: 13, color: accentColor, fontWeight: '600' }}>{rightLabel}</Text>
            </TouchableOpacity>
          )}
          <Text style={{ fontSize: 20, color: accentColor, fontWeight: '700' }}>{collapsed ? '›' : '⌄'}</Text>
        </View>
      </View>
      {!collapsed && children ? <View style={{ marginTop: 8 }}>{children}</View> : null}
    </TouchableOpacity>
  );
}
