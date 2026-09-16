import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../../lib/theme';
import { hitSlopFor } from '../../lib/accessibility';

export interface PostActionItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Styles the row (icon + text) in the app's destructive/warning color. */
  destructive?: boolean;
  accessibilityHint?: string;
}

interface Props {
  visible: boolean;
  /** Desktop only — measured position of the trigger to anchor near. Omit (or pass null) for the mobile bottom-sheet treatment. */
  anchor: { x: number; y: number; width: number; height: number } | null;
  actions: PostActionItem[];
  onClose: () => void;
}

// Same anchored-card (desktop) / bottom-sheet (phone/tablet) popover shell as
// PostTypeInfoPopover, generalized to a list of actions — used for a post's
// "Post options" overflow menu (pin/unpin, delete) instead of permanently
// visible icon buttons or a second, competing popover system.
export default function PostActionsMenu({ visible, anchor, actions, onClose }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  if (!visible) return null;

  const cardStyle = anchor
    ? [
        s.anchoredCard,
        {
          top: anchor.y + anchor.height + 8,
          left: Math.max(12, Math.min(anchor.x - 160, Dimensions.get('window').width - 232)),
        },
      ]
    : null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity
        style={s.backdrop}
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={anchor ? styles.anchoredWrap : s.sheetWrap} pointerEvents="box-none">
        <View style={anchor ? cardStyle : s.sheetCard}>
          {!anchor && <View style={s.sheetHandle} />}
          {actions.map(action => (
            <TouchableOpacity
              key={action.key}
              onPress={() => { onClose(); action.onPress(); }}
              style={s.row}
              hitSlop={hitSlopFor(8)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityHint={action.accessibilityHint}
            >
              <Ionicons name={action.icon} size={18} color={action.destructive ? c.signOut : c.textPrimary} />
              <Text style={[s.rowText, action.destructive && { color: c.signOut }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  anchoredWrap: { flex: 1 },
});

function makeStyles(c: Colors) {
  return StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,27,75,0.35)' },
    sheetWrap: { flex: 1, justifyContent: 'flex-end' },
    sheetCard: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 10,
      paddingBottom: 28,
      paddingHorizontal: 8,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.separator,
      marginBottom: 10,
    },
    anchoredCard: {
      position: 'absolute',
      width: 220,
      backgroundColor: c.bg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.separator,
      paddingVertical: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minHeight: 44,
    },
    rowText: { fontSize: 14.5, fontWeight: '600', color: c.textPrimary },
  });
}
