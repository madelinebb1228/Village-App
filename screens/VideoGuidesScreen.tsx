import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useColors, Colors } from '../lib/theme';
import { supabase } from '../lib/supabase';

interface Props {
  onBack: () => void;
}

const CATEGORIES = [
  { emoji: '🍼', title: 'Feeding', desc: 'Latching, paced bottle feeding, pumping setup' },
  { emoji: '😴', title: 'Sleep & Soothing', desc: 'Swaddling, safe sleep setup, calming techniques' },
  { emoji: '🛁', title: 'Bathing & Hygiene', desc: 'First baths, umbilical cord care, nail trimming' },
  { emoji: '🚑', title: 'Safety & First Aid', desc: 'Infant CPR, choking response, car seat installation' },
  { emoji: '🧸', title: 'Play & Development', desc: 'Tummy time, milestone activities by age' },
];

export default function VideoGuidesScreen({ onBack }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const [showSuggest, setShowSuggest] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !url.trim()) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in to suggest a video.');
      const { error } = await (supabase as any).from('video_guide_suggestions').insert({
        user_id: user.id, title: title.trim(), url: url.trim(), note: note.trim() || null,
      });
      if (error) throw error;
      setSubmitted(true);
      setTitle(''); setUrl(''); setNote('');
    } catch (err: any) {
      Alert.alert('Could not submit', err?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
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
        <Text style={s.pageTitle}>🎬 Video Guides</Text>
        <Text style={s.pageSub}>
          This section is built by the community — browse the categories below for what kind of how-to videos we're
          collecting, and suggest one you've found helpful.
        </Text>

        {CATEGORIES.map(cat => (
          <View key={cat.title} style={s.card}>
            <Text style={s.cardEmoji}>{cat.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{cat.title}</Text>
              <Text style={s.cardDesc}>{cat.desc}</Text>
            </View>
          </View>
        ))}

        {showSuggest ? (
          submitted ? (
            <View style={s.doneCard}>
              <Text style={s.doneEmoji}>🎉</Text>
              <Text style={s.doneTitle}>Thanks for the suggestion!</Text>
              <Text style={s.doneText}>We'll review it and may feature it here for other parents.</Text>
            </View>
          ) : (
            <View style={s.form}>
              <Text style={s.label}>Video title</Text>
              <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="e.g. How to swaddle a newborn" placeholderTextColor={c.textMuted} />
              <Text style={s.label}>Link</Text>
              <TextInput style={s.input} value={url} onChangeText={setUrl} placeholder="https://..." placeholderTextColor={c.textMuted} autoCapitalize="none" keyboardType="url" />
              <Text style={s.label}>Why is it helpful? (optional)</Text>
              <TextInput style={[s.input, s.inputMulti]} value={note} onChangeText={setNote} placeholder="A sentence or two..." placeholderTextColor={c.textMuted} multiline />
              <TouchableOpacity
                style={[s.submitBtn, (!title.trim() || !url.trim()) && s.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting || !title.trim() || !url.trim()}
                accessibilityRole="button"
                accessibilityLabel="Submit video suggestion"
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>Submit</Text>}
              </TouchableOpacity>
            </View>
          )
        ) : (
          <TouchableOpacity style={s.suggestBtn} onPress={() => setShowSuggest(true)} accessibilityRole="button" accessibilityLabel="Suggest a video">
            <Text style={s.suggestBtnText}>+ Suggest a video</Text>
          </TouchableOpacity>
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
    body: { padding: 20, paddingBottom: 48 },
    pageTitle: { fontSize: 22, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    pageSub: { fontSize: 13, color: c.textMuted, marginBottom: 20, lineHeight: 19 },
    card: {
      flexDirection: 'row', gap: 12, backgroundColor: c.card, borderRadius: 14,
      padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.separator, alignItems: 'center',
    },
    cardEmoji: { fontSize: 26 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    cardDesc: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    suggestBtn: {
      marginTop: 12, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    },
    suggestBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    form: { marginTop: 16 },
    label: { fontSize: 13, fontWeight: '700', color: c.textMuted, marginBottom: 6, marginTop: 14 },
    input: {
      backgroundColor: c.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, color: c.textPrimary,
    },
    inputMulti: { minHeight: 70, textAlignVertical: 'top' },
    submitBtn: { marginTop: 20, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    submitBtnDisabled: { opacity: 0.45 },
    submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    doneCard: { alignItems: 'center', marginTop: 20, padding: 20 },
    doneEmoji: { fontSize: 36, marginBottom: 8 },
    doneTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
    doneText: { fontSize: 13, color: c.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  });
}
