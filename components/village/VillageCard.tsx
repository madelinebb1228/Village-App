import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { Village } from '../../lib/villageData';

export function VillageCard({
  village, joining, joined = false, onJoin, onOpen, fullWidth = false, colorIndex, soft = false,
}: {
  village: Village;
  joining: boolean;
  joined?: boolean;
  onJoin: () => void;
  onOpen?: () => void;
  fullWidth?: boolean;
  colorIndex?: number;
  /** Lighter fill (same identity border/accent, low-opacity tint instead of
   * a flat saturated background) and slightly less vertical padding — for
   * contexts like Search's discovery list where several of these sit in a
   * row and shouldn't dominate the page. Discover's own usage is untouched
   * (defaults to false). */
  soft?: boolean;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const PALETTE = [c.reminderInfo, c.reminderWarning, c.reminderAlert, c.reminderMilestone, c.reminderStreak];
  const color = colorIndex !== undefined ? PALETTE[colorIndex % PALETTE.length] : null;
  const bg = color ? color.bg : c.cardLavender;
  const border = color ? color.border : c.lavender;

  return (
    <TouchableOpacity
      style={[
        s.villageCard,
        fullWidth && { width: '100%' },
        soft && s.villageCardSoft,
        { backgroundColor: soft ? border + '14' : bg, borderColor: border },
      ]}
      onPress={onOpen}
      activeOpacity={onOpen ? 0.78 : 1}
      // 'link' (not 'button') — this card navigates to the Patch feed, and
      // it contains its own nested Join/Leave button below. React Native
      // Web renders accessibilityRole="button" as a real <button>; nesting
      // one <button> inside another is invalid HTML and was logging a
      // validateDOMNesting warning on every render of every card.
      accessibilityRole={onOpen ? 'link' : undefined}
      accessibilityLabel={`${village.name}. ${village.description}`}
    >
      <Text style={s.villageEmoji}>{village.emoji}</Text>
      <View style={s.villageInfo}>
        <Text style={s.villageName}>{village.name}</Text>
        <Text style={s.villageDesc}>{village.description}</Text>
      </View>
      <TouchableOpacity
        style={[
          s.joinBtn,
          joined && !color && s.joinBtnJoined,
          color && {
            backgroundColor: joined ? color.bg : color.border,
            borderWidth: joined ? 2 : 0,
            borderColor: color.border,
          },
        ]}
        onPress={onJoin}
        disabled={joining}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={joined ? `Leave ${village.name}` : `Join ${village.name}`}
        accessibilityState={{ disabled: joining, selected: joined }}
      >
        {joining
          ? <ActivityIndicator size="small" color={color ? (joined ? color.border : '#fff') : '#fff'} />
          : <Text style={[
              s.joinBtnText,
              !color && joined && s.joinBtnTextJoined,
              color && { color: joined ? color.border : '#fff' },
            ]}>
              {joined ? '✓ Joined' : '+ Join'}
            </Text>
        }
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    villageCard: {
      backgroundColor: c.cardLavender,
      borderRadius: 14,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      borderWidth: 2,
      borderColor: c.lavender,
      gap: 12,
    },
    villageCardSoft: {
      padding: 11,
      borderWidth: 1.5,
      marginBottom: 8,
    },
    villageEmoji: { fontSize: 28 },
    villageInfo: { flex: 1 },
    villageName: { fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
    villageDesc: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
    joinBtn: {
      backgroundColor: c.joinBtn,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 7,
      minWidth: 68,
      alignItems: 'center',
    },
    joinBtnJoined: { backgroundColor: c.joinedBg },
    joinBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    joinBtnTextJoined: { color: c.joinedBorder },
  });
}
