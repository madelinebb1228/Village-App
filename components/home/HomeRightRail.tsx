import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../../lib/theme';
import { typography } from '../../lib/typography';
import { hitSlopFor } from '../../lib/accessibility';
import { Village } from '../../lib/villageData';
import { TrendingTag } from '../../lib/discoverData';
import UpcomingEventsCard from './UpcomingEventsCard';

interface UpcomingEvent {
  id: string;
  title: string;
  starts_at: string;
  all_day: boolean;
  calendar_type: 'personal' | 'shared';
}

interface Props {
  joinedVillages: Village[];
  trendingTags: TrendingTag[];
  upcomingEvents: UpcomingEvent[];
  activeTag: string | null;
  onSelectTag: (tag: string) => void;
  onOpenPatch: (village: Village) => void;
  onDiscoverPatches: () => void;
  onOpenCalendar: () => void;
}

// Desktop-only companion column beside the Home feed. Deliberately reuses
// data Home already has in memory (joined Patches, the same trending-posts
// pool Home's own "Trending" carousel is built from, the same upcoming
// events the feed-insert card uses) — no new fetches, no fabricated counts.
// Kept intentionally small: at most three compact sections, neutral chrome
// like the rest of Home's chrome, with only the trending tag chips carrying
// a light Parent Patch accent (mirrors Discover's Trending Topics chip).
export default function HomeRightRail({
  joinedVillages, trendingTags, upcomingEvents, activeTag,
  onSelectTag, onOpenPatch, onDiscoverPatches, onOpenCalendar,
}: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <View style={s.rail}>
      <View style={s.card}>
        <Text style={s.sectionTitle}>Your Patches</Text>
        {joinedVillages.length === 0 ? (
          <>
            <Text style={s.emptyText}>Join a Patch to see its posts and updates here.</Text>
            <TouchableOpacity
              style={s.linkRow}
              onPress={onDiscoverPatches}
              hitSlop={hitSlopFor(20)}
              accessibilityRole="button"
              accessibilityLabel="Discover Patches"
            >
              <Text style={s.linkText}>Discover Patches</Text>
              <Ionicons name="arrow-forward" size={14} color={c.primary} />
            </TouchableOpacity>
          </>
        ) : (
          joinedVillages.slice(0, 5).map(v => (
            <TouchableOpacity
              key={v.id}
              style={s.patchRow}
              onPress={() => onOpenPatch(v)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${v.name}`}
            >
              <View style={s.patchEmojiBubble}>
                <Text style={s.patchEmoji}>{v.emoji}</Text>
              </View>
              <Text style={s.patchName} numberOfLines={1}>{v.name}</Text>
              <Ionicons name="chevron-forward" size={14} color={c.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </View>

      {trendingTags.length > 0 && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>Trending</Text>
          <View style={s.tagWrap}>
            {trendingTags.map(t => (
              <TouchableOpacity
                key={t.tag}
                style={[s.tagChip, activeTag === t.tag && s.tagChipActive]}
                onPress={() => onSelectTag(t.tag)}
                hitSlop={hitSlopFor(20)}
                accessibilityRole="button"
                accessibilityState={{ selected: activeTag === t.tag }}
                accessibilityLabel={`Filter feed by trending topic ${t.tag}`}
              >
                <Text style={[s.tagChipText, activeTag === t.tag && s.tagChipTextActive]}>#{t.tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <UpcomingEventsCard events={upcomingEvents} onPress={onOpenCalendar} />
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    rail: { width: 300, gap: 16 },
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.separator,
      padding: 16,
    },
    sectionTitle: { ...typography.sectionTitle, fontSize: 15, color: c.textPrimary, marginBottom: 10 },
    emptyText: { fontSize: 12.5, color: c.textMuted, lineHeight: 18, marginBottom: 10 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
    linkText: { fontSize: 13, fontWeight: '700', color: c.primary },
    patchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 44,
    },
    patchEmojiBubble: {
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: c.cardLavender,
      alignItems: 'center', justifyContent: 'center',
    },
    patchEmoji: { fontSize: 15 },
    patchName: { flex: 1, fontSize: 13.5, fontWeight: '600', color: c.textPrimary },
    tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: {
      borderWidth: 1.5, borderColor: c.separator, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.bg,
    },
    tagChipActive: { backgroundColor: c.cardLavender, borderColor: c.lavender },
    tagChipText: { fontSize: 12.5, fontWeight: '700', color: c.primary },
    tagChipTextActive: { color: c.primary },
  });
}
