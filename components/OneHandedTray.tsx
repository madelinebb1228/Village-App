import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useOneHanded } from '../lib/OneHandedContext';
import { useColors } from '../lib/theme';

// Enough space for Save + gap + Cancel + safe area. Keeps content visible above the tray.
const TRAY_RESERVE = 130;

interface Props {
  /** The scrollable content area (typically a ScrollView). */
  children: React.ReactNode;
  /** Action buttons (Save, Cancel, Post, etc.) */
  actions: React.ReactNode;
  /**
   * Bottom padding for the actions area: typically insets.bottom + small constant.
   * Used in both normal (inline) and one-handed (tray) modes.
   */
  bottomPad?: number;
  style?: ViewStyle;
}

/**
 * Layout primitive for one-handed mode.
 *
 * Normal mode  → children then actions stacked inline (existing layout, no change).
 * One-handed   → children fill the screen with bottom margin, actions pin to the
 *                bottom of the screen in an elevated tray for thumb reach.
 */
export default function OneHandedTray({ children, actions, bottomPad = 16, style }: Props) {
  const { isOneHanded } = useOneHanded();
  const c = useColors();

  if (!isOneHanded) {
    return (
      <View style={[{ flex: 1 }, style]}>
        {children}
        <View style={{ paddingHorizontal: 24, paddingBottom: bottomPad, gap: 8 }}>
          {actions}
        </View>
      </View>
    );
  }

  return (
    <View style={[{ flex: 1 }, style]}>
      {/* Reserve space at the bottom so content never hides under the tray */}
      <View style={{ flex: 1, marginBottom: TRAY_RESERVE }}>
        {children}
      </View>

      {/* Sticky bottom tray */}
      <View style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        backgroundColor: c.bg,
        paddingTop: 12,
        paddingBottom: bottomPad,
        paddingHorizontal: 24,
        gap: 8,
        borderTopWidth: 1.5,
        borderTopColor: c.separator,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 10,
      }}>
        {actions}
      </View>
    </View>
  );
}
