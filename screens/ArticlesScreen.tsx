import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Linking } from 'react-native';
import { useColors, Colors } from '../lib/theme';
import { ARTICLES } from '../lib/articlesData';
import { TERMS } from './ParentingAZ';
import { linkifyParagraph } from '../lib/termLinking';

interface Props {
  onBack: () => void;
  onTermPress?: (termId: string) => void;
}

export default function ArticlesScreen({ onBack, onTermPress }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = ARTICLES.find(a => a.id === openId) ?? null;

  const linkedBody = useMemo(() => {
    if (!open) return [];
    const used = new Set<string>();
    return open.body.map(p => linkifyParagraph(p, TERMS, used));
  }, [open]);

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
          {linkedBody.map((segments, i) => (
            <Text key={i} style={s.paragraph}>
              {segments.map((seg, j) =>
                seg.termId ? (
                  <Text
                    key={j}
                    style={s.termLink}
                    onPress={() => onTermPress?.(seg.termId!)}
                    accessibilityRole="link"
                    accessibilityLabel={`Glossary: ${seg.text}`}
                  >
                    {seg.text}
                  </Text>
                ) : (
                  <Text key={j}>{seg.text}</Text>
                )
              )}
            </Text>
          ))}
          {open.sources && open.sources.length > 0 && (
            <View style={s.sourcesBlock}>
              <Text style={s.sourcesHeading}>Sources</Text>
              {open.sources.map((src, i) => (
                <TouchableOpacity key={i} onPress={() => Linking.openURL(src.url)} accessibilityRole="link">
                  <Text style={s.sourceItem}>{src.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
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
    termLink: { color: c.lavender, fontWeight: '700' },
    sourcesBlock: { marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.separator },
    sourcesHeading: { fontSize: 13, fontWeight: '800', color: c.textMuted, marginBottom: 8, letterSpacing: 0.5 },
    sourceItem: { fontSize: 13, color: c.lavender, fontWeight: '600', lineHeight: 20, marginBottom: 6 },
  });
}
