import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Image, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator, SafeAreaView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';

// ─── Milestone definitions ────────────────────────────────────────────────────

const MILESTONES = [
  { key: 'week_1',       label: 'Week 1',       emoji: '🌱' },
  { key: 'week_2',       label: 'Week 2',       emoji: '🌿' },
  { key: '1_month',      label: '1 Month',      emoji: '🌸' },
  { key: '2_months',     label: '2 Months',     emoji: '🌷' },
  { key: '3_months',     label: '3 Months',     emoji: '🍀' },
  { key: '4_months',     label: '4 Months',     emoji: '🌼' },
  { key: '5_months',     label: '5 Months',     emoji: '🌻' },
  { key: '6_months',     label: '6 Months',     emoji: '🎈' },
  { key: '7_months',     label: '7 Months',     emoji: '⭐' },
  { key: '8_months',     label: '8 Months',     emoji: '🌙' },
  { key: '9_months',     label: '9 Months',     emoji: '🦋' },
  { key: '10_months',    label: '10 Months',    emoji: '🌈' },
  { key: '11_months',    label: '11 Months',    emoji: '🍁' },
  { key: '12_months',    label: '1 Year 🎂',    emoji: '🎂' },
  { key: '18_months',    label: '18 Months',    emoji: '🚀' },
  { key: '2_years',      label: '2 Years',      emoji: '🎉' },
  { key: 'first_smile',  label: 'First Smile',  emoji: '😊' },
  { key: 'first_laugh',  label: 'First Laugh',  emoji: '😄' },
  { key: 'first_roll',   label: 'First Roll',   emoji: '🔄' },
  { key: 'first_sit',    label: 'First Sit',    emoji: '🧸' },
  { key: 'first_crawl',  label: 'First Crawl',  emoji: '🐛' },
  { key: 'first_steps',  label: 'First Steps',  emoji: '👣' },
  { key: 'first_word',   label: 'First Word',   emoji: '💬' },
] as const;

type MilestoneKey = typeof MILESTONES[number]['key'];

interface MilestoneEntry {
  id: string;
  milestone_key: string;
  photo_url: string | null;
  caption: string | null;
}

const CARD_COLORS = (c: Colors) => [
  { bg: c.cardLavender, border: c.lavender },
  { bg: c.cardBlue,     border: c.blue     },
  { bg: c.cardBlush,    border: c.blush    },
  { bg: c.cardHoney,    border: c.honey    },
  { bg: c.cardSage,     border: c.sage     },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  userId: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MilestoneTracker({ userId }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const colors = CARD_COLORS(c);

  const [entries, setEntries] = useState<Record<string, MilestoneEntry>>({});
  const [loading, setLoading] = useState(true);

  // Editor modal — 'edit' shows the form, 'share' shows the post-to-feed prompt
  const [editing, setEditing] = useState<typeof MILESTONES[number] | null>(null);
  const [modalStep, setModalStep] = useState<'edit' | 'share'>('edit');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);

  // Author name (for feed post)
  const [authorName, setAuthorName] = useState('Parent');

  useEffect(() => {
    if (!userId) return;
    fetchEntries();
    fetchAuthor();
  }, [userId]);

  async function fetchEntries() {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('milestone_photos')
      .select('id, milestone_key, photo_url, caption')
      .eq('user_id', userId);
    if (data) {
      const map: Record<string, MilestoneEntry> = {};
      (data as MilestoneEntry[]).forEach(e => { map[e.milestone_key] = e; });
      setEntries(map);
    }
    setLoading(false);
  }

  async function fetchAuthor() {
    if (!userId) return;
    const { data } = await supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', userId)
      .maybeSingle();
    if (data) setAuthorName((data as any).display_name || (data as any).username || 'Parent');
  }

  function openEditor(m: typeof MILESTONES[number]) {
    const existing = entries[m.key];
    setEditing(m);
    setModalStep('edit');
    setPhotoUri(null);
    setPhotoUrl(existing?.photo_url ?? null);
    setCaption(existing?.caption ?? '');
    setSavedImageUrl(null);
  }

  function closeEditor() {
    setEditing(null);
    setModalStep('edit');
    setPhotoUri(null);
    setPhotoUrl(null);
    setCaption('');
    setSavedImageUrl(null);
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to add milestone photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function uploadPhoto(uri: string): Promise<string | null> {
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${userId}/milestone-${editing!.key}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('baby-photos')
        .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
      return data.publicUrl;
    } catch (err: any) {
      console.warn('Milestone photo upload failed:', err.message);
      return null;
    }
  }

  async function handleSave() {
    if (!editing || !userId) return;
    if (!photoUri && !photoUrl && !caption.trim()) {
      Alert.alert('Add something', 'Please add a photo or caption before saving.');
      return;
    }

    // Capture before any async work or state resets
    const savedMilestone = editing;
    const savedCaption = caption.trim();

    setSaving(true);

    let finalUrl = photoUrl;
    if (photoUri) {
      finalUrl = await uploadPhoto(photoUri);
    }

    const existing = entries[savedMilestone.key];
    if (existing) {
      await supabase.from('milestone_photos').update({
        photo_url: finalUrl,
        caption: savedCaption || null,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('milestone_photos').insert({
        user_id: userId,
        milestone_key: savedMilestone.key,
        photo_url: finalUrl,
        caption: savedCaption || null,
      });
    }

    setSaving(false);
    fetchEntries();
    setSavedImageUrl(finalUrl);
    setModalStep('share');
  }

  async function postToFeed(
    m: typeof MILESTONES[number],
    imageUrl: string | null,
    cap: string
  ) {
    if (!userId) return;
    const content = cap
      ? `${m.emoji} ${m.label} milestone!\n\n${cap}`
      : `${m.emoji} ${m.label} milestone!`;
    await supabase.from('posts').insert({
      user_id: userId,
      author: authorName,
      content,
      post_type: 'milestone',
      likes: 0,
      image_url: imageUrl ?? null,
      created_at: new Date().toISOString(),
    });
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <Text style={s.sectionTitle}>Development Tracker</Text>
        <Text style={s.sectionSubtitle}>Tap a milestone to add a photo</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.strip}
        >
          {MILESTONES.map((m, i) => {
            const entry = entries[m.key];
            const col = colors[i % colors.length];
            const hasPhoto = !!entry?.photo_url;
            return (
              <TouchableOpacity
                key={m.key}
                style={[s.card, { backgroundColor: col.bg, borderColor: col.border }]}
                onPress={() => openEditor(m)}
                activeOpacity={0.82}
              >
                {hasPhoto ? (
                  <Image source={{ uri: entry!.photo_url! }} style={s.cardPhoto} />
                ) : (
                  <View style={[s.cardPlaceholder, { borderColor: col.border }]}>
                    <Text style={s.cardPlaceholderEmoji}>📷</Text>
                  </View>
                )}
                <View style={s.cardFooter}>
                  <Text style={s.cardEmoji}>{m.emoji}</Text>
                  <Text style={s.cardLabel} numberOfLines={1}>{m.label}</Text>
                </View>
                {hasPhoto && (
                  <View style={s.doneBadge}>
                    <Text style={s.doneBadgeText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Editor Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={editing !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEditor}
      >
        <SafeAreaView style={s.modalSafe}>
          {/* ── Step: edit ───────────────────────────────────────────────── */}
          {modalStep === 'edit' && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <View style={s.modalHeader}>
                <TouchableOpacity onPress={closeEditor} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.modalCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={s.modalTitle}>{editing?.emoji} {editing?.label}</Text>
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={saving}
                  style={[s.modalSaveBtn, saving && s.modalSaveBtnDisabled]}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.modalSaveBtnText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
                <TouchableOpacity onPress={pickPhoto} activeOpacity={0.85} style={s.photoArea}>
                  {(photoUri || photoUrl) ? (
                    <>
                      <Image
                        source={{ uri: photoUri ?? photoUrl! }}
                        style={s.photoPreview}
                        resizeMode="cover"
                      />
                      <View style={s.changePhotoOverlay}>
                        <Text style={s.changePhotoText}>📷  Change photo</Text>
                      </View>
                    </>
                  ) : (
                    <View style={s.photoEmpty}>
                      <Text style={s.photoEmptyEmoji}>📷</Text>
                      <Text style={s.photoEmptyText}>Tap to add a photo</Text>
                      <Text style={s.photoEmptyHint}>Square photos look best</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <Text style={s.captionLabel}>Caption</Text>
                <TextInput
                  style={s.captionInput}
                  value={caption}
                  onChangeText={setCaption}
                  placeholder={`Add a note about ${editing?.label ?? 'this milestone'}…`}
                  placeholderTextColor={c.textMuted}
                  multiline
                />
              </ScrollView>
            </KeyboardAvoidingView>
          )}

          {/* ── Step: share ──────────────────────────────────────────────── */}
          {modalStep === 'share' && (
            <View style={s.shareStep}>
              <Text style={s.promptEmoji}>🎉</Text>
              <Text style={s.promptTitle}>Milestone saved!</Text>
              <Text style={s.promptBody}>
                Share your <Text style={{ fontWeight: '800' }}>{editing?.label}</Text> milestone to your village feed so everyone can celebrate?
              </Text>
              <View style={s.promptBtns}>
                <TouchableOpacity
                  style={s.promptBtnSecondary}
                  onPress={closeEditor}
                  activeOpacity={0.8}
                >
                  <Text style={s.promptBtnSecondaryText}>Not now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.promptBtnPrimary}
                  onPress={() => {
                    if (editing) postToFeed(editing, savedImageUrl, caption);
                    closeEditor();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={s.promptBtnPrimaryText}>Post it! 🎊</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { marginTop: 24 },
    headerRow: { marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
    sectionSubtitle: { fontSize: 12, color: c.textMuted, fontWeight: '500', marginTop: 2 },

    // ── strip
    strip: { paddingRight: 8, gap: 10 },
    card: {
      width: 120,
      borderRadius: 16,
      borderWidth: 2,
      overflow: 'hidden',
    },
    cardPhoto: { width: 120, height: 120 },
    cardPlaceholder: {
      width: 120,
      height: 120,
      justifyContent: 'center',
      alignItems: 'center',
      borderBottomWidth: 1.5,
    },
    cardPlaceholderEmoji: { fontSize: 32, opacity: 0.4 },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      padding: 8,
    },
    cardEmoji: { fontSize: 14 },
    cardLabel: { fontSize: 11, fontWeight: '700', color: c.textSecondary, flex: 1 },
    doneBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.sage,
      justifyContent: 'center',
      alignItems: 'center',
    },
    doneBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

    // ── modal
    modalSafe: { flex: 1, backgroundColor: c.bg },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    modalCancel: { fontSize: 15, color: c.textMuted, fontWeight: '600', width: 60 },
    modalTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    modalSaveBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 16,
      width: 60,
      alignItems: 'center',
    },
    modalSaveBtnDisabled: { backgroundColor: c.primaryDisabled },
    modalSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    modalBody: { padding: 16, gap: 16 },

    // ── photo picker
    photoArea: {
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: c.card,
      borderWidth: 2,
      borderColor: c.cardBorder,
      borderStyle: 'dashed',
    },
    photoPreview: { width: '100%', aspectRatio: 1 },
    changePhotoOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingVertical: 10,
      alignItems: 'center',
    },
    changePhotoText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    photoEmpty: {
      aspectRatio: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
    },
    photoEmptyEmoji: { fontSize: 44, opacity: 0.4 },
    photoEmptyText: { fontSize: 15, fontWeight: '700', color: c.textMuted },
    photoEmptyHint: { fontSize: 12, color: c.textMuted },

    // ── caption
    captionLabel: { fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase' },
    captionInput: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      fontSize: 15,
      color: c.textPrimary,
      minHeight: 100,
      textAlignVertical: 'top',
      borderWidth: 1.5,
      borderColor: c.inputBorder,
    },

    // ── share step (shown inside the same modal after save)
    shareStep: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
      gap: 12,
    },
    promptEmoji: { fontSize: 48 },
    promptTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary, textAlign: 'center' },
    promptBody: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
    promptBtns: { flexDirection: 'row', gap: 10, marginTop: 8, width: '100%' },
    promptBtnSecondary: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: c.bgAlt,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: c.cardBorder,
    },
    promptBtnSecondaryText: { fontSize: 14, fontWeight: '700', color: c.textMuted },
    promptBtnPrimary: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: c.primary,
      alignItems: 'center',
    },
    promptBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  });
}
