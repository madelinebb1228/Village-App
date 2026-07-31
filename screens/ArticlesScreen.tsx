import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useColors, Colors } from '../lib/theme';
import { ARTICLES } from '../lib/articlesData';

interface Props {
  onBack: () => void;
}

export default function ArticlesScreen({ onBack }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = ARTICLES.find(a => a.id === openId) ?? null;

  if (open) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setOpenId(null)} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="Back to Articles">
            <Text style={s.backArrow}>←</Text>
            <Text style={s.backLabel}>Articles</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.body}>
          <Text style={s.detailEmoji}>{open.emoji}</Text>
          <Text style={s.detailTitle}>{open.title}</Text>
          <Text style={s.detailMeta}>{open.category} · {open.readMinutes} min read</Text>
          {open.body.map((p, i) => (
            <Text key={i} style={s.paragraph}>{p}</Text>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button" accessibilityLabel="Back to Resources">
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.pageTitle}>📰 Articles</Text>
        <Text style={s.pageSub}>Expert-style tips and guides — more added regularly.</Text>
        {ARTICLES.map(a => (
          <TouchableOpacity
            key={a.id}
            style={s.card}
            onPress={() => setOpenId(a.id)}
            accessibilityRole="button"
            accessibilityLabel={`Read ${a.title}`}
          >
            <Text style={s.cardEmoji}>{a.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{a.title}</Text>
              <Text style={s.cardMeta}>{a.category} · {a.readMinutes} min read</Text>
              <Text style={s.cardSummary} numberOfLines={2}>{a.summary}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.separator },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow: { fontSize: 20, color: c.textPrimary },
    backLabel: { fontSize: 15, fontWeight: '600', color: c.textPrimary },
    body: { padding: 20, paddingBottom: 48 },
    pageTitle: { fontSize: 22, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    pageSub: { fontSize: 13, color: c.textMuted, marginBottom: 20 },
    card: {
      flexDirection: 'row', gap: 12, backgroundColor: c.card, borderRadius: 14,
      padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.separator,
    },
    cardEmoji: { fontSize: 26 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    cardMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    cardSummary: { fontSize: 13, color: c.textSecondary, marginTop: 6, lineHeight: 18 },
    detailEmoji: { fontSize: 40, marginBottom: 8 },
    detailTitle: { fontSize: 22, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    detailMeta: { fontSize: 13, color: c.textMuted, marginBottom: 16 },
    paragraph: { fontSize: 15, color: c.textSecondary, lineHeight: 23, marginBottom: 14 },
  });
}
