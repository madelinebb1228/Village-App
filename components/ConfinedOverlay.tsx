import React from 'react';
import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';

// A secondary-action dialog (Report/Block/etc.) that renders as a real
// full-screen RN Modal on mobile, but as an overlay CONFINED to its nearest
// positioned ancestor on desktop inline surfaces. RN Modal always portals
// outside the DOM tree on web — even when the screen that opens it is itself
// hosted inline beside the persistent sidebar (DesktopSecondaryHost), a plain
// <Modal> would still cover the whole viewport including the sidebar. Using
// `position: 'absolute'` here instead lets the browser confine it to whatever
// box actually contains it (react-native-web Views are `position: relative`
// by default), which is exactly the desktop host's own bounds.
interface Props {
  visible: boolean;
  onRequestClose: () => void;
  presentation: 'modal' | 'inline';
  maxWidth?: number;
  children: React.ReactNode;
}

export default function ConfinedOverlay({ visible, onRequestClose, presentation, maxWidth = 640, children }: Props) {
  if (presentation === 'modal') {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onRequestClose}>
        {children}
      </Modal>
    );
  }

  if (!visible) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      <TouchableOpacity
        style={[StyleSheet.absoluteFill, styles.scrim]}
        activeOpacity={1}
        onPress={onRequestClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={styles.centerWrap} pointerEvents="box-none">
        <View style={[styles.panel, { maxWidth }]}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Explicit zIndex is required: react-native-web Views default to
  // `position: relative`, and CSS stacks same-stacking-context siblings by
  // DOM order when z-index is auto on both — an absolutely-positioned
  // overlay that appears BEFORE later normal-flow sibling content (as this
  // one usually does, sitting above that content in JSX) would otherwise be
  // painted, and hit-tested, UNDER that later sibling despite being visually
  // "on top" in intent.
  host: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.35)' },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  panel: {
    width: '100%',
    maxHeight: '85%',
    borderRadius: 16,
    overflow: 'hidden',
  },
});
