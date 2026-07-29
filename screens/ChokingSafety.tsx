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
    emoji: '🍽️',
    title: 'Preventing it',
    bg: c => c.cardSage, border: c => c.sage,
    items: [
      'Cut food into pieces no larger than a pea for babies and toddlers — round, firm foods are the biggest risk.',
      'Avoid whole grapes, nuts and seeds, popcorn, hard candy, chunks of hot dog, raw carrots, and large blobs of nut butter until a pediatrician says it\'s okay.',
      'Always supervise meals and snacks — no eating in a moving car seat unsupervised, no food while lying down, no food while playing or running around.',
      'Keep coins, batteries (especially small button batteries), balloons, and small toy parts out of reach — anything that fits through a toilet paper tube is a choking hazard.',
      'Follow age labels on toys — small-parts warnings exist for a reason, even for "hand-me-down" toys from older siblings.',
    ],
  },
  {
    emoji: '👀',
    title: 'Recognizing it',
    bg: c => c.cardHoney, border: c => c.honey,
    items: [
      'Mild choking: they can still cough, cry, or talk. Stay close and encourage coughing — don\'t intervene or slap their back, which can push the object in further.',
      'Severe choking: no sound, no cough, no cry, can\'t breathe — or a weak, silent cough, bluish lips or face, panicked expression, or clutching the throat. This needs immediate action.',
    ],
  },
  {
    emoji: '👶',
    title: 'Clearing it — under 1 year',
    bg: c => c.cardBlush, border: c => c.blush,
    items: [
      'Sit and lay baby face-down along your forearm, supported on your thigh, head lower than their chest, jaw supported with your hand.',
      'Give 5 firm back blows with the heel of your hand between the shoulder blades.',
      'If the object doesn\'t come out, turn baby face-up (still supported on your arm/thigh) and give 5 chest thrusts — two fingers on the center of the breastbone, just below the nipple line, pressing firmly.',
      'Repeat the 5-and-5 cycle. Call 911 if it doesn\'t clear quickly, or have someone call while you continue.',
      'If baby becomes unresponsive, start infant CPR immediately and keep checking the mouth for a visible object before any rescue breaths.',
    ],
  },
  {
    emoji: '🧒',
    title: 'Clearing it — over 1 year',
    bg: c => c.cardBlue, border: c => c.blue,
    items: [
      'Stand or kneel behind them, wrap your arms around their waist.',
      'Make a fist with one hand, thumb side in, placed just above the navel and well below the breastbone.',
      'Grasp your fist with your other hand and give quick, firm upward thrusts (abdominal thrusts / the Heimlich maneuver) until the object comes out or they can breathe, cough, or cry on their own.',
      'If they become unresponsive, lower them to the ground, call 911, and begin CPR — chest compressions can also help dislodge the object.',
    ],
  },
];

export default function ChokingSafety({ onBack }: Props) {
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
        <View style={[s.heroCard, { backgroundColor: c.cardHoney, borderColor: c.honey }]}>
          <Text style={s.heroEmoji}>🫁</Text>
          <Text style={s.heroTitle}>Choking Safety</Text>
          <Text style={s.heroDesc}>
            Choking is one of the most common emergencies in young children — and one of the most treatable, if
            you know what to do in the moment.
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
          This is general guidance, not a substitute for a certified infant/child CPR and choking-response
          course — the Red Cross and American Heart Association both offer hands-on classes, and the muscle
          memory from practicing genuinely matters in the moment.
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
