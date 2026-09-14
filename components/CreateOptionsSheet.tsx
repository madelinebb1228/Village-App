import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../lib/theme';
import { hitSlopFor } from '../lib/accessibility';
import { useResponsive } from '../lib/responsive';

export type CreateOption = 'post' | 'question' | 'media' | 'story' | 'event' | 'help';

const OPTIONS: Array<{ key: CreateOption; icon: keyof typeof Ionicons.glyphMap; label: string; sub: string }> = [
  { key: 'post', icon: 'create-outline', label: 'Post', sub: 'Share an update with your community' },
  { key: 'question', icon: 'help-circle-outline', label: 'Question', sub: 'Ask your community for advice' },
  { key: 'media', icon: 'image-outline', label: 'Photo / Video', sub: 'Share a photo or video' },
  { key: 'story', icon: 'add-circle-outline', label: 'Story', sub: 'Share a moment that disappears in 24h' },
  { key: 'event', icon: 'calendar-outline', label: 'Event', sub: 'Plan something with your Patch' },
  { key: 'help', icon: 'people-outline', label: 'Ask for Help', sub: 'Post a request to your Patch' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: CreateOption) => void;
}

// Rendered once at the app root (sibling of the tab navigator, not owned by
// any single tab) so it reliably appears above whichever tab is active and
// isn't affected by that tab's mount/focus lifecycle. Purely a picker — each
// option's actual creation flow lives wherever it already lived (Home's post
// and story composers, or the fully self-contained EventsScreen/PatchTasksSheet
// opened directly by the root); nothing here duplicates that logic.
export default function CreateOptionsSheet({ visible, onClose, onSelect }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(c), [c]);
  const { isWide } = useResponsive();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[s.overlay, isWide && s.overlayWide]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button" accessibilityLabel="Close create menu"
        />
        <View style={[s.sheet, isWide ? s.panelWide : { paddingBottom: 20 + insets.bottom }]}>
          {!isWide && <View style={s.handle} />}
          <View style={s.titleRow}>
            <Text style={s.title}>Create</Text>
            <TouchableOpacity onPress={onClose} hitSlop={hitSlopFor(22)}
              accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={c.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={isWide && s.grid}>
            {OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={isWide ? s.tile : s.row}
                onPress={() => onSelect(opt.key)}
                activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={opt.label}
              >
                <View style={s.iconBubble}>
                  <Ionicons name={opt.icon} size={20} color={c.primary} />
                </View>
                <View style={isWide ? { alignItems: 'center' } : { flex: 1 }}>
                  <Text style={[s.rowText, isWide && s.tileText]}>{opt.label}</Text>
                  <Text style={[s.rowSub, isWide && s.tileSub]} numberOfLines={isWide ? 2 : undefined}>{opt.sub}</Text>
                </View>
                {!isWide && <Ionicons name="chevron-forward" size={18} color={c.textMuted} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    overlayWide: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    panelWide: {
      width: 480,
      maxWidth: '90%',
      borderRadius: 24,
      paddingBottom: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 24,
      elevation: 12,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 4,
    },
    tile: {
      width: '31%',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 16,
      paddingHorizontal: 8,
      borderRadius: 16,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.separator,
    },
    tileText: {
      textAlign: 'center',
    },
    tileSub: {
      textAlign: 'center',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.separator,
      marginBottom: 14,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: c.textPrimary,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
    },
    iconBubble: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.cardLavender,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
    },
    rowSub: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 1,
    },
  });
}
