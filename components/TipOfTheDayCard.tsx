import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors, Colors } from '../lib/theme';

// ─── Tip data ───────────────────────────────────────────────────────────────
// Each tip links to a real, already-built Resources screen via resourceId.

export interface Tip {
  emoji: string;
  title: string;
  body: string;
  resourceId: string;
}

const TIPS: Tip[] = [
  { emoji: '🌊', title: 'Never leave a baby alone near water', body: 'Drowning can happen silently in seconds — even in just an inch of water. Always stay within arm\'s reach during bath time.', resourceId: 'water_safety' },
  { emoji: '🫁', title: 'Know the choking first-aid steps before you need them', body: 'Infant and child choking rescue differs from adult techniques. A quick refresher now can save precious seconds later.', resourceId: 'choking_safety' },
  { emoji: '🤱', title: 'A good latch shouldn\'t hurt', body: 'Pain past the first few seconds usually means it\'s time to break the seal and try again. Our breastfeeding guide covers common fixes.', resourceId: 'breastfeeding_101' },
  { emoji: '🍼', title: 'Introduce one new food at a time', body: 'Waiting 2–3 days between new foods makes it much easier to spot an allergic reaction if one happens.', resourceId: 'food_chart' },
  { emoji: '🧡', title: 'WIC-eligible doesn\'t mean boring', body: 'Parents in our community share creative recipes built entirely around WIC staples — browse for fresh meal ideas.', resourceId: 'wic_recipes' },
  { emoji: '🥣', title: 'Ready for solids? Skip the salt and honey', body: 'Babies under 12 months shouldn\'t have added salt or honey. See our weaning recipes for safe first-food ideas.', resourceId: 'weaning_recipes' },
  { emoji: '🛍️', title: 'Packing a hospital bag? Don\'t start from scratch', body: 'Use a curated checklist so you don\'t forget the small stuff at 2am contractions.', resourceId: 'shopping_lists' },
  { emoji: '📖', title: 'Heard a parenting term you don\'t recognize?', body: 'From "cluster feeding" to "wake windows," our A–Z glossary explains it in plain English.', resourceId: 'parenting_az' },
];

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TipOfTheDayCard({ onPress }: { onPress: (resourceId: string) => void }) {
  const c = useColors();
  const s = useMemo(() => styles(c), [c]);
  const tip = useMemo(() => TIPS[dayOfYear(new Date()) % TIPS.length], []);

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.85}
      onPress={() => onPress(tip.resourceId)}
    >
      <View style={s.headerRow}>
        <Text style={s.emoji}>{tip.emoji}</Text>
        <Text style={s.label}>Tip of the Day</Text>
      </View>
      <Text style={s.title}>{tip.title}</Text>
      <Text style={s.body}>{tip.body}</Text>
      <Text style={s.cta}>Learn more →</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (c: Colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.cardHoney,
      borderColor: c.honey,
      borderWidth: 2,
      borderRadius: 16,
      padding: 18,
      marginBottom: 28,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    emoji: { fontSize: 20 },
    label: {
      fontSize: 12,
      fontWeight: '800',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: c.textPrimary,
      marginBottom: 6,
    },
    body: {
      fontSize: 14,
      fontWeight: '500',
      color: c.textSecondary,
      lineHeight: 20,
      marginBottom: 10,
    },
    cta: {
      fontSize: 13,
      fontWeight: '700',
      color: c.honey,
    },
  });
