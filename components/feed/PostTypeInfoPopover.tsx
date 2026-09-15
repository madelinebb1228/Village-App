import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../../lib/theme';

export interface PostTypeInfoContent {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  ctaLabel: string;
  color: string;
}

interface Props extends PostTypeInfoContent {
  visible: boolean;
  /** Desktop only — measured position of the badge to anchor near. Omit (or pass null) for the mobile bottom-sheet treatment. */
  anchor: { x: number; y: number; width: number; height: number } | null;
  onClose: () => void;
  onSeeMore: () => void;
}

// A tiny explanation for what a post-type badge means, plus a way to jump to
// more posts of that type. Desktop gets a compact card anchored near the
// badge that was tapped; phone/tablet get a compact sheet anchored to the
// bottom, matching the app's existing sheet pattern (see ConfirmModal) rather
// than a second, competing popover system.
export default function PostTypeInfoPopover({
  visible, anchor, icon, label, description, ctaLabel, color, onClose, onSeeMore,
}: Props) {
  const c = useColors();
  const s = makeStyles(c);

  if (!visible) return null;

  const cardStyle = anchor
    ? [
        s.anchoredCard,
        {
          top: anchor.y + anchor.height + 8,
          left: Math.max(12, Math.min(anchor.x - 140, Dimensions.get('window').width - 292)),
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
          <View style={s.headerRow}>
            <View style={[s.iconBubble, { backgroundColor: color + '1F' }]}>
              <Ionicons name={icon} size={18} color={color} />
            </View>
            <Text style={s.title}>{label}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={18} color={c.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={s.description}>{description}</Text>
          <TouchableOpacity
            onPress={onSeeMore}
            style={s.ctaRow}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
          >
            <Text style={[s.ctaText, { color }]}>{ctaLabel}</Text>
            <Ionicons name="arrow-forward" size={15} color={color} />
          </TouchableOpacity>
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
      padding: 20,
      paddingBottom: 28,
    },
    anchoredCard: {
      position: 'absolute',
      width: 280,
      backgroundColor: c.bg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.separator,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 10,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    iconBubble: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 15.5, fontWeight: '800', color: c.textPrimary },
    description: { fontSize: 13.5, color: c.textSecondary, lineHeight: 19, marginBottom: 14 },
    ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
    ctaText: { fontSize: 14, fontWeight: '700' },
  });
}
