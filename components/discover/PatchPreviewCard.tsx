import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { Village } from '../../lib/villageData';
import { hitSlopFor } from '../../lib/accessibility';

interface Props {
  village: Village;
  joined: boolean;
  joining: boolean;
  onJoin: () => void;
  onOpen: () => void;
  width?: number;
}

// Discover's own Patch card — a neutral card (identity emoji bubble + name +
// description) with the Join control on its own row, so title/description
// never compete horizontally with the button (the old cramped-column
// problem). Intentionally does NOT reuse VillageCard: VillageCard's
// horizontal identity+button-in-one-row layout is still correct for
// VillageTab/SearchSheet, which this redesign doesn't touch. Same component
// for joined and not-joined (per Patch "same visual family" — only the
// button changes), fixed height so a row of cards reads as one consistent
// grid regardless of description length.
export default function PatchPreviewCard({ village, joined, joining, onJoin, onOpen, width = 260 }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  return (
    <TouchableOpacity
      style={[s.card, width ? { width } : null]}
      onPress={onOpen}
      activeOpacity={0.85}
      // 'link' (not 'button') — this card navigates to the Patch feed and
      // contains its own nested Join/Leave button. accessibilityRole=
      // "button" renders as a real <button> on web; nesting one inside
      // another is invalid HTML and logs a validateDOMNesting warning on
      // every render of every card.
      accessibilityRole="link"
      accessibilityLabel={`${village.name}. ${village.description}`}
    >
      <View style={s.topRow}>
        <View style={s.emojiBubble}>
          <Text style={s.emoji}>{village.emoji}</Text>
        </View>
        <Text style={s.name} numberOfLines={1}>{village.name}</Text>
      </View>

      <Text style={s.desc} numberOfLines={2}>{village.description}</Text>

      <View style={s.footerRow}>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation?.(); onJoin(); }}
          disabled={joining}
          style={[s.joinBtn, joined && s.joinBtnJoined]}
          hitSlop={hitSlopFor(30)}
          accessibilityRole="button"
          accessibilityLabel={joined ? `Leave ${village.name}` : `Join ${village.name}`}
          accessibilityState={{ disabled: joining, selected: joined }}
        >
          {joining ? (
            <ActivityIndicator size="small" color={joined ? c.joinedBorder : '#fff'} />
          ) : (
            <Text style={[s.joinBtnText, joined && s.joinBtnTextJoined]}>
              {joined ? '✓ Joined' : 'Join'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      height: 176,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.separator,
      borderRadius: 16,
      padding: 14,
      justifyContent: 'space-between',
    },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    emojiBubble: {
      width: 40, height: 40, borderRadius: 13,
      backgroundColor: c.cardLavender,
      alignItems: 'center', justifyContent: 'center',
    },
    emoji: { fontSize: 20 },
    name: { flex: 1, fontSize: 15, fontWeight: '800', color: c.textPrimary },
    desc: { fontSize: 12.5, color: c.textMuted, lineHeight: 17.5, marginTop: 8 },
    footerRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    joinBtn: {
      backgroundColor: c.joinBtn,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 7,
      minWidth: 76,
      alignItems: 'center',
    },
    joinBtnJoined: { backgroundColor: c.joinedBg },
    joinBtnText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
    joinBtnTextJoined: { color: c.joinedBorder },
  });
}
