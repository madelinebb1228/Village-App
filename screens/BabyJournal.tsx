import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  Image, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JournalEntry {
  id: string;
  title: string | null;
  caption: string | null;
  image_url: string | null;
  happened_on: string | null;
  category: string;
  created_at: string;
}

// ─── Templates ────────────────────────────────────────────────────────────────

const TEMPLATES = [
  { emoji: '😊', title: 'First Smile',               category: 'first' },
  { emoji: '😂', title: 'First Laugh',               category: 'first' },
  { emoji: '🛁', title: 'First Bath',                category: 'first' },
  { emoji: '🥣', title: 'First Solid Foods',         category: 'first' },
  { emoji: '👣', title: 'First Steps',               category: 'first' },
  { emoji: '🗣️', title: 'First Word',               category: 'first' },
  { emoji: '😴', title: 'Slept Through the Night',   category: 'milestone' },
  { emoji: '💈', title: 'First Haircut',             category: 'first' },
  { emoji: '📏', title: 'Growth Update',             category: 'growth' },
  { emoji: '🎂', title: 'Birthday',                  category: 'milestone' },
  { emoji: '✈️', title: 'First Trip',               category: 'first' },
  { emoji: '🌅', title: 'First Day Home',            category: 'milestone' },
  { emoji: '📸', title: 'Just a Cute Moment',        category: 'everyday' },
  { emoji: '💕', title: 'Tummy Time',                category: 'everyday' },
  { emoji: '🎉', title: 'Big Day',                   category: 'milestone' },
];

const CATEGORY_EMOJI: Record<string, string> = {
  first: '⭐',
  milestone: '🎉',
  growth: '📏',
  everyday: '💕',
  custom: '✏️',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDisplayDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

async function uploadJournalPhoto(uri: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/journal-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('baby-photos')
      .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (err: any) {
    console.warn('Journal photo upload failed:', err.message);
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BabyJournal({
  userId,
  babyId,
  babyName,
}: {
  userId: string | null;
  babyId: string | null;
  babyName: string | null;
}) {
  const c = useColors();

  const [entries, setEntries]   = useState<JournalEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loaded, setLoaded]     = useState(false);

  // New entry modal
  const [showModal, setShowModal]       = useState(false);
  const [title, setTitle]               = useState('');
  const [caption, setCaption]           = useState('');
  const [happenedOn, setHappenedOn]     = useState(todayISO());
  const [category, setCategory]         = useState('everyday');
  const [imageUri, setImageUri]         = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [showTemplates, setShowTemplates] = useState(true);

  // Share prompt
  const [pendingShareEntry, setPendingShareEntry] = useState<JournalEntry | null>(null);

  // ─── Data ─────────────────────────────────────────────────────────────────

  const loadEntries = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('baby_journal')
        .select('*')
        .eq('user_id', userId)
        .order('happened_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEntries(data ?? []);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [userId]);

  // Lazy load — only fetch when first rendered
  React.useEffect(() => {
    if (!loaded) loadEntries();
  }, [loaded, loadEntries]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  function openModal() {
    setTitle(''); setCaption(''); setHappenedOn(todayISO());
    setCategory('everyday'); setImageUri(null); setShowTemplates(true);
    setShowModal(true);
  }

  function applyTemplate(t: typeof TEMPLATES[number]) {
    setTitle(t.title);
    setCategory(t.category);
    setShowTemplates(false);
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function saveEntry() {
    if (!userId) return;
    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (imageUri) {
        imageUrl = await uploadJournalPhoto(imageUri, userId);
      }

      const { data, error } = await supabase
        .from('baby_journal')
        .insert({
          user_id: userId,
          baby_id: babyId,
          title: title.trim() || null,
          caption: caption.trim() || null,
          image_url: imageUrl,
          happened_on: happenedOn || todayISO(),
          category,
        })
        .select('*')
        .single();

      if (error) throw error;

      setEntries(prev => [data, ...prev]);
      setShowModal(false);
      setPendingShareEntry(data);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save entry.');
    } finally {
      setSaving(false);
    }
  }

  async function shareToFeed(entry: JournalEntry) {
    if (!userId) return;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', userId)
      .maybeSingle();
    const author = profileData?.username ?? profileData?.display_name ?? 'Someone';

    const content = [entry.title ?? '', entry.caption ?? '']
      .filter(Boolean).join('\n\n') || 'A new memory 💕';

    const { error } = await supabase.from('posts').insert({
      user_id: userId,
      author,
      content,
      post_type: 'milestone',
      likes: 0,
      created_at: new Date().toISOString(),
      image_url: entry.image_url ?? null,
    });

    setPendingShareEntry(null);
    if (error) {
      if (Platform.OS === 'web') window.alert('Could not share: ' + error.message);
      else Alert.alert('Could not share', error.message);
    }
  }

  async function deleteEntry(id: string) {
    Alert.alert('Delete memory?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('baby_journal').delete().eq('id', id);
          if (!error) setEntries(prev => prev.filter(e => e.id !== id));
        },
      },
    ]);
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  function renderEntry(entry: JournalEntry) {
    return (
      <View key={entry.id} style={{
        backgroundColor: c.card, borderRadius: 16, marginBottom: 16,
        overflow: 'hidden', borderWidth: 1.5, borderColor: c.separator,
      }}>
        {entry.image_url ? (
          <Image
            source={{ uri: entry.image_url }}
            style={Platform.OS === 'web'
              ? { width: 280, height: 320, alignSelf: 'center' as const, borderRadius: 12 }
              : { width: '100%', height: 260 }}
            resizeMode="cover"
          />
        ) : null}
        <View style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 15 }}>{CATEGORY_EMOJI[entry.category] ?? '📸'}</Text>
              {entry.title ? (
                <Text style={{ fontSize: 15, fontWeight: '800', color: c.textPrimary, flex: 1 }}>
                  {entry.title}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => deleteEntry(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 14, color: c.textMuted }}>🗑</Text>
            </TouchableOpacity>
          </View>
          {entry.caption ? (
            <Text style={{ fontSize: 14, color: c.textSecondary, lineHeight: 20, marginBottom: 8 }}>
              {entry.caption}
            </Text>
          ) : null}
          {entry.happened_on ? (
            <Text style={{ fontSize: 12, color: c.textMuted }}>
              {formatDisplayDate(entry.happened_on)}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <View>
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ fontSize: 14, color: c.textMuted }}>
          {babyName ? `${babyName}'s memories` : 'Your memories'}
        </Text>
        <TouchableOpacity
          onPress={openModal}
          style={{
            backgroundColor: c.primary, borderRadius: 20,
            paddingHorizontal: 16, paddingVertical: 8,
          }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>+ New Memory</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ paddingVertical: 32 }} color={c.primary} />
      ) : entries.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📖</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.textPrimary, marginBottom: 6 }}>
            Start your journal
          </Text>
          <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 20 }}>
            Capture first smiles, milestones, and everyday moments you never want to forget.
          </Text>
        </View>
      ) : (
        entries.map(renderEntry)
      )}

      {/* ── New entry modal ── */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>

          {/* Modal header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: c.separator,
          }}>
            <TouchableOpacity onPress={() => setShowModal(false)} style={{ width: 40 }}>
              <Text style={{ fontSize: 18, color: c.textMuted }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>New Memory</Text>
            <TouchableOpacity
              onPress={saveEntry}
              disabled={saving || (!title.trim() && !caption.trim() && !imageUri)}
              style={{ opacity: (!title.trim() && !caption.trim() && !imageUri) ? 0.4 : 1 }}
            >
              {saving
                ? <ActivityIndicator size="small" color={c.primary} />
                : <Text style={{ fontSize: 16, fontWeight: '700', color: c.primary }}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

            {/* Template suggestions */}
            {showTemplates ? (
              <View style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary }}>
                    ✨ Choose a template or start from scratch
                  </Text>
                  <TouchableOpacity onPress={() => setShowTemplates(false)}>
                    <Text style={{ fontSize: 13, color: c.textMuted }}>Skip</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {TEMPLATES.map(t => (
                    <TouchableOpacity
                      key={t.title}
                      onPress={() => applyTemplate(t)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: c.card, borderRadius: 20,
                        paddingHorizontal: 12, paddingVertical: 8,
                        borderWidth: 1.5, borderColor: c.separator,
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={{ fontSize: 14 }}>{t.emoji}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: c.textSecondary }}>{t.title}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowTemplates(true)}
                style={{ marginBottom: 20 }}
              >
                <Text style={{ fontSize: 13, color: c.textMuted }}>✨ Show templates</Text>
              </TouchableOpacity>
            )}

            {/* Photo */}
            <TouchableOpacity
              onPress={pickPhoto}
              style={{
                height: imageUri ? undefined : 120,
                backgroundColor: c.card,
                borderRadius: 14, borderWidth: 1.5,
                borderColor: imageUri ? 'transparent' : c.separator,
                borderStyle: imageUri ? undefined : 'dashed' as any,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 16, overflow: 'hidden',
              }}
              activeOpacity={0.8}
            >
              {imageUri ? (
                <View>
                  <Image
                    source={{ uri: imageUri }}
                    style={Platform.OS === 'web'
                      ? { width: 260, height: 260, alignSelf: 'center' as const }
                      : { width: '100%', height: 220 }}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    onPress={() => setImageUri(null)}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12,
                      paddingHorizontal: 10, paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 28, marginBottom: 6 }}>📷</Text>
                  <Text style={{ fontSize: 13, color: c.textMuted, fontWeight: '600' }}>Add a photo</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Title */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Title</Text>
            <TextInput
              style={{
                backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5,
                borderColor: c.separator, padding: 13, fontSize: 15,
                color: c.textPrimary, marginBottom: 16,
              }}
              placeholder="e.g. First Smile"
              placeholderTextColor={c.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            {/* Caption */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Memory / Note</Text>
            <TextInput
              style={{
                backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5,
                borderColor: c.separator, padding: 13, fontSize: 15,
                color: c.textPrimary, minHeight: 100, marginBottom: 16,
                textAlignVertical: 'top',
              }}
              placeholder="Write about this moment..."
              placeholderTextColor={c.textMuted}
              value={caption}
              onChangeText={setCaption}
              multiline
            />

            {/* Date */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>When did this happen?</Text>
            <TextInput
              style={{
                backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5,
                borderColor: c.separator, padding: 13, fontSize: 15,
                color: c.textPrimary, marginBottom: 24,
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={c.textMuted}
              value={happenedOn}
              onChangeText={setHappenedOn}
            />

            {/* Category */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 10 }}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
              {([
                { key: 'first',     label: '⭐ First' },
                { key: 'milestone', label: '🎉 Milestone' },
                { key: 'everyday',  label: '💕 Everyday' },
                { key: 'growth',    label: '📏 Growth' },
                { key: 'custom',    label: '✏️ Custom' },
              ] as const).map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => setCategory(cat.key)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: category === cat.key ? c.primary : c.card,
                    borderWidth: 1.5,
                    borderColor: category === cat.key ? c.primary : c.separator,
                  }}
                >
                  <Text style={{
                    fontSize: 13, fontWeight: '600',
                    color: category === cat.key ? '#fff' : c.textMuted,
                  }}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={saveEntry}
              disabled={saving || (!title.trim() && !caption.trim() && !imageUri)}
              style={{
                backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14,
                alignItems: 'center',
                opacity: (!title.trim() && !caption.trim() && !imageUri) ? 0.45 : 1,
              }}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Save Memory</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Share prompt modal ── */}
      <Modal visible={!!pendingShareEntry} animationType="fade" transparent>
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center', alignItems: 'center', padding: 32,
        }}>
          <View style={{
            backgroundColor: c.card, borderRadius: 20, padding: 28,
            width: '100%', maxWidth: 340, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>🏘️</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary, marginBottom: 8, textAlign: 'center' }}>
              Share to your feed?
            </Text>
            <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
              Would you like to post this memory to your village feed so your community can see it?
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: c.primary, borderRadius: 14,
                paddingVertical: 13, width: '100%', alignItems: 'center', marginBottom: 10,
              }}
              onPress={() => pendingShareEntry && shareToFeed(pendingShareEntry)}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Share to Feed</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingVertical: 10, width: '100%', alignItems: 'center' }}
              onPress={() => setPendingShareEntry(null)}
            >
              <Text style={{ fontSize: 14, color: c.textMuted, fontWeight: '600' }}>Keep Private</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
