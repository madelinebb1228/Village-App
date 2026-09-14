import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { Village } from '../../lib/villageData';

const CHIP_PALETTE = (c: Colors) => [
  { bg: c.cardLavender, border: c.lavender },
  { bg: c.cardBlue, border: c.blue },
  { bg: c.cardBlush, border: c.blush },
  { bg: c.cardHoney, border: c.honey },
  { bg: c.cardSage, border: c.sage },
];

interface Props {
  title: string;
  villages: Village[];
  onPressVillage: (village: Village) => void;
  onSeeAll?: () => void;
  emptyTitle?: string;
  emptyMessage?: string;
}

// Tappable Patch chips for the profile's community-identity section, shared
// by the owner's own Profile and PublicProfileSheet so both read as the same
// social system. Reuses the existing Village catalog — no new membership logic.
export default function PatchChipRow({ title, villages, onPressVillage, onSeeAll, emptyTitle, emptyMessage }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const palette = CHIP_PALETTE(c);

  return (
    <View style={s.section}>
      <View style={s.headerRow}>
        <Text style={s.title}>{title}</Text>
        {onSeeAll && villages.length > 0 && (
          <TouchableOpacity onPress={onSeeAll} accessibilityRole="button" accessibilityLabel={`See all: ${title}`}>
            <Text style={s.seeAll}>See all</Text>
          </TouchableOpacity>
        )}
      </View>

      {villages.length === 0 ? (
        emptyTitle ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>{emptyTitle}</Text>
            {emptyMessage ? <Text style={s.emptyMessage}>{emptyMessage}</Text> : null}
          </View>
        ) : null
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {villages.map((v, i) => {
            const cc = palette[i % palette.length];
            return (
              <TouchableOpacity
                key={v.id}
                style={[s.chip, { backgroundColor: cc.bg, borderColor: cc.border }]}
                onPress={() => onPressVillage(v)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Open ${v.name}`}
              >
                <Text style={s.chipText}>{v.emoji} {v.name.replace(' Patch', '').replace(' Parents', '')}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    section: { marginBottom: 4 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    title: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    seeAll: { fontSize: 13, fontWeight: '700', color: c.primary },
    row: { gap: 8 },
    chip: { borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
    chipText: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    empty: { paddingVertical: 8 },
    emptyTitle: { fontSize: 13.5, fontWeight: '700', color: c.textPrimary },
    emptyMessage: { fontSize: 12.5, color: c.textMuted, marginTop: 2, lineHeight: 17 },
  });
}
