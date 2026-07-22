import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Image, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator, SafeAreaView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { moderateImage } from '../lib/contentModeration';
import ContentBlockedModal from '../components/ContentBlockedModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type MilestoneDef = {
  key: string;
  label: string;
  emoji: string;
  ageWeeksMin?: number;
  ageWeeksMax?: number;
  isCustom?: boolean;
};

type MilestoneCategory = {
  key: string;
  label: string;
  emoji: string;
  milestones: MilestoneDef[];
};

interface MilestoneEntry {
  id: string;
  milestone_key: string;
  photo_url: string | null;
  caption: string | null;
}

type Meta = {
  achievedDate?: string;
  customLabel?: string;
  customEmoji?: string;
  mediaType?: 'photo' | 'video';
};

// ─── Milestone categories ─────────────────────────────────────────────────────

const CATEGORIES: MilestoneCategory[] = [
  {
    key: 'monthly',
    label: 'Monthly Photos',
    emoji: '📅',
    milestones: [
      { key: 'week_1',    label: 'Week 1',    emoji: '🌱' },
      { key: 'week_2',    label: 'Week 2',    emoji: '🌿' },
      { key: '1_month',   label: '1 Month',   emoji: '🌸' },
      { key: '2_months',  label: '2 Months',  emoji: '🌷' },
      { key: '3_months',  label: '3 Months',  emoji: '🍀' },
      { key: '4_months',  label: '4 Months',  emoji: '🌼' },
      { key: '5_months',  label: '5 Months',  emoji: '🌻' },
      { key: '6_months',  label: '6 Months',  emoji: '🎈' },
      { key: '7_months',  label: '7 Months',  emoji: '⭐' },
      { key: '8_months',  label: '8 Months',  emoji: '🌙' },
      { key: '9_months',  label: '9 Months',  emoji: '🦋' },
      { key: '10_months', label: '10 Months', emoji: '🌈' },
      { key: '11_months', label: '11 Months', emoji: '🍁' },
      { key: '12_months', label: '1 Year 🎂', emoji: '🎂' },
      { key: '18_months', label: '18 Months', emoji: '🚀' },
      { key: '2_years',   label: '2 Years',   emoji: '🎉' },
    ],
  },
  {
    key: 'motor',
    label: 'Motor Skills',
    emoji: '💪',
    milestones: [
      { key: 'first_tummy_time', label: 'Holds Head Up',   emoji: '👶', ageWeeksMin: 4,  ageWeeksMax: 12 },
      { key: 'first_roll',       label: 'First Roll',      emoji: '🔄', ageWeeksMin: 14, ageWeeksMax: 22 },
      { key: 'first_sit',        label: 'Sits Unassisted', emoji: '🧸', ageWeeksMin: 24, ageWeeksMax: 32 },
      { key: 'first_crawl',      label: 'First Crawl',     emoji: '🐛', ageWeeksMin: 28, ageWeeksMax: 40 },
      { key: 'first_pull_up',    label: 'Pulls to Stand',  emoji: '🪑', ageWeeksMin: 36, ageWeeksMax: 48 },
      { key: 'first_steps',      label: 'First Steps',     emoji: '👣', ageWeeksMin: 44, ageWeeksMax: 58 },
      { key: 'first_run',        label: 'First Run',       emoji: '🏃', ageWeeksMin: 60, ageWeeksMax: 80 },
    ],
  },
  {
    key: 'communication',
    label: 'Communication',
    emoji: '💬',
    milestones: [
      { key: 'first_smile',    label: 'First Smile',    emoji: '😊', ageWeeksMin: 4,  ageWeeksMax: 8   },
      { key: 'first_coo',      label: 'First Coo',      emoji: '🐣', ageWeeksMin: 6,  ageWeeksMax: 14  },
      { key: 'first_laugh',    label: 'First Laugh',    emoji: '😄', ageWeeksMin: 12, ageWeeksMax: 20  },
      { key: 'first_babble',   label: 'First Babble',   emoji: '🗣️', ageWeeksMin: 20, ageWeeksMax: 32  },
      { key: 'first_word',     label: 'First Word',     emoji: '💬', ageWeeksMin: 36, ageWeeksMax: 56  },
      { key: 'first_sentence', label: 'First Sentence', emoji: '📢', ageWeeksMin: 78, ageWeeksMax: 104 },
    ],
  },
  {
    key: 'social',
    label: 'Social & Emotional',
    emoji: '❤️',
    milestones: [
      { key: 'recognizes_face', label: 'Recognizes Your Face', emoji: '👀', ageWeeksMin: 4,  ageWeeksMax: 8   },
      { key: 'plays_peekaboo',  label: 'Plays Peek-a-Boo',    emoji: '🙈', ageWeeksMin: 28, ageWeeksMax: 40  },
      { key: 'first_wave',      label: 'First Wave',           emoji: '👋', ageWeeksMin: 32, ageWeeksMax: 44  },
      { key: 'first_clap',      label: 'First Clap',           emoji: '👏', ageWeeksMin: 32, ageWeeksMax: 44  },
      { key: 'gives_kisses',    label: 'Gives Kisses',         emoji: '💋', ageWeeksMin: 44, ageWeeksMax: 60  },
      { key: 'shows_empathy',   label: 'Shows Empathy',        emoji: '🤗', ageWeeksMin: 78, ageWeeksMax: 104 },
    ],
  },
  {
    key: 'eating',
    label: 'Eating & Growth',
    emoji: '🍽️',
    milestones: [
      { key: 'sleeps_through_night', label: 'Sleeps Through Night', emoji: '🌙', ageWeeksMin: 12, ageWeeksMax: 36 },
      { key: 'first_tooth',          label: 'First Tooth',          emoji: '🦷', ageWeeksMin: 24, ageWeeksMax: 40 },
      { key: 'first_solids',         label: 'First Solid Foods',    emoji: '🥄', ageWeeksMin: 24, ageWeeksMax: 32 },
      { key: 'first_cup',            label: 'First Cup',            emoji: '🥤', ageWeeksMin: 28, ageWeeksMax: 40 },
      { key: 'first_self_feed',      label: 'Self-Feeding',         emoji: '🖐️', ageWeeksMin: 36, ageWeeksMax: 48 },
    ],
  },
];

const ALL_MILESTONES = CATEGORIES.flatMap(c => c.milestones);

// ─── Meta encoding ────────────────────────────────────────────────────────────

const META_PFX = '[MILMETA:';

function decodeMeta(raw: string | null): { meta: Meta; text: string } {
  if (!raw || !raw.startsWith(META_PFX)) return { meta: {}, text: raw ?? '' };
  const end = raw.indexOf(']');
  if (end === -1) return { meta: {}, text: raw };
  try {
    const meta = JSON.parse(raw.slice(META_PFX.length, end)) as Meta;
    return { meta, text: raw.slice(end + 1).replace(/^\n/, '') };
  } catch {
    return { meta: {}, text: raw };
  }
}

function encodeMeta(meta: Meta, text: string): string {
  const filled = Object.fromEntries(Object.entries(meta).filter(([, v]) => v)) as Meta;
  if (!Object.keys(filled).length) return text;
  return `${META_PFX}${JSON.stringify(filled)}]\n${text}`;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseDate(input: string): string | null {
  const s = input.trim();
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const y = parseInt(m1[3]);
    const d = new Date(y < 100 ? y + 2000 : y, parseInt(m1[1]) - 1, parseInt(m1[2]));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

const CARD_COLORS = (c: Colors) => [
  { bg: c.cardLavender, border: c.lavender },
  { bg: c.cardBlue,     border: c.blue     },
  { bg: c.cardBlush,    border: c.blush    },
  { bg: c.cardHoney,    border: c.honey    },
  { bg: c.cardSage,     border: c.sage     },
];

// ─── Video preview (must be outside parent to avoid hook-in-inner-component) ──

function VideoPreview({ uri, style }: { uri: string; style: any }) {
  const player = useVideoPlayer(uri, p => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={style} contentFit="cover" nativeControls={false} />;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  userId: string | null;
  babyBirthDate?: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MilestoneTracker({ userId, babyBirthDate }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const colors = useMemo(() => CARD_COLORS(c), [c]);

  const [entries,     setEntries]     = useState<Record<string, MilestoneEntry>>({});
  const [loading,     setLoading]     = useState(true);

  // Editor
  const [editing,       setEditing]       = useState<MilestoneDef | null>(null);
  const [modalStep,     setModalStep]     = useState<'edit' | 'share'>('edit');
  const [mediaUri,      setMediaUri]      = useState<string | null>(null);  // local picked URI
  const [mediaUrl,      setMediaUrl]      = useState<string | null>(null);  // remote stored URL
  const [isVideo,       setIsVideo]       = useState(false);
  const [caption,       setCaption]       = useState('');
  const [achievedDate,  setAchievedDate]  = useState('');
  const [customLabel,   setCustomLabel]   = useState('');
  const [customEmoji,   setCustomEmoji]   = useState('⭐');
  const [saving,        setSaving]        = useState(false);
  const [savedMediaUrl, setSavedMediaUrl] = useState<string | null>(null);
  const [authorName,    setAuthorName]    = useState('Parent');
  const [moderating,    setModerating]    = useState(false);
  const [blockedContent, setBlockedContent] = useState<{ severity: 'high' | 'extreme'; reason: string } | null>(null);

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
      .from('profiles').select('display_name, username')
      .eq('id', userId).maybeSingle();
    if (data) setAuthorName((data as any).display_name || (data as any).username || 'Parent');
  }

  const customEntries = useMemo(
    () => Object.values(entries).filter(e => e.milestone_key.startsWith('custom_')),
    [entries],
  );

  const comingNext = useMemo(() => {
    if (!babyBirthDate) return [];
    const ageWeeks = (Date.now() - new Date(babyBirthDate).getTime()) / (7 * 24 * 3600 * 1000);
    return ALL_MILESTONES
      .filter(m => m.ageWeeksMin != null && m.ageWeeksMax != null)
      .filter(m => ageWeeks >= m.ageWeeksMin! - 2 && ageWeeks <= m.ageWeeksMax!)
      .filter(m => !entries[m.key])
      .slice(0, 5);
  }, [babyBirthDate, entries]);

  const capturedCount = ALL_MILESTONES.filter(m => entries[m.key]).length;

  // ─── Editor open/close ───────────────────────────────────────────────────

  function openEditor(m: MilestoneDef) {
    const existing = entries[m.key];
    const { meta, text } = decodeMeta(existing?.caption ?? null);
    setEditing(m);
    setModalStep('edit');
    setMediaUri(null);
    setMediaUrl(existing?.photo_url ?? null);
    setIsVideo(meta.mediaType === 'video');
    setCaption(text);
    setAchievedDate(meta.achievedDate ?? '');
    setCustomLabel(m.isCustom ? (meta.customLabel ?? m.label) : '');
    setCustomEmoji(m.isCustom ? (meta.customEmoji ?? m.emoji) : '⭐');
    setSavedMediaUrl(null);
  }

  function openNewCustom() {
    setEditing({ key: '__new_custom__', label: '', emoji: '⭐', isCustom: true });
    setModalStep('edit');
    setMediaUri(null); setMediaUrl(null); setIsVideo(false);
    setCaption(''); setAchievedDate('');
    setCustomLabel(''); setCustomEmoji('⭐');
    setSavedMediaUrl(null);
  }

  function closeEditor() {
    setEditing(null); setModalStep('edit');
    setMediaUri(null); setMediaUrl(null); setIsVideo(false);
    setCaption(''); setAchievedDate('');
    setCustomLabel(''); setCustomEmoji('⭐');
    setSavedMediaUrl(null);
  }

  // ─── Media picking ───────────────────────────────────────────────────────

  async function pickMedia(type: 'photo' | 'video') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo/video access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'photo'
        ? ImagePicker.MediaTypeOptions.Images
        : ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: type === 'photo',
      aspect: type === 'photo' ? [1, 1] : undefined,
      quality: type === 'photo' ? 0.8 : 1,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      if (type === 'photo') {
        setModerating(true);
        const modResult = await moderateImage(uri);
        setModerating(false);
        if (modResult.blocked) {
          setBlockedContent({ severity: modResult.severity, reason: modResult.reason });
          return;
        }
      }
      setMediaUri(uri);
      setMediaUrl(null);
      setIsVideo(type === 'video');
    }
  }

  // ─── Upload ──────────────────────────────────────────────────────────────

  async function uploadMedia(uri: string, key: string): Promise<string | null> {
    try {
      const res      = await fetch(uri);
      const blob     = await res.blob();
      const mimeType = blob.type || (isVideo ? 'video/mp4' : 'image/jpeg');
      const extRaw   = mimeType.split('/')[1] ?? 'jpg';
      const ext      = extRaw === 'jpeg' ? 'jpg' : extRaw;
      const path     = `${userId}/milestone-${key}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('baby-photos').upload(path, blob, { contentType: mimeType, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
      return data.publicUrl;
    } catch (err: any) {
      console.warn('Milestone upload failed:', err.message);
      return null;
    }
  }

  // ─── Save ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!editing || !userId) return;
    const isNew    = editing.key === '__new_custom__';
    const isCustom = !!editing.isCustom;

    if (isCustom && !customLabel.trim()) {
      Alert.alert('Name required', 'Give this moment a name before saving.');
      return;
    }
    if (!isCustom && !mediaUri && !mediaUrl && !caption.trim() && !achievedDate.trim()) {
      Alert.alert('Add something', 'Please add a photo, video, memory, or date before saving.');
      return;
    }

    const parsedDate = achievedDate.trim() ? parseDate(achievedDate.trim()) : null;
    const meta: Meta = {};
    if (parsedDate) meta.achievedDate = parsedDate;
    if (isVideo && (mediaUri || mediaUrl)) meta.mediaType = 'video';
    if (isCustom) {
      meta.customLabel = customLabel.trim() || 'Memory';
      meta.customEmoji = customEmoji.trim() || '⭐';
    }
    const encodedCaption = encodeMeta(meta, caption.trim());
    const milestoneKey   = isNew ? `custom_${Date.now()}` : editing.key;

    setSaving(true);
    let finalUrl = mediaUrl;
    if (mediaUri) finalUrl = await uploadMedia(mediaUri, milestoneKey);

    const existing = isNew ? null : entries[milestoneKey];
    if (existing) {
      await supabase.from('milestone_photos').update({
        photo_url: finalUrl, caption: encodedCaption || null,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('milestone_photos').insert({
        user_id: userId, milestone_key: milestoneKey,
        photo_url: finalUrl, caption: encodedCaption || null,
      });
    }

    setSaving(false);
    fetchEntries();
    setSavedMediaUrl(finalUrl);
    setModalStep('share');
  }

  async function postToFeed(mediaUrl: string | null) {
    if (!editing || !userId) return;
    const label   = editing.isCustom ? (customLabel || 'Special Moment') : editing.label;
    const emoji   = editing.isCustom ? customEmoji : editing.emoji;
    const content = caption.trim()
      ? `${emoji} ${label}!\n\n${caption.trim()}`
      : `${emoji} ${label}!`;
    await supabase.from('posts').insert({
      user_id: userId, author: authorName, content,
      post_type: 'milestone', likes: 0,
      image_url: isVideo ? null : (mediaUrl ?? null),
      created_at: new Date().toISOString(),
    });
  }

  // ─── Card renderers (plain functions, not components) ────────────────────

  function renderMilestoneCard(m: MilestoneDef, colIdx: number) {
    const entry    = entries[m.key];
    const { meta } = decodeMeta(entry?.caption ?? null);
    const col      = colors[colIdx % colors.length];
    const captured = !!entry;
    const entryIsVideo = meta.mediaType === 'video';
    return (
      <TouchableOpacity
        key={m.key}
        style={[s.card, { backgroundColor: col.bg, borderColor: col.border }]}
        onPress={() => openEditor(m)} activeOpacity={0.82}
      >
        {entry?.photo_url ? (
          entryIsVideo ? (
            <View style={[s.cardPhoto, s.videoThumb]}>
              <Text style={s.videoThumbEmoji}>{m.emoji}</Text>
              <View style={s.videoPlayBadge}><Text style={s.videoPlayIcon}>▶</Text></View>
            </View>
          ) : (
            <Image source={{ uri: entry.photo_url }} style={s.cardPhoto} />
          )
        ) : (
          <View style={[s.cardPlaceholder, { borderColor: col.border }]}>
            <Text style={s.cardPlaceholderEmoji}>{captured ? '📝' : '📷'}</Text>
          </View>
        )}
        <View style={s.cardFooter}>
          <Text style={s.cardEmoji}>{m.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.cardLabel} numberOfLines={1}>{m.label}</Text>
            {meta.achievedDate ? <Text style={s.cardDate}>{fmtDate(meta.achievedDate)}</Text> : null}
          </View>
        </View>
        {captured && <View style={s.doneBadge}><Text style={s.doneBadgeText}>✓</Text></View>}
      </TouchableOpacity>
    );
  }

  function renderCustomCard(entry: MilestoneEntry, colIdx: number) {
    const { meta } = decodeMeta(entry.caption);
    const label    = meta.customLabel ?? 'Memory';
    const emoji    = meta.customEmoji ?? '⭐';
    const col      = colors[colIdx % colors.length];
    const entryIsVideo = meta.mediaType === 'video';
    const m: MilestoneDef = { key: entry.milestone_key, label, emoji, isCustom: true };
    return (
      <TouchableOpacity
        key={entry.milestone_key}
        style={[s.card, { backgroundColor: col.bg, borderColor: col.border }]}
        onPress={() => openEditor(m)} activeOpacity={0.82}
      >
        {entry.photo_url ? (
          entryIsVideo ? (
            <View style={[s.cardPhoto, s.videoThumb]}>
              <Text style={s.videoThumbEmoji}>{emoji}</Text>
              <View style={s.videoPlayBadge}><Text style={s.videoPlayIcon}>▶</Text></View>
            </View>
          ) : (
            <Image source={{ uri: entry.photo_url }} style={s.cardPhoto} />
          )
        ) : (
          <View style={[s.cardPlaceholder, { borderColor: col.border }]}>
            <Text style={{ fontSize: 36 }}>{emoji}</Text>
          </View>
        )}
        <View style={s.cardFooter}>
          <Text style={s.cardEmoji}>{emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.cardLabel} numberOfLines={1}>{label}</Text>
            {meta.achievedDate ? <Text style={s.cardDate}>{fmtDate(meta.achievedDate)}</Text> : null}
          </View>
        </View>
        <View style={s.doneBadge}><Text style={s.doneBadgeText}>✓</Text></View>
      </TouchableOpacity>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const activeMediaUri = mediaUri ?? mediaUrl;

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <View>
          <Text style={s.sectionTitle}>Development Tracker</Text>
          <Text style={s.sectionSubtitle}>Tap a milestone to add a photo, video, or memory</Text>
        </View>
        <View style={s.progressBadge}>
          <Text style={s.progressBadgeText}>{capturedCount}/{ALL_MILESTONES.length}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={c.primary} style={{ marginVertical: 20 }} />
      ) : (
        <>
          {comingNext.length > 0 && (
            <View style={s.comingBox}>
              <Text style={s.comingTitle}>🔜 Coming up for your baby</Text>
              {comingNext.map(m => (
                <TouchableOpacity key={m.key} style={s.comingItem} onPress={() => openEditor(m)} activeOpacity={0.8}>
                  <Text style={s.comingEmoji}>{m.emoji}</Text>
                  <Text style={s.comingLabel}>{m.label}</Text>
                  <Text style={s.comingLog}>+ Log</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {CATEGORIES.map((cat, catIdx) => {
            const captured = cat.milestones.filter(m => entries[m.key]).length;
            return (
              <View key={cat.key} style={s.section}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionEmoji}>{cat.emoji}</Text>
                  <Text style={s.sectionLabel}>{cat.label}</Text>
                  <Text style={s.sectionCount}>{captured}/{cat.milestones.length}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
                  {cat.milestones.map((m, i) => renderMilestoneCard(m, catIdx * 3 + i))}
                </ScrollView>
              </View>
            );
          })}

          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionEmoji}>✨</Text>
              <Text style={s.sectionLabel}>Special Moments</Text>
              <Text style={s.sectionCount}>{customEntries.length} saved</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
              {customEntries.map((entry, i) => renderCustomCard(entry, i + 2))}
              <TouchableOpacity style={[s.card, s.addCard]} onPress={openNewCustom} activeOpacity={0.8}>
                <View style={s.addCardInner}>
                  <Text style={s.addCardPlus}>+</Text>
                  <Text style={s.addCardText}>Add your{'\n'}own</Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </>
      )}

      {/* ── Content moderation blocked modal ──────────────────────────── */}
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

      {/* ── Moderation loading overlay ─────────────────────────────────── */}
      {moderating && (
        <View style={s.moderatingOverlay}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={s.moderatingText}>Checking photo…</Text>
        </View>
      )}

      {/* ── Editor Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={editing !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEditor}
      >
        <SafeAreaView style={s.modalSafe}>
          {modalStep === 'edit' && editing && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <View style={s.modalHeader}>
                <TouchableOpacity onPress={closeEditor} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.modalCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={s.modalTitle} numberOfLines={1}>
                  {editing.isCustom
                    ? (customLabel.trim() || 'Special Moment')
                    : `${editing.emoji} ${editing.label}`}
                </Text>
                <TouchableOpacity
                  onPress={handleSave} disabled={saving}
                  style={[s.modalSaveBtn, saving && s.modalSaveBtnDisabled]}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.modalSaveBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
                {editing.isCustom && (
                  <View style={s.customNameRow}>
                    <TextInput
                      style={s.customEmojiInput}
                      value={customEmoji}
                      onChangeText={setCustomEmoji}
                      placeholder="⭐"
                      placeholderTextColor={c.textMuted}
                      maxLength={2}
                    />
                    <TextInput
                      style={[s.customLabelInput, { flex: 1 }]}
                      value={customLabel}
                      onChangeText={setCustomLabel}
                      placeholder="Name this moment…"
                      placeholderTextColor={c.textMuted}
                    />
                  </View>
                )}

                {/* ── Media area ── */}
                {!activeMediaUri ? (
                  // Empty state — choose photo or video
                  <View style={s.mediaPickerRow}>
                    <TouchableOpacity style={s.mediaPickerBtn} onPress={() => pickMedia('photo')} activeOpacity={0.8}>
                      <Text style={s.mediaPickerIcon}>📷</Text>
                      <Text style={s.mediaPickerLabel}>Photo</Text>
                      <Text style={s.mediaPickerHint}>Optional</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.mediaPickerBtn} onPress={() => pickMedia('video')} activeOpacity={0.8}>
                      <Text style={s.mediaPickerIcon}>🎥</Text>
                      <Text style={s.mediaPickerLabel}>Video</Text>
                      <Text style={s.mediaPickerHint}>Optional</Text>
                    </TouchableOpacity>
                  </View>
                ) : isVideo ? (
                  // Video preview
                  <View style={s.videoPreviewWrap}>
                    <VideoPreview uri={activeMediaUri} style={s.videoPreview} />
                    <View style={s.mediaChangeRow}>
                      <TouchableOpacity style={s.mediaChangeBtn} onPress={() => pickMedia('video')} activeOpacity={0.8}>
                        <Text style={s.mediaChangeBtnText}>🎥  Change video</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.mediaChangeBtn, { borderColor: c.blush }]}
                        onPress={() => { setMediaUri(null); setMediaUrl(null); setIsVideo(false); }}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.mediaChangeBtnText, { color: c.blush }]}>✕  Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  // Photo preview
                  <View>
                    <TouchableOpacity onPress={() => pickMedia('photo')} activeOpacity={0.85} style={s.photoArea}>
                      <Image source={{ uri: activeMediaUri }} style={s.photoPreview} resizeMode="cover" />
                      <View style={s.changePhotoOverlay}>
                        <Text style={s.changePhotoText}>📷  Change photo</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.mediaChangeBtn, { borderColor: c.blush, marginTop: 8 }]}
                      onPress={() => { setMediaUri(null); setMediaUrl(null); }}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.mediaChangeBtnText, { color: c.blush }]}>✕  Remove photo</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={s.fieldLabel}>When did this happen?</Text>
                <TextInput
                  style={s.fieldInput}
                  value={achievedDate}
                  onChangeText={setAchievedDate}
                  placeholder="MM/DD/YYYY  (optional)"
                  placeholderTextColor={c.textMuted}
                  returnKeyType="done"
                />
                {achievedDate.trim() !== '' && !parseDate(achievedDate.trim()) && (
                  <Text style={s.fieldError}>Please use MM/DD/YYYY format</Text>
                )}

                <Text style={s.fieldLabel}>Memory</Text>
                <TextInput
                  style={[s.fieldInput, s.fieldInputMulti]}
                  value={caption}
                  onChangeText={setCaption}
                  placeholder={editing.isCustom
                    ? 'Write about this moment…'
                    : `Add a note about ${editing.label}…`}
                  placeholderTextColor={c.textMuted}
                  multiline
                />
              </ScrollView>
            </KeyboardAvoidingView>
          )}

          {modalStep === 'share' && (
            <View style={s.shareStep}>
              <Text style={s.promptEmoji}>🎉</Text>
              <Text style={s.promptTitle}>Milestone saved!</Text>
              <Text style={s.promptBody}>
                Share your{' '}
                <Text style={{ fontWeight: '800' }}>
                  {editing?.isCustom ? (customLabel || 'special moment') : editing?.label}
                </Text>{' '}
                milestone to your community feed?
              </Text>
              <View style={s.promptBtns}>
                <TouchableOpacity style={s.promptBtnSecondary} onPress={closeEditor} activeOpacity={0.8}>
                  <Text style={s.promptBtnSecondaryText}>Not now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.promptBtnPrimary}
                  onPress={() => { postToFeed(savedMediaUrl); closeEditor(); }}
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
    container:  { marginTop: 24 },
    headerRow:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
    sectionTitle:    { fontSize: 18, fontWeight: '700', color: c.textPrimary },
    sectionSubtitle: { fontSize: 12, color: c.textMuted, fontWeight: '500', marginTop: 2 },
    progressBadge:     { backgroundColor: c.cardSage, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginTop: 2 },
    progressBadgeText: { fontSize: 12, fontWeight: '800', color: c.sage },

    comingBox:   { backgroundColor: c.cardBlue, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1.5, borderColor: c.blue },
    comingTitle: { fontSize: 13, fontWeight: '800', color: c.blue, marginBottom: 10 },
    comingItem:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    comingEmoji: { fontSize: 18, width: 28 },
    comingLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: c.textPrimary },
    comingLog:   { fontSize: 12, fontWeight: '700', color: c.blue },

    section:       { marginBottom: 22 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
    sectionEmoji:  { fontSize: 16 },
    sectionLabel:  { flex: 1, fontSize: 14, fontWeight: '700', color: c.textPrimary },
    sectionCount:  { fontSize: 11, color: c.textMuted, fontWeight: '600' },

    strip: { paddingRight: 8, gap: 10 },
    card:  { width: 120, borderRadius: 16, borderWidth: 2, overflow: 'hidden' },
    cardPhoto:            { width: 120, height: 120 },
    cardPlaceholder:      { width: 120, height: 120, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1.5 },
    cardPlaceholderEmoji: { fontSize: 32, opacity: 0.35 },
    cardFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, padding: 8 },
    cardEmoji:  { fontSize: 14, marginTop: 1 },
    cardLabel:  { fontSize: 11, fontWeight: '700', color: c.textSecondary },
    cardDate:   { fontSize: 9, color: c.textMuted, marginTop: 2 },
    doneBadge:     { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: c.sage, justifyContent: 'center', alignItems: 'center' },
    doneBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

    // Video card thumbnail
    videoThumb:      { backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
    videoThumbEmoji: { fontSize: 32, marginBottom: 6 },
    videoPlayBadge:  { position: 'absolute', bottom: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },
    videoPlayIcon:   { fontSize: 12, color: '#111', marginLeft: 2 },

    addCard:      { borderStyle: 'dashed' as any, borderColor: c.separator, backgroundColor: c.inputBg },
    addCardInner: { width: 120, height: 164, justifyContent: 'center', alignItems: 'center', gap: 4 },
    addCardPlus:  { fontSize: 28, color: c.textMuted, fontWeight: '300' },
    addCardText:  { fontSize: 12, color: c.textMuted, textAlign: 'center', fontWeight: '600' },

    modalSafe:   { flex: 1, backgroundColor: c.bg },
    modalHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    modalCancel:          { fontSize: 15, color: c.textMuted, fontWeight: '600', width: 60 },
    modalTitle:           { fontSize: 17, fontWeight: '800', color: c.textPrimary, flex: 1, textAlign: 'center' },
    modalSaveBtn:         { backgroundColor: c.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 16, width: 60, alignItems: 'center' },
    modalSaveBtnDisabled: { backgroundColor: c.primaryDisabled },
    modalSaveBtnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
    modalBody:            { padding: 16, gap: 12 },

    customNameRow:    { flexDirection: 'row', gap: 10, alignItems: 'center' },
    customEmojiInput: { width: 54, height: 54, backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.inputBorder, textAlign: 'center', fontSize: 26 },
    customLabelInput: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.inputBorder, padding: 14, fontSize: 16, color: c.textPrimary, fontWeight: '600' },

    // Media picker (empty state)
    mediaPickerRow: { flexDirection: 'row', gap: 12 },
    mediaPickerBtn: { flex: 1, backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5, borderColor: c.inputBorder, paddingVertical: 20, alignItems: 'center', gap: 4 },
    mediaPickerIcon:  { fontSize: 32 },
    mediaPickerLabel: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    mediaPickerHint:  { fontSize: 11, color: c.textMuted },

    // Photo preview
    photoArea:          { borderRadius: 16, overflow: 'hidden', backgroundColor: c.card, borderWidth: 2, borderColor: c.cardBorder, borderStyle: 'dashed' },
    photoPreview:       { width: '100%', aspectRatio: 1 },
    changePhotoOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 10, alignItems: 'center' },
    changePhotoText:    { color: '#fff', fontWeight: '700', fontSize: 14 },

    // Video preview
    videoPreviewWrap: { borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: c.inputBorder },
    videoPreview:     { width: '100%', aspectRatio: 16 / 9 },
    mediaChangeRow:   { flexDirection: 'row', gap: 8, marginTop: 8 },
    mediaChangeBtn:   { flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: c.inputBorder, paddingVertical: 10, alignItems: 'center' },
    mediaChangeBtnText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },

    fieldLabel:      { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    fieldInput:      { backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.inputBorder, padding: 14, fontSize: 15, color: c.textPrimary },
    fieldInputMulti: { minHeight: 100, textAlignVertical: 'top' },
    fieldError:      { fontSize: 11, color: c.blush, marginTop: -4 },

    moderatingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', gap: 12, zIndex: 999 },
    moderatingText:    { color: '#fff', fontSize: 15, fontWeight: '700' },

    shareStep:            { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
    promptEmoji:          { fontSize: 48 },
    promptTitle:          { fontSize: 20, fontWeight: '800', color: c.textPrimary, textAlign: 'center' },
    promptBody:           { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
    promptBtns:           { flexDirection: 'row', gap: 10, marginTop: 8, width: '100%' },
    promptBtnSecondary:   { flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: c.bgAlt, alignItems: 'center', borderWidth: 1.5, borderColor: c.cardBorder },
    promptBtnSecondaryText: { fontSize: 14, fontWeight: '700', color: c.textMuted },
    promptBtnPrimary:     { flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: c.primary, alignItems: 'center' },
    promptBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  });
}
