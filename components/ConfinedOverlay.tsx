import React, { useEffect, useRef } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Platform } from 'react-native';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const panelRef = useRef<View>(null);

  // Web only: a plain absolutely-positioned View (the inline branch below)
  // isn't a native <dialog>, so the browser never traps Tab focus inside it
  // the way it would a real Modal — without this, Tab walks straight out
  // into the dimmed, still-in-DOM background screen. Move focus in on open,
  // and wrap Tab/Shift+Tab at the panel's edges so it can't escape.
  useEffect(() => {
    if (Platform.OS !== 'web' || presentation !== 'inline' || !visible) return;
    const panel = (panelRef.current as unknown as HTMLElement | null);
    if (!panel) return;
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const toFocus = focusables()[0] ?? panel;
    toFocus.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onRequestClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.contains(active)) {
        // Focus somehow ended up outside the panel — pull it back in.
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [visible, presentation, onRequestClose]);

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
        <View ref={panelRef} style={[styles.panel, { maxWidth }]} accessibilityViewIsModal>
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
