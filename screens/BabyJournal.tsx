import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  Image, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete, generateId, useSyncStatus } from '../lib/syncService';
import { useColors } from '../lib/theme';
import TrackerHeader from '../components/TrackerHeader';
import { useCollapsed } from '../lib/useCollapsed';
import { moderateImage } from '../lib/contentModeration';
import ContentBlockedModal from '../components/ContentBlockedModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JournalEntry {
  id: string;
  title: string | null;
  caption: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  happened_on: string | null;
  category: string;
  created_at: string;
}

interface PendingImage {
  uri: string;
  uploadedUrl?: string;
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

const CATEGORIES = [
  { key: 'first',     label: '⭐ First' },
  { key: 'milestone', label: '🎉 Milestone' },
  { key: 'everyday',  label: '💕 Everyday' },
  { key: 'growth',    label: '📏 Growth' },
  { key: 'custom',    label: '✏️ Custom' },
] as const;

const CATEGORY_EMOJI: Record<string, string> = {
  first: '⭐',
  milestone: '🎉',
  growth: '📏',
  everyday: '💕',
  custom: '✏️',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDisplayDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function monthYearLabel(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'long', year: 'numeric',
  });
}

function formatPickerDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function dateToISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = '/baby-photos/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function uploadJournalPhoto(uri: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/journal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
  const { pendingCount } = useSyncStatus();

  const [collapsed, toggleCollapsed] = useCollapsed('baby_journal_collapsed');

  const [entries, setEntries]   = useState<JournalEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loaded, setLoaded]     = useState(false);

  // Filter / search
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery]       = useState('');

  // New/edit entry modal
  const [showModal, setShowModal]           = useState(false);
  const [editingEntry, setEditingEntry]     = useState<JournalEntry | null>(null);
  const [title, setTitle]                   = useState('');
  const [caption, setCaption]               = useState('');
  const [entryDate, setEntryDate]           = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [category, setCategory]             = useState('everyday');
  const [pendingImages, setPendingImages]   = useState<PendingImage[]>([]);
  const [removedImageUrls, setRemovedImageUrls] = useState<string[]>([]);
  const [saving, setSaving]                 = useState(false);
  const [showTemplates, setShowTemplates]   = useState(true);

  // Content moderation
  const [moderating, setModerating]         = useState(false);
  const [blockedContent, setBlockedContent] = useState<{ severity: 'high' | 'extreme'; reason: string } | null>(null);

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Share prompt
  const [pendingShareEntry, setPendingShareEntry] = useState<JournalEntry | null>(null);

  // Offline-queued indicator
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (pendingCount === 0) {
      setQueuedIds(prev => (prev.size ? new Set() : prev));
    }
  }, [pendingCount]);

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

  // ─── Filtering ────────────────────────────────────────────────────────────

  const filteredEntries = entries.filter(e => {
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const inTitle = e.title?.toLowerCase().includes(q);
      const inCaption = e.caption?.toLowerCase().includes(q);
      if (!inTitle && !inCaption) return false;
    }
    return true;
  });

  // ─── Actions ──────────────────────────────────────────────────────────────

  function openModal() {
    setEditingEntry(null);
    setTitle(''); setCaption(''); setEntryDate(new Date());
    setCategory('everyday'); setPendingImages([]); setRemovedImageUrls([]);
    setShowTemplates(true);
    setShowModal(true);
  }

  function openEditModal(entry: JournalEntry) {
    setEditingEntry(entry);
    setTitle(entry.title ?? '');
    setCaption(entry.caption ?? '');
    setEntryDate(entry.happened_on ? new Date(entry.happened_on + 'T12:00:00') : new Date());
    setCategory(entry.category);
    const urls = entry.image_urls?.length ? entry.image_urls : (entry.image_url ? [entry.image_url] : []);
    setPendingImages(urls.map(u => ({ uri: u, uploadedUrl: u })));
    setRemovedImageUrls([]);
    setShowTemplates(false);
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
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    for (const asset of result.assets) {
      setModerating(true);
      const modResult = await moderateImage(asset.uri);
      setModerating(false);
      if (modResult.blocked) {
        setBlockedContent({ severity: modResult.severity, reason: modResult.reason });
        continue;
      }
      setPendingImages(prev => [...prev, { uri: asset.uri }]);
    }
  }

  function removePendingImage(idx: number) {
    setPendingImages(prev => {
      const removed = prev[idx];
      if (removed?.uploadedUrl) {
        setRemovedImageUrls(r => [...r, removed.uploadedUrl!]);
      }
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function cleanupStorageUrls(urls: string[]) {
    const paths = urls.map(storagePathFromUrl).filter((p): p is string => !!p);
    if (!paths.length) return;
    try {
      await supabase.storage.from('baby-photos').remove(paths);
    } catch (err: any) {
      console.warn('Journal storage cleanup failed:', err.message);
    }
  }

  async function saveEntry() {
    if (!userId) return;
    setSaving(true);
    try {
      const uploaded: string[] = [];
      for (const img of pendingImages) {
        if (img.uploadedUrl) { uploaded.push(img.uploadedUrl); continue; }
        const url = await uploadJournalPhoto(img.uri, userId);
        if (url) uploaded.push(url);
      }
      const happenedOnISO = dateToISO(entryDate);

      if (editingEntry) {
        const patch = {
          title: title.trim() || null,
          caption: caption.trim() || null,
          image_url: uploaded[0] ?? null,
          image_urls: uploaded,
          happened_on: happenedOnISO,
          category,
        };
        const { queued } = await safeUpdate('baby_journal', editingEntry.id, patch);
        if (queued) setQueuedIds(prev => new Set(prev).add(editingEntry.id));
        if (removedImageUrls.length) cleanupStorageUrls(removedImageUrls);

        setEntries(prev => prev.map(e => e.id === editingEntry.id ? { ...e, ...patch } : e));
        setShowModal(false);
      } else {
        const entryId = generateId();
        const newEntry: JournalEntry = {
          id: entryId,
          title: title.trim() || null,
          caption: caption.trim() || null,
          image_url: uploaded[0] ?? null,
          image_urls: uploaded,
          happened_on: happenedOnISO,
          category,
          created_at: new Date().toISOString(),
        };
        const { queued } = await safeInsert('baby_journal', {
          ...newEntry,
          user_id: userId,
          baby_id: babyId,
        });
        if (queued) setQueuedIds(prev => new Set(prev).add(entryId));

        setEntries(prev => [newEntry, ...prev]);
        setShowModal(false);
        setPendingShareEntry(newEntry);
      }
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

  async function deleteEntry(entry: JournalEntry) {
    Alert.alert('Delete memory?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await safeDelete('baby_journal', entry.id);
          const urls = entry.image_urls?.length ? entry.image_urls : (entry.image_url ? [entry.image_url] : []);
          cleanupStorageUrls(urls);
          setEntries(prev => prev.filter(e => e.id !== entry.id));
        },
      },
    ]);
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  function renderEntry(entry: JournalEntry) {
    const images = entry.image_urls?.length ? entry.image_urls : (entry.image_url ? [entry.image_url] : []);
    const isQueued = queuedIds.has(entry.id);

    return (
      <View key={entry.id} style={{
        backgroundColor: c.card, borderRadius: 16, marginBottom: 16,
        overflow: 'hidden', borderWidth: 1.5, borderColor: c.separator,
      }}>
        {images.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {images.map((url, i) => (
              <TouchableOpacity key={i} onPress={() => setLightboxUrl(url)} activeOpacity={0.9}>
                <Image
                  source={{ uri: url }}
                  style={{ width: 220, height: 220, marginRight: i === images.length - 1 ? 0 : 2 }}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : images.length === 1 ? (
          <TouchableOpacity onPress={() => setLightboxUrl(images[0])} activeOpacity={0.9}>
            <Image
              source={{ uri: images[0] }}
              style={Platform.OS === 'web'
                ? { width: 280, height: 320, alignSelf: 'center' as const, borderRadius: 12 }
                : { width: '100%', height: 260 }}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : null}
        <View style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Text style={{ fontSize: 15 }}>{CATEGORY_EMOJI[entry.category] ?? '📸'}</Text>
              {entry.title ? (
                <Text style={{ fontSize: 15, fontWeight: '800', color: c.textPrimary, flex: 1 }} numberOfLines={1}>
                  {entry.title}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <TouchableOpacity
                onPress={() => openEditModal(entry)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                accessibilityLabel="Edit memory"
                accessibilityRole="button"
                {...(Platform.OS === 'web' ? { title: 'Edit' } : {})}
              >
                <Text style={{ fontSize: 13 }}>✏️</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600' }}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPendingShareEntry(entry)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                accessibilityLabel="Share memory to feed"
                accessibilityRole="button"
                {...(Platform.OS === 'web' ? { title: 'Share to feed' } : {})}
              >
                <Text style={{ fontSize: 13 }}>📤</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600' }}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => deleteEntry(entry)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                accessibilityLabel="Delete memory"
                accessibilityRole="button"
                {...(Platform.OS === 'web' ? { title: 'Delete' } : {})}
              >
                <Text style={{ fontSize: 13, color: c.textMuted }}>🗑</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
          {entry.caption ? (
            <Text style={{ fontSize: 14, color: c.textSecondary, lineHeight: 20, marginBottom: 8 }}>
              {entry.caption}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {entry.happened_on ? (
              <Text style={{ fontSize: 12, color: c.textMuted }}>
                {formatDisplayDate(entry.happened_on)}
              </Text>
            ) : <View />}
            {isQueued ? (
              <View style={{ backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600' }}>⏳ Not synced</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  function renderEntryList() {
    let lastLabel = '';
    const out: React.ReactNode[] = [];
    for (const entry of filteredEntries) {
      const label = entry.happened_on ? monthYearLabel(entry.happened_on) : 'Undated';
      if (label !== lastLabel) {
        out.push(
          <Text
            key={`h-${label}-${entry.id}`}
            style={{
              fontSize: 13, fontWeight: '800', color: c.textMuted,
              marginBottom: 10, marginTop: lastLabel ? 10 : 0,
            }}
          >
            {label}
          </Text>
        );
        lastLabel = label;
      }
      out.push(renderEntry(entry));
    }
    return out;
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <View style={{ marginBottom: 16 }}>
      <TrackerHeader
        emoji="📓" title="Baby Journal"
        subtitle={babyName ? `${babyName}'s memories` : 'Your memories'}
        collapsed={collapsed} onToggle={toggleCollapsed}
        accentBg={c.cardHoney} accentColor={c.honey}
      />

      {!collapsed && (<>

      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 14, marginBottom: 16 }}>
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
        <>
          {/* Search */}
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search memories..."
            placeholderTextColor={c.textMuted}
            style={{
              backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5,
              borderColor: c.separator, padding: 12, fontSize: 14,
              color: c.textPrimary, marginBottom: 12,
            }}
          />

          {/* Category filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[{ key: 'all', label: 'All' }, ...CATEGORIES].map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => setFilterCategory(cat.key)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: filterCategory === cat.key ? c.primary : c.card,
                    borderWidth: 1.5,
                    borderColor: filterCategory === cat.key ? c.primary : c.separator,
                  }}
                >
                  <Text style={{
                    fontSize: 13, fontWeight: '600',
                    color: filterCategory === cat.key ? '#fff' : c.textMuted,
                  }}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {filteredEntries.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center' }}>
                No memories match your search or filter.
              </Text>
            </View>
          ) : (
            renderEntryList()
          )}
        </>
      )}

      </>)}

      {/* ── New/edit entry modal ── */}
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
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>
              {editingEntry ? 'Edit Memory' : 'New Memory'}
            </Text>
            <TouchableOpacity
              onPress={saveEntry}
              disabled={saving || (!title.trim() && !caption.trim() && pendingImages.length === 0)}
              style={{ opacity: (!title.trim() && !caption.trim() && pendingImages.length === 0) ? 0.4 : 1 }}
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

            {/* Photos */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {pendingImages.map((img, i) => (
                  <View key={i} style={{ width: 100, height: 100, borderRadius: 12, overflow: 'hidden' }}>
                    <Image source={{ uri: img.uploadedUrl ?? img.uri }} style={{ width: 100, height: 100 }} resizeMode="cover" />
                    <TouchableOpacity
                      onPress={() => removePendingImage(i)}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
                        width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={pickPhoto}
                  style={{
                    width: 100, height: 100, borderRadius: 12,
                    backgroundColor: c.card, borderWidth: 1.5,
                    borderColor: c.separator, borderStyle: 'dashed' as any,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 22, marginBottom: 2 }}>📷</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600' }}>Add</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

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
            {Platform.OS === 'web' ? (
              // @ts-ignore — raw DOM input, web-only branch
              <input
                type="date"
                value={dateToISO(entryDate)}
                max={dateToISO(new Date())}
                onChange={(e: any) => {
                  if (e.target.value) setEntryDate(new Date(e.target.value + 'T12:00:00'));
                }}
                style={{
                  backgroundColor: c.card, borderRadius: 12,
                  border: `1.5px solid ${c.separator}`,
                  padding: 13, fontSize: 15, color: c.textPrimary,
                  marginBottom: 24, width: '100%', boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={{
                    backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5,
                    borderColor: c.separator, padding: 13, marginBottom: showDatePicker ? 8 : 24,
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 15, color: c.textPrimary }}>{formatPickerDate(entryDate)}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={entryDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    maximumDate={new Date()}
                    onChange={(event: any, selectedDate?: Date) => {
                      if (Platform.OS === 'android') setShowDatePicker(false);
                      if (event?.type === 'dismissed') return;
                      if (selectedDate) setEntryDate(selectedDate);
                    }}
                  />
                )}
                {Platform.OS === 'ios' && showDatePicker && (
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(false)}
                    style={{ alignSelf: 'flex-end', marginBottom: 24 }}
                  >
                    <Text style={{ color: c.primary, fontWeight: '700', fontSize: 14 }}>Done</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Category */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 10 }}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
              {CATEGORIES.map(cat => (
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
              disabled={saving || (!title.trim() && !caption.trim() && pendingImages.length === 0)}
              style={{
                backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14,
                alignItems: 'center',
                opacity: (!title.trim() && !caption.trim() && pendingImages.length === 0) ? 0.45 : 1,
              }}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                    {editingEntry ? 'Save Changes' : 'Save Memory'}
                  </Text>
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
              Would you like to post this memory to your community feed so everyone can see it?
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

      {/* ── Lightbox ── */}
      <Modal visible={!!lightboxUrl} animationType="fade" transparent onRequestClose={() => setLightboxUrl(null)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' }}
          activeOpacity={1}
          onPress={() => setLightboxUrl(null)}
        >
          {lightboxUrl ? (
            <Image
              source={{ uri: lightboxUrl }}
              style={{ width: '92%', height: '80%' }}
              resizeMode="contain"
            />
          ) : null}
          <TouchableOpacity
            onPress={() => setLightboxUrl(null)}
            style={{
              position: 'absolute', top: 50, right: 24,
              backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 18,
              width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Content moderation blocked modal ── */}
      {blockedContent && userId && (
        <ContentBlockedModal
          visible={!!blockedContent}
          severity={blockedContent.severity}
          reason={blockedContent.reason}
          contentType="baby_photo"
          userId={userId}
          onClose={() => setBlockedContent(null)}
        />
      )}

      {/* ── Moderation loading overlay ── */}
      {moderating && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', gap: 12,
        }}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Checking photo…</Text>
        </View>
      )}
    </View>
  );
}
