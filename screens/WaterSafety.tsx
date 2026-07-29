import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useColors, Colors } from '../lib/theme';

interface Props {
  onBack: () => void;
}

interface Section {
  emoji: string;
  title: string;
  bg: (c: Colors) => string;
  border: (c: Colors) => string;
  items: string[];
}

const SECTIONS: Section[] = [
  {
    emoji: '🧺',
    title: 'The basics',
    bg: c => c.cardBlush, border: c => c.blush,
    items: [
      'Never leave a child unsupervised near any water — bathtub, pool, bucket, kiddie pool — not even for a few seconds to grab a towel or answer the door.',
      'Empty tubs, buckets, and kiddie pools immediately after use. A few inches of standing water is enough.',
      'Keep bathroom doors closed and toilet lids down between uses.',
      'Never prop a baby in a bath seat or ring and step away — these are not safety devices.',
      'Enroll in age-appropriate swim lessons. The AAP says formal lessons can start as early as age 1 for many children.',
      'Learn infant/child CPR. Classes through the Red Cross or a local hospital are widely available and inexpensive.',
    ],
  },
  {
    emoji: '🏊',
    title: 'If you have a pool or spend time near one',
    bg: c => c.cardBlue, border: c => c.blue,
    items: [
      'A four-sided fence (separate from the house) with a self-closing, self-latching gate is the single most effective layer of protection.',
      'Add door and window alarms for any door leading directly to the pool area.',
      'Remove toys from in and around the pool when not in use — they draw kids back for "just one more look."',
      'Assign a "water watcher" during any pool time: one undistracted adult, phone away, whose only job is watching the water.',
      'Life jackets, not floaties or water wings, for anyone who can\'t swim confidently — especially around open water or boats.',
    ],
  },
  {
    emoji: '📅',
    title: 'By age',
    bg: c => c.cardSage, border: c => c.sage,
    items: [
      'Under 1: constant touch supervision during bath time — an adult within arm\'s reach the entire time, hands on if needed.',
      '1–4 years: this is the highest-risk age group for drowning. Touch supervision applies any time they\'re in or near water, even shallow water.',
      '5+ years: still needs active, attentive supervision. Teach "reach or throw, don\'t go" — kids should never attempt to physically rescue someone themselves.',
    ],
  },
  {
    emoji: '🚨',
    title: 'In an emergency',
    bg: c => c.cardHoney, border: c => c.honey,
    items: [
      'Call 911 immediately, and begin CPR right away if you\'re trained — every second matters.',
      'Drowning is usually silent, not splashy. A child in real trouble often can\'t call out or wave for help — watch for it, don\'t wait to hear it.',
    ],
  },
  {
    emoji: '👶',
    title: 'CPR — infant under 1 year',
    bg: c => c.cardLavender, border: c => c.lavender,
    items: [
      'Check for response and breathing. If they\'re unresponsive and not breathing normally, have someone call 911 while you start CPR — if you\'re alone, give about 2 minutes of CPR first, then call.',
      'For a drowning victim specifically, start with 5 rescue breaths before compressions — tilt the head back slightly to a neutral position, seal your mouth over the baby\'s mouth and nose, and give gentle puffs just enough to see the chest rise.',
      'Lay baby face-up on a firm, flat surface. Give 30 chest compressions with two fingers (or two thumbs with hands encircling the chest) on the breastbone just below the nipple line — about 1.5 inches deep, fast and hard, roughly 100–120 per minute.',
      'Give 2 more breaths, then continue cycles of 30 compressions to 2 breaths.',
      'Don\'t stop until EMS arrives, an AED is ready to use, or the baby starts breathing normally on their own.',
    ],
  },
  {
    emoji: '🧒',
    title: 'CPR — child 1 year and up',
    bg: c => c.cardLavender, border: c => c.lavender,
    items: [
      'Check for response and breathing. If they\'re unresponsive and not breathing normally, have someone call 911 while you start CPR — if you\'re alone, give about 2 minutes of CPR first, then call.',
      'For a drowning victim specifically, start with 5 rescue breaths before compressions — tilt the head back, lift the chin, pinch the nose shut, and give breaths just enough to see the chest rise.',
      'Lay the child face-up on a firm, flat surface. Give 30 chest compressions with the heel of one or two hands on the center of the chest — about 2 inches deep, fast and hard, roughly 100–120 per minute.',
      'Give 2 more breaths, then continue cycles of 30 compressions to 2 breaths.',
      'Don\'t stop until EMS arrives, an AED is ready to use, or the child starts breathing normally on their own.',
    ],
  },
];

export default function WaterSafety({ onBack }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={[s.heroCard, { backgroundColor: c.cardBlue, borderColor: c.blue }]}>
          <Text style={s.heroEmoji}>🌊</Text>
          <Text style={s.heroTitle}>Water Safety</Text>
          <Text style={s.heroDesc}>
            Drowning is fast and silent — it's one of the leading causes of death for young children. A few
            consistent habits make an enormous difference.
          </Text>
        </View>

        {SECTIONS.map(section => (
          <View
            key={section.title}
            style={[s.sectionCard, { backgroundColor: section.bg(c), borderColor: section.border(c) }]}
          >
            <Text style={s.sectionTitle}>{section.emoji}  {section.title}</Text>
            {section.items.map((item, i) => (
              <View key={i} style={s.itemRow}>
                <Text style={s.itemBullet}>•</Text>
                <Text style={s.itemText}>{item}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={s.disclaimer}>
          This is general safety guidance, not a substitute for a certified water-safety, swim, or CPR course.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.separator },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow: { fontSize: 18, color: c.textPrimary, fontWeight: '700' },
    backLabel: { fontSize: 15, color: c.textPrimary, fontWeight: '600' },

    body: { padding: 20, paddingBottom: 48, gap: 14 },

    heroCard: { borderRadius: 18, borderWidth: 2, padding: 20, alignItems: 'center', marginBottom: 4 },
    heroEmoji: { fontSize: 36, marginBottom: 8 },
    heroTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary, marginBottom: 8, textAlign: 'center' },
    heroDesc: { fontSize: 14, color: c.textSecondary, lineHeight: 20, textAlign: 'center' },

    sectionCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 10 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary, marginBottom: 2 },
    itemRow: { flexDirection: 'row', gap: 8 },
    itemBullet: { fontSize: 14, color: c.textSecondary, lineHeight: 20 },
    itemText: { flex: 1, fontSize: 14, color: c.textSecondary, lineHeight: 20 },

    disclaimer: { fontSize: 12, color: c.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: 8, lineHeight: 17 },
  });
}
