import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import LoadErrorBanner from '../components/LoadErrorBanner';
import { useBaby } from '../lib/babyContext';
import { moderateImage } from '../lib/contentModeration';
import ContentBlockedModal, { ContentType } from '../components/ContentBlockedModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BabyFull {
  id: string;
  name: string;
  birth_date: string | null;
  due_date: string | null;
  is_expecting: boolean;
  gender: string | null;
  birth_weight: number | null;
  birth_length: number | null;
  current_weight: number | null;
  current_height: number | null;
  photo_url: string | null;
  pediatrician_name: string | null;
  pediatrician_phone: string | null;
  weight_updated_at: string | null;
  height_updated_at: string | null;
}

interface Milestone {
  id: string;
  title: string;
  milestone_date: string;
  notes: string | null;
}

const MILESTONE_PRESETS = [
  'First smile', 'First laugh', 'Rolled over', 'Sat up unsupported',
  'First tooth', 'Said "mama" or "dada"', 'Started solids',
  'First crawl', 'Pulled to stand', 'First steps', 'First word', 'First haircut',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageLabel(birthDate: string): string {
  const birth = new Date(birthDate + 'T00:00:00');
  const days = Math.floor((Date.now() - birth.getTime()) / 86400000);
  if (days < 0) return 'Not born yet';
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} old`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} week${weeks !== 1 ? 's' : ''} old`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} month${months !== 1 ? 's' : ''} old`;
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) !== 1 ? 's' : ''} old`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function displayWeight(lbs: number): string {
  const wholeLbs = Math.floor(lbs);
  const oz = Math.round((lbs - wholeLbs) * 16);
  if (oz === 0) return `${wholeLbs} lbs`;
  return `${wholeLbs} lbs ${oz} oz`;
}

function parseDateInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return new Date().toISOString().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const [m, d, y] = parts;
      const year = y.length === 2 ? '20' + y : y.padStart(4, '0');
      const candidate = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      if (!isNaN(Date.parse(candidate))) return candidate;
    }
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}

function autoFormatDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// ─── Photo upload ─────────────────────────────────────────────────────────────

async function uploadPhoto(uri: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/baby-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('baby-photos')
      .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (err: any) {
    console.warn('Photo upload failed:', err.message);
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BabyProfileSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [baby, setBaby] = useState<BabyFull | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editIsExpecting, setEditIsExpecting] = useState(false);
  const [editWeight, setEditWeight] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editBirthWeight, setEditBirthWeight] = useState('');
  const [editBirthLength, setEditBirthLength] = useState('');
  const [editPedName, setEditPedName] = useState('');
  const [editPedPhone, setEditPedPhone] = useState('');
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [moderating, setModerating] = useState(false);
  const [blockedContent, setBlockedContent] = useState<{ severity: 'high' | 'extreme'; reason: string; contentType: ContentType } | null>(null);

  // Milestone form state
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [pendingShareTitle, setPendingShareTitle] = useState('');
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharePosting, setSharePosting] = useState(false);
  const [milestoneDate, setMilestoneDate] = useState('');
  const [milestoneNotes, setMilestoneNotes] = useState('');

  const { activeBabyId, refreshBabies } = useBaby();

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      if (!activeBabyId) { setBaby(null); setMilestones([]); return; }

      const [babyRes, milestonesRes] = await Promise.all([
        supabase
          .from('babies')
          .select('id,name,birth_date,due_date,is_expecting,gender,birth_weight,birth_length,current_weight,current_height,photo_url,pediatrician_name,pediatrician_phone,weight_updated_at,height_updated_at')
          .eq('id', activeBabyId)
          .maybeSingle(),
        supabase
          .from('milestones')
          .select('id,title,milestone_date,notes')
          .eq('baby_id', activeBabyId)
          .order('milestone_date', { ascending: false }),
      ]);

      if (babyRes.data) setBaby(babyRes.data as BabyFull);
      if (milestonesRes.data) setMilestones(milestonesRes.data as Milestone[]);
    } catch (err: any) {
      console.warn('BabyProfileSheet loadData error:', err.message);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [activeBabyId]);

  useEffect(() => {
    if (visible) {
      setEditing(false);
      loadData();
    } else {
      // Reset share-prompt state so stale titles never re-appear on next open
      setShowSharePrompt(false);
      setPendingShareTitle('');
      setShareError(null);
      setSharePosting(false);
    }
  }, [visible, loadData]);

  function startEdit() {
    if (!baby) return;
    setEditName(baby.name);
    setEditGender(baby.gender ?? '');
    setEditIsExpecting(baby.is_expecting);
    if (baby.birth_date) {
      const [y, m, d] = baby.birth_date.split('-');
      setEditBirthDate(`${m}/${d}/${y}`);
    } else {
      setEditBirthDate('');
    }
    if (baby.due_date) {
      const [y, m, d] = baby.due_date.split('-');
      setEditDueDate(`${m}/${d}/${y}`);
    } else {
      setEditDueDate('');
    }
    setEditWeight(baby.current_weight != null ? String(baby.current_weight) : '');
    setEditHeight(baby.current_height != null ? String(baby.current_height) : '');
    setEditBirthWeight(baby.birth_weight != null ? String(baby.birth_weight) : '');
    setEditBirthLength(baby.birth_length != null ? String(baby.birth_length) : '');
    setEditPedName(baby.pediatrician_name ?? '');
    setEditPedPhone(baby.pediatrician_phone ?? '');
    setPendingPhotoUri(null);
    setEditing(true);
  }

  function cancelEdit() {
    setPendingPhotoUri(null);
    setEditing(false);
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to add a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setModerating(true);
    const modResult = await moderateImage(result.assets[0].uri);
    setModerating(false);
    if (modResult.blocked) {
      setBlockedContent({ severity: modResult.severity, reason: modResult.reason, contentType: 'baby_photo' });
      return;
    }
    setPendingPhotoUri(result.assets[0].uri);
  }

  async function saveEdits() {
    if (!baby || !userId) return;
    setSaving(true);
    try {
      let photoUrl = baby.photo_url;
      if (pendingPhotoUri) {
        const uploaded = await uploadPhoto(pendingPhotoUri, userId);
        if (uploaded) photoUrl = uploaded;
        else Alert.alert('Photo upload failed', 'Profile saved without the new photo. Make sure you have a "baby-photos" storage bucket in Supabase.');
      }

      const weight = parseFloat(editWeight) || null;
      const height = parseFloat(editHeight) || null;
      const now = new Date().toISOString();

      const parsedBirthDate = editBirthDate.trim() ? parseDateInput(editBirthDate) : baby.birth_date;
      const parsedDueDate = editDueDate.trim() ? parseDateInput(editDueDate) : baby.due_date;

      const { error } = await supabase.from('babies').update({
        name: editName.trim() || baby.name,
        gender: editGender.trim() || null,
        is_expecting: editIsExpecting,
        birth_date: editIsExpecting ? null : parsedBirthDate,
        due_date: editIsExpecting ? parsedDueDate : null,
        birth_weight: parseFloat(editBirthWeight) || null,
        birth_length: parseFloat(editBirthLength) || null,
        current_weight: weight,
        current_height: height,
        photo_url: photoUrl,
        pediatrician_name: editPedName.trim() || null,
        pediatrician_phone: editPedPhone.trim() || null,
        weight_updated_at: weight !== baby.current_weight && weight != null ? now : baby.weight_updated_at,
        height_updated_at: height !== baby.current_height && height != null ? now : baby.height_updated_at,
      }).eq('id', baby.id);

      if (error) throw error;
      await loadData();
      await refreshBabies();
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function shareToFeed(title: string): Promise<string | null> {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return authErr?.message ?? 'Not signed in';
    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', user.id)
      .maybeSingle();
    const author = profileData?.username ?? profileData?.display_name ?? user.email?.split('@')[0] ?? 'Someone';
    const babyName = baby?.name ?? 'Baby';
    const { error } = await supabase.from('posts').insert({
      user_id: user.id,
      author,
      content: `🎉 ${babyName} just reached a milestone: ${title}!`,
      post_type: 'milestone',
      likes: 0,
      created_at: new Date().toISOString(),
    });
    return error?.message ?? null;
  }

  async function addMilestone() {
    if (!milestoneTitle.trim() || !userId || !baby) return;
    const title = milestoneTitle.trim();
    const { error } = await supabase.from('milestones').insert({
      user_id: userId,
      baby_id: baby.id,
      title,
      milestone_date: parseDateInput(milestoneDate),
      notes: milestoneNotes.trim() || null,
    });
    if (error) { Alert.alert('Error', error.message); return; }
    setMilestoneTitle('');
    setMilestoneDate('');
    setMilestoneNotes('');
    setShowMilestoneForm(false);
    await loadData();
    setPendingShareTitle(title);
    setShowSharePrompt(true);
  }

  function handleDeleteMilestone(id: string) {
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this milestone?')) doDeleteMilestone(id);
      return;
    }
    Alert.alert('Delete Milestone', 'Delete this milestone?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => doDeleteMilestone(id) },
    ]);
  }

  async function doDeleteMilestone(id: string) {
    await supabase.from('milestones').delete().eq('id', id);
    setMilestones(prev => prev.filter(m => m.id !== id));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const photoSource = pendingPhotoUri
    ? { uri: pendingPhotoUri }
    : baby?.photo_url
    ? { uri: baby.photo_url }
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={editing ? cancelEdit : onClose}
    >
      <SafeAreaView style={s.safe}>

        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={editing ? cancelEdit : onClose} style={s.topBarBtn}>
            <Text style={s.topBarBtnText}>{editing ? 'Cancel' : '✕'}</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle}>Baby Profile</Text>
          {loadError ? <LoadErrorBanner message="Couldn't load baby profile." onRetry={loadData} /> : null}
          {!loading && baby ? (
            <TouchableOpacity
              style={s.topBarBtn}
              onPress={editing ? saveEdits : startEdit}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={c.primary} />
                : <Text style={[s.topBarBtnText, s.editBtnText]}>{editing ? 'Save' : 'Edit'}</Text>
              }
            </TouchableOpacity>
          ) : (
            <View style={s.topBarBtn} />
          )}
        </View>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={c.primary} />
          </View>
        ) : !baby ? (
          <View style={s.center}>
            <Text style={s.emptyText}>No baby profile found.{'\n'}Add one in the Profile tab.</Text>
          </View>
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              style={s.scroll}
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >

              {/* ── Hero ── */}
              <View style={s.hero}>
                <TouchableOpacity
                  style={s.photoCircle}
                  onPress={editing ? pickPhoto : undefined}
                  activeOpacity={editing ? 0.7 : 1}
                >
                  {photoSource ? (
                    <Image source={photoSource} style={s.photoImage} />
                  ) : (
                    <Text style={s.photoInitial}>
                      {baby.name?.charAt(0).toUpperCase() ?? '?'}
                    </Text>
                  )}
                  {editing && (
                    <View style={s.photoBadge}>
                      <Text style={s.photoBadgeText}>📷</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {editing ? (
                  <TextInput
                    style={s.nameInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Baby's name"
                    autoCapitalize="words"
                    placeholderTextColor={c.textMuted}
                  />
                ) : (
                  <Text style={s.heroName}>{baby.name}</Text>
                )}

                {!editing && !baby.is_expecting && baby.birth_date && (
                  <Text style={s.heroAge}>{ageLabel(baby.birth_date)}</Text>
                )}
                {!editing && baby.is_expecting && (
                  <Text style={s.heroAge}>
                    {baby.due_date ? `Due ${formatDate(baby.due_date)} 🤰` : 'Due soon 🤰'}
                  </Text>
                )}
              </View>

              {/* ── Basic Info ── */}
              <Text style={s.sectionLabel}>Basic Info</Text>
              <View style={s.card}>
                {editing ? (
                  <>
                    <View style={s.row}>
                      <Text style={s.rowLabel}>Expecting</Text>
                      <TouchableOpacity
                        style={[s.togglePill, editIsExpecting && s.togglePillOn]}
                        onPress={() => setEditIsExpecting(v => !v)}
                      >
                        <Text style={[s.togglePillText, editIsExpecting && s.togglePillTextOn]}>
                          {editIsExpecting ? 'Yes' : 'No'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {!editIsExpecting ? (
                      <View style={s.row}>
                        <Text style={s.rowLabel}>Birthday</Text>
                        <TextInput
                          style={s.inlineInput}
                          value={editBirthDate}
                          onChangeText={t => setEditBirthDate(autoFormatDate(t))}
                          placeholder="MM/DD/YYYY"
                          keyboardType="numeric"
                          maxLength={10}
                          placeholderTextColor={c.textMuted}
                        />
                      </View>
                    ) : (
                      <View style={s.row}>
                        <Text style={s.rowLabel}>Due date</Text>
                        <TextInput
                          style={s.inlineInput}
                          value={editDueDate}
                          onChangeText={t => setEditDueDate(autoFormatDate(t))}
                          placeholder="MM/DD/YYYY"
                          keyboardType="numeric"
                          maxLength={10}
                          placeholderTextColor={c.textMuted}
                        />
                      </View>
                    )}
                    <View style={[s.row, s.rowLast]}>
                      <Text style={s.rowLabel}>Gender</Text>
                      <View style={s.genderRow}>
                        {['Girl', 'Boy', 'Other'].map(g => (
                          <TouchableOpacity
                            key={g}
                            style={[s.genderChip, editGender === g && s.genderChipActive]}
                            onPress={() => setEditGender(g)}
                          >
                            <Text style={[s.genderChipText, editGender === g && s.genderChipTextActive]}>{g}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    {baby.is_expecting ? (
                      <Row label="Due date" value={baby.due_date ? formatDate(baby.due_date) : '–'} styles={s} />
                    ) : (
                      <Row label="Birthday" value={baby.birth_date ? formatDate(baby.birth_date) : '–'} styles={s} />
                    )}
                    <Row label="Gender" value={baby.gender ?? '–'} last styles={s} />
                  </>
                )}
              </View>

              {/* ── Measurements ── */}
              <Text style={s.sectionLabel}>Measurements</Text>
              <View style={s.card}>
                {editing ? (
                  <>
                    <View style={s.row}>
                      <Text style={s.rowLabel}>Weight (lbs)</Text>
                      <TextInput style={s.inlineInput} value={editWeight} onChangeText={setEditWeight}
                        placeholder="e.g. 12.5" keyboardType="decimal-pad" placeholderTextColor={c.textMuted} />
                    </View>
                    <View style={[s.row, s.rowLast]}>
                      <Text style={s.rowLabel}>Height (in)</Text>
                      <TextInput style={s.inlineInput} value={editHeight} onChangeText={setEditHeight}
                        placeholder="e.g. 24" keyboardType="decimal-pad" placeholderTextColor={c.textMuted} />
                    </View>
                  </>
                ) : (
                  <>
                    <View style={s.row}>
                      <Text style={s.rowLabel}>Weight</Text>
                      <View style={s.rowValueGroup}>
                        <Text style={s.rowValue}>
                          {baby.current_weight != null ? displayWeight(baby.current_weight) : '–'}
                        </Text>
                        {baby.weight_updated_at != null && (
                          <Text style={s.rowSub}>· {timeAgoLabel(baby.weight_updated_at)}</Text>
                        )}
                      </View>
                    </View>
                    <View style={[s.row, s.rowLast]}>
                      <Text style={s.rowLabel}>Height</Text>
                      <View style={s.rowValueGroup}>
                        <Text style={s.rowValue}>
                          {baby.current_height != null ? `${baby.current_height} in` : '–'}
                        </Text>
                        {baby.height_updated_at != null && (
                          <Text style={s.rowSub}>· {timeAgoLabel(baby.height_updated_at)}</Text>
                        )}
                      </View>
                    </View>
                  </>
                )}
              </View>

              {/* ── Birth Stats ── */}
              {!baby.is_expecting && (
                <>
                  <Text style={s.sectionLabel}>Birth Stats</Text>
                  <View style={s.card}>
                    {editing ? (
                      <>
                        <View style={s.row}>
                          <Text style={s.rowLabel}>Birth weight (lbs)</Text>
                          <TextInput style={s.inlineInput} value={editBirthWeight}
                            onChangeText={setEditBirthWeight} placeholder="e.g. 7.25"
                            keyboardType="decimal-pad" placeholderTextColor={c.textMuted} />
                        </View>
                        <View style={[s.row, s.rowLast]}>
                          <Text style={s.rowLabel}>Birth length (in)</Text>
                          <TextInput style={s.inlineInput} value={editBirthLength}
                            onChangeText={setEditBirthLength} placeholder="e.g. 20.5"
                            keyboardType="decimal-pad" placeholderTextColor={c.textMuted} />
                        </View>
                      </>
                    ) : (
                      <>
                        <Row label="Birth weight"
                          value={baby.birth_weight != null ? displayWeight(baby.birth_weight) : '–'} styles={s} />
                        <Row label="Birth length"
                          value={baby.birth_length != null ? `${baby.birth_length} in` : '–'} last styles={s} />
                      </>
                    )}
                  </View>
                </>
              )}

              {/* ── Pediatrician ── */}
              <Text style={s.sectionLabel}>Pediatrician</Text>
              <View style={s.card}>
                {editing ? (
                  <>
                    <View style={s.row}>
                      <Text style={s.rowLabel}>Name</Text>
                      <TextInput style={s.inlineInput} value={editPedName} onChangeText={setEditPedName}
                        placeholder="Dr. Smith" autoCapitalize="words" placeholderTextColor={c.textMuted} />
                    </View>
                    <View style={[s.row, s.rowLast]}>
                      <Text style={s.rowLabel}>Phone</Text>
                      <TextInput style={s.inlineInput} value={editPedPhone} onChangeText={setEditPedPhone}
                        placeholder="(555) 123-4567" keyboardType="phone-pad" placeholderTextColor={c.textMuted} />
                    </View>
                  </>
                ) : (
                  <>
                    <Row label="Name" value={baby.pediatrician_name ?? '–'} styles={s} />
                    <Row label="Phone" value={baby.pediatrician_phone ?? '–'} last styles={s} />
                  </>
                )}
              </View>

              {/* ── Milestones ── */}
              <View style={s.milestonesHeader}>
                <Text style={[s.sectionLabel, { marginTop: 0, marginBottom: 0 }]}>Milestones</Text>
                {!editing && (
                  <TouchableOpacity
                    style={s.addBtn}
                    onPress={() => setShowMilestoneForm(v => !v)}
                  >
                    <Text style={s.addBtnText}>{showMilestoneForm ? 'Cancel' : '+ Add'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {showMilestoneForm && (
                <View style={s.milestoneForm}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.presetRow}>
                    {MILESTONE_PRESETS.map(p => (
                      <TouchableOpacity
                        key={p}
                        style={[s.presetChip, milestoneTitle === p && s.presetChipActive]}
                        onPress={() => setMilestoneTitle(prev => prev === p ? '' : p)}
                      >
                        <Text style={[s.presetChipText, milestoneTitle === p && s.presetChipTextActive]}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TextInput style={s.formInput} value={milestoneTitle} onChangeText={setMilestoneTitle}
                    placeholder="Milestone name" placeholderTextColor={c.textMuted} />
                  <TextInput style={s.formInput} value={milestoneDate}
                    onChangeText={(t) => setMilestoneDate(autoFormatDate(t))}
                    placeholder="Date: MM/DD/YYYY (blank = today)" keyboardType="numeric"
                    placeholderTextColor={c.textMuted} maxLength={10} />
                  <TextInput style={s.formInput} value={milestoneNotes} onChangeText={setMilestoneNotes}
                    placeholder="Notes (optional)" placeholderTextColor={c.textMuted} />
                  <TouchableOpacity
                    style={[s.saveBtn, !milestoneTitle.trim() && s.saveBtnDisabled]}
                    onPress={addMilestone}
                    disabled={!milestoneTitle.trim()}
                  >
                    <Text style={s.saveBtnText}>Save Milestone</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={s.card}>
                {milestones.length === 0 ? (
                  <Text style={s.emptyMilestone}>No milestones yet — tap + Add to log one!</Text>
                ) : (
                  milestones.map((m, i) => (
                    <View
                      key={m.id}
                      style={[s.milestoneRow, i === milestones.length - 1 && s.rowLast]}
                    >
                      <Text style={s.milestoneEmoji}>🎉</Text>
                      <View style={s.milestoneInfo}>
                        <Text style={s.milestoneTitle}>{m.title}</Text>
                        {m.notes ? <Text style={s.milestoneNotes}>{m.notes}</Text> : null}
                      </View>
                      <Text style={s.milestoneDate}>{formatDateShort(m.milestone_date)}</Text>
                      <TouchableOpacity onPress={() => handleDeleteMilestone(m.id)} style={s.deleteBtn}>
                        <Text style={s.deleteBtnText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              <View style={{ height: 48 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* ── Share milestone prompt ─────────────────────────────────── */}
        {showSharePrompt && (
          <View style={s.promptOverlay}>
            <View style={s.promptCard}>
              <Text style={s.promptEmoji}>🎉</Text>
              <Text style={s.promptTitle}>Milestone logged!</Text>
              <Text style={s.promptBody}>
                Post "{pendingShareTitle}" to your profile?
              </Text>
              {shareError && (
                <Text style={s.promptError}>{shareError}</Text>
              )}
              <TouchableOpacity
                style={[s.promptShareBtn, sharePosting && { opacity: 0.6 }]}
                disabled={sharePosting}
                onPress={async () => {
                  setShareError(null);
                  setSharePosting(true);
                  const err = await shareToFeed(pendingShareTitle);
                  setSharePosting(false);
                  if (err) {
                    setShareError(err);
                  } else {
                    setShowSharePrompt(false);
                  }
                }}
              >
                {sharePosting
                  ? <ActivityIndicator color={c.primaryText} />
                  : <Text style={s.promptShareBtnText}>Post to your profile</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={s.promptSkipBtn}
                onPress={() => { setShowSharePrompt(false); setShareError(null); }}
              >
                <Text style={s.promptSkipBtnText}>Not Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {blockedContent && userId && (
          <ContentBlockedModal
            visible={!!blockedContent}
            severity={blockedContent.severity}
            reason={blockedContent.reason}
            contentType={blockedContent.contentType}
            userId={userId}
            onClose={() => setBlockedContent(null)}
          />
        )}

        {moderating && (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center',
          }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', gap: 12 }}>
              <ActivityIndicator size="large" />
              <Text style={{ fontSize: 14, fontWeight: '600' }}>Scanning content…</Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Row helper ───────────────────────────────────────────────────────────────

function Row({ label, value, last, styles }: { label: string; value: string; last?: boolean; styles: any }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.bg,
    },

    // ── Top bar
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      backgroundColor: c.bg,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    topBarBtn: {
      width: 64,
      alignItems: 'flex-start',
    },
    topBarBtnText: {
      fontSize: 16,
      color: c.textMuted,
      fontWeight: '500',
    },
    topBarTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: c.textSecondary,
    },
    editBtnText: {
      color: c.primary,
      fontWeight: '700',
      textAlign: 'right',
    },

    // ── States
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyText: {
      fontSize: 15,
      color: c.textMuted,
      textAlign: 'center',
      lineHeight: 22,
    },

    // ── Scroll
    scroll: { flex: 1 },
    scrollContent: { padding: 20 },

    // ── Hero
    hero: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    photoCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: c.avatarBg,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
      overflow: 'hidden',
    },
    photoImage: {
      width: 96,
      height: 96,
      borderRadius: 48,
    },
    photoInitial: {
      fontSize: 36,
      fontWeight: '800',
      color: c.primary,
    },
    photoBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    photoBadgeText: {
      fontSize: 14,
    },
    heroName: {
      fontSize: 26,
      fontWeight: '800',
      color: c.textPrimary,
      marginBottom: 4,
    },
    heroAge: {
      fontSize: 15,
      color: c.textMuted,
      fontWeight: '500',
    },
    nameInput: {
      fontSize: 22,
      fontWeight: '800',
      color: c.textPrimary,
      textAlign: 'center',
      borderBottomWidth: 2,
      borderBottomColor: c.primary,
      paddingVertical: 4,
      paddingHorizontal: 12,
      marginBottom: 4,
      minWidth: 160,
    },

    // ── Section labels
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 20,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    sectionLabelInline: {
      marginTop: 0,
      marginBottom: 0,
    },

    // ── Card
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },

    // ── Row
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.inputBg,
      minHeight: 52,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowLabel: {
      fontSize: 14,
      color: c.textMuted,
      width: 120,
      fontWeight: '500',
      flexShrink: 0,
    },
    rowValue: {
      flex: 1,
      fontSize: 14,
      color: c.textPrimary,
      fontWeight: '600',
      textAlign: 'right',
    },
    rowValueGroup: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 6,
    },
    rowSub: {
      fontSize: 12,
      color: c.textMuted,
    },
    inlineInput: {
      flex: 1,
      fontSize: 14,
      color: c.textPrimary,
      fontWeight: '600',
      textAlign: 'right',
      padding: 0,
    },

    // ── Toggle pill (is_expecting)
    togglePill: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: c.cardHoney,
    },
    togglePillOn: {
      backgroundColor: c.primary,
    },
    togglePillText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
    },
    togglePillTextOn: {
      color: c.primaryText,
    },

    // ── Gender picker
    genderRow: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 6,
    },
    genderChip: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: c.cardHoney,
    },
    genderChipActive: {
      backgroundColor: c.primary,
    },
    genderChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textMuted,
    },
    genderChipTextActive: {
      color: c.primaryText,
    },

    // ── Milestones header
    milestonesHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 20,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    addBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 14,
    },
    addBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.primaryText,
    },

    // ── Milestone form
    milestoneForm: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    presetRow: {
      marginBottom: 10,
    },
    presetChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: c.cardHoney,
      marginRight: 8,
    },
    presetChipActive: {
      backgroundColor: c.primary,
    },
    presetChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textMuted,
    },
    presetChipTextActive: {
      color: c.primaryText,
    },
    formInput: {
      backgroundColor: c.inputBg,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: c.textPrimary,
      marginBottom: 8,
    },
    saveBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    saveBtnDisabled: {
      backgroundColor: c.primaryDisabled,
    },
    saveBtnText: {
      color: c.primaryText,
      fontWeight: '700',
      fontSize: 14,
    },

    // ── Milestone rows
    milestoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.inputBg,
      gap: 10,
    },
    milestoneEmoji: {
      fontSize: 18,
    },
    milestoneInfo: {
      flex: 1,
    },
    milestoneTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textPrimary,
    },
    milestoneNotes: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 1,
    },
    milestoneDate: {
      fontSize: 12,
      color: c.textMuted,
      fontWeight: '500',
      flexShrink: 0,
    },
    deleteBtn: {
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    deleteBtnText: {
      fontSize: 18,
      color: c.textMuted,
      fontWeight: '600',
    },
    emptyMilestone: {
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: 20,
      paddingHorizontal: 16,
    },

    // ── Share milestone prompt
    promptOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.bg === '#FEFCF8' ? 'rgba(60,50,45,0.5)' : 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
      zIndex: 100,
    },
    promptCard: {
      backgroundColor: c.bg,
      borderRadius: 20,
      padding: 28,
      alignItems: 'center',
      width: '100%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 10,
    },
    promptEmoji: {
      fontSize: 40,
      marginBottom: 12,
    },
    promptTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: c.textPrimary,
      marginBottom: 8,
    },
    promptBody: {
      fontSize: 14,
      color: c.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    promptError: {
      fontSize: 13,
      color: '#DC2626',
      textAlign: 'center',
      marginBottom: 12,
      lineHeight: 18,
    },
    promptShareBtn: {
      backgroundColor: c.blush,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 28,
      width: '100%',
      alignItems: 'center',
      marginBottom: 10,
    },
    promptShareBtnText: {
      color: c.primaryText,
      fontWeight: '700',
      fontSize: 15,
    },
    promptSkipBtn: {
      paddingVertical: 10,
    },
    promptSkipBtnText: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '600',
    },
  });
}
