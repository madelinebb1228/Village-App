import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useColors, Colors } from '../lib/theme';
import QAScreen from './QAScreen';
import LocalServicesScreen from './LocalServicesScreen';

// ─── Resource definitions ─────────────────────────────────────────────────────

const RESOURCES = [
  {
    id: 'qa',
    emoji: '💬',
    title: 'Parenting Q+A',
    description: 'Ask questions and get answers from other parents',
    bg: (c: Colors) => c.cardLavender,
    border: (c: Colors) => c.lavender,
  },
  {
    id: 'articles',
    emoji: '📰',
    title: 'Articles',
    description: 'Expert tips, guides, and parenting reads',
    bg: (c: Colors) => c.cardBlue,
    border: (c: Colors) => c.blue,
  },
  {
    id: 'local',
    emoji: '📍',
    title: 'Local Services',
    description: 'Find pediatricians, lactation consultants, and more near you',
    bg: (c: Colors) => c.cardBlush,
    border: (c: Colors) => c.blush,
  },
  {
    id: 'emergency',
    emoji: '🚨',
    title: 'Emergency Contacts',
    description: 'Nurse lines, poison control, and urgent care resources',
    bg: (c: Colors) => c.cardHoney,
    border: (c: Colors) => c.honey,
  },
  {
    id: 'videos',
    emoji: '🎬',
    title: 'Video Guides',
    description: 'How-to videos for feeding, sleep, soothing, and more',
    bg: (c: Colors) => c.cardSage,
    border: (c: Colors) => c.sage,
  },
  {
    id: 'top100',
    emoji: '🔢',
    title: '100 Questions Every Parent Asks',
    description: 'The most common parenting questions — answered',
    bg: (c: Colors) => c.cardLavender,
    border: (c: Colors) => c.lavender,
  },
] as const;

type ResourceId = typeof RESOURCES[number]['id'];

// ─── Detail placeholder screen ────────────────────────────────────────────────

function ResourceDetail({
  id,
  onBack,
}: {
  id: ResourceId;
  onBack: () => void;
}) {
  const c = useColors();
  const resource = RESOURCES.find(r => r.id === id)!;
  const s = detailStyles(c);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        <View style={[s.heroCard, { backgroundColor: resource.bg(c), borderColor: resource.border(c) }]}>
          <Text style={s.heroEmoji}>{resource.emoji}</Text>
          <Text style={s.heroTitle}>{resource.title}</Text>
          <Text style={s.heroDesc}>{resource.description}</Text>
        </View>

        <View style={s.comingSoon}>
          <Text style={s.comingSoonEmoji}>🌱</Text>
          <Text style={s.comingSoonTitle}>Coming soon</Text>
          <Text style={s.comingSoonText}>
            We're working on filling this section with great content for your village. Check back soon!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Main Resources landing screen ───────────────────────────────────────────

export default function ResourcesTab() {
  const c = useColors();
  const s = styles(c);
  const [selected, setSelected] = useState<ResourceId | null>(null);

  if (selected === 'qa') {
    return <QAScreen onBack={() => setSelected(null)} />;
  }

  if (selected === 'local') {
    return <LocalServicesScreen onBack={() => setSelected(null)} />;
  }

  if (selected) {
    return <ResourceDetail id={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>Resources</Text>
        <Text style={s.pageSubtitle}>Everything you need to support your parenting journey</Text>

        <View style={s.cards}>
          {RESOURCES.map(r => (
            <TouchableOpacity
              key={r.id}
              activeOpacity={0.8}
              style={[s.card, { backgroundColor: r.bg(c), borderColor: r.border(c) }]}
              onPress={() => setSelected(r.id)}
            >
              <Text style={s.cardEmoji}>{r.emoji}</Text>
              <View style={s.cardText}>
                <Text style={s.cardTitle}>{r.title}</Text>
                <Text style={s.cardDesc}>{r.description}</Text>
              </View>
              <Text style={s.cardChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    scroll: { padding: 20, paddingBottom: 40 },
    pageTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: c.textPrimary,
      marginBottom: 6,
    },
    pageSubtitle: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '500',
      marginBottom: 24,
    },
    cards: { gap: 12 },
    card: {
      borderRadius: 16,
      borderWidth: 2,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    cardEmoji: { fontSize: 32 },
    cardText: { flex: 1 },
    cardTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: c.textPrimary,
      marginBottom: 3,
    },
    cardDesc: {
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: '500',
      lineHeight: 18,
    },
    cardChevron: {
      fontSize: 24,
      color: c.textMuted,
      fontWeight: '700',
    },
  });

const detailStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    backArrow: {
      fontSize: 20,
      color: c.textSecondary,
      fontWeight: '700',
    },
    backLabel: {
      fontSize: 15,
      color: c.textSecondary,
      fontWeight: '700',
    },
    body: { padding: 20, paddingBottom: 40, gap: 20 },
    heroCard: {
      borderRadius: 20,
      borderWidth: 2,
      padding: 24,
      alignItems: 'center',
      gap: 8,
    },
    heroEmoji: { fontSize: 48 },
    heroTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: c.textPrimary,
      textAlign: 'center',
    },
    heroDesc: {
      fontSize: 14,
      color: c.textSecondary,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
    },
    comingSoon: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 28,
      alignItems: 'center',
      gap: 8,
    },
    comingSoonEmoji: { fontSize: 36 },
    comingSoonTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: c.textPrimary,
    },
    comingSoonText: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
    },
  });
