import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, TextInput } from 'react-native';
import { useColors, Colors } from '../lib/theme';
import { TOP_QUESTIONS } from '../lib/topQuestionsData';

interface Props {
  onBack: () => void;
}

const CATEGORIES = ['All', ...Array.from(new Set(TOP_QUESTIONS.map(q => q.category)))];

export default function TopQuestionsScreen({ onBack }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOP_QUESTIONS.filter(item =>
      (category === 'All' || item.category === category) &&
      (!q || item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)),
    );
  }, [category, query]);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button" accessibilityLabel="Back to Resources">
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search questions..."
          placeholderTextColor={c.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={s.catRow}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[s.catChip, category === cat && s.catChipActive]}
            onPress={() => setCategory(cat)}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${cat}`}
          >
            <Text style={[s.catChipText, category === cat && s.catChipTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.pageTitle}>🔢 Common Questions</Text>
        <Text style={s.pageSub}>The most common parenting questions — answered briefly.</Text>
        {filtered.length === 0 ? (
          <Text style={s.emptyText}>No questions match "{query}"</Text>
        ) : (
          filtered.map(item => {
            const expanded = openId === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={s.card}
                onPress={() => setOpenId(expanded ? null : item.id)}
                accessibilityRole="button"
                accessibilityLabel={item.question}
              >
                <View style={s.cardHeaderRow}>
                  <Text style={s.cardQuestion}>{item.question}</Text>
                  <Text style={s.chevron}>{expanded ? '−' : '+'}</Text>
                </View>
                {expanded && <Text style={s.cardAnswer}>{item.answer}</Text>}
              </TouchableOpacity>
            );
          })
        )}
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
    searchWrap: { paddingHorizontal: 20, paddingTop: 14 },
    searchInput: {
      backgroundColor: c.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
      fontSize: 14, color: c.textPrimary,
    },
    catScroll: { flexGrow: 0, marginTop: 12 },
    catRow: { paddingHorizontal: 20, gap: 8 },
    catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: c.inputBg },
    catChipActive: { backgroundColor: c.cardBlush },
    catChipText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    catChipTextActive: { color: c.primary },
    body: { padding: 20, paddingBottom: 48 },
    pageTitle: { fontSize: 22, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    pageSub: { fontSize: 13, color: c.textMuted, marginBottom: 16 },
    emptyText: { fontSize: 14, color: c.textMuted, textAlign: 'center', marginTop: 24 },
    card: {
      backgroundColor: c.card, borderRadius: 14, padding: 14, marginBottom: 8,
      borderWidth: 1, borderColor: c.separator,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    cardQuestion: { flex: 1, fontSize: 14, fontWeight: '700', color: c.textPrimary },
    chevron: { fontSize: 18, fontWeight: '700', color: c.primary },
    cardAnswer: { fontSize: 14, color: c.textSecondary, lineHeight: 20, marginTop: 10 },
  });
}
