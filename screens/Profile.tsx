import React, { useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Switch,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { AppContext } from '../lib/AppContext';
import { VILLAGE_MAP } from '../lib/villageData';
import BabyProfileSheet from './BabyProfileSheet';
import BabyJournal from './BabyJournal';
import SettingsScreen from './SettingsScreen';
import { useColors, Colors } from '../lib/theme';
import { hitSlopFor } from '../lib/accessibility';
import LoadErrorBanner from '../components/LoadErrorBanner';
import { useSubscription } from '../lib/subscriptionContext';
import PaywallGate from '../components/PaywallGate';
import { moderateImage } from '../lib/contentModeration';
import ContentBlockedModal, { ContentType } from '../components/ContentBlockedModal';
import { PARENT_TERM_OPTIONS, CUSTOM_TERM_ID, FAMILY_STRUCTURE_OPTIONS } from '../lib/inclusiveLanguage';

// ─── Types ────────────────────────────────────────────────────────────────────

// Run once in Supabase SQL editor:
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_villages boolean DEFAULT true;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS header_url text;

interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  header_url: string | null;
  parent_role: string | null;
  preferred_term: string | null;
  family_structure: string | null;
  family_structure_custom: string | null;
  show_villages: boolean | null;
  baby_info_private: boolean | null;
  pinned_post_id: string | null;
  is_private: boolean | null;
}

interface FollowRequest {
  id: string;
  requester_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface Baby {
  id: string;
  name: string;
  birth_date: string | null;
  due_date: string | null;
  is_expecting: boolean;
  photo_url: string | null;
  gender: string | null;
}

interface Post {
  id: string;
  content: string;
  post_type: 'text' | 'milestone' | 'question';
  created_at: string;
  likes: number;
  image_url?: string | null;
}

const PARENT_ROLES = ['Mom', 'Dad', 'Grandparent', 'Caregiver', 'Other'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatDateShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ageLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000);
  if (days < 0) return 'Not born yet';
  if (days < 7) return `${days}d old`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w old`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months}mo old`;
  return `${Math.floor(months / 12)}yr old`;
}

function getTimeAgo(dateString: string): string {
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(dateString) ? dateString : dateString + 'Z';
  const seconds = Math.floor((Date.now() - new Date(normalized).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

async function uploadAvatar(uri: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('baby-photos')
      .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (err: any) {
    console.warn('Avatar upload failed:', err.message);
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Profile() {
  const c = useColors();
  const navigation = useNavigation<any>();
  const { requestTour } = useContext(AppContext);
  const s = useMemo(() => makeStyles(c), [c]);
  const { isSubscribed, openPaywall } = useSubscription();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userCreatedAt, setUserCreatedAt] = useState('');
  const [baby, setBaby] = useState<Baby | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [myVillageIds, setMyVillageIds] = useState<string[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<'posts' | 'saved' | 'journal'>('posts');
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // Edit state
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editParentRole, setEditParentRole] = useState('');
  const [editPreferredTerm, setEditPreferredTerm] = useState('');
  const [editCustomTerm, setEditCustomTerm] = useState('');
  const [editFamilyStructure, setEditFamilyStructure] = useState('');
  const [editFamilyStructureCustom, setEditFamilyStructureCustom] = useState('');
  const [editShowVillages, setEditShowVillages] = useState(true);
  const [editBabyInfoPrivate, setEditBabyInfoPrivate] = useState(false);
  const [pendingAvatarUri, setPendingAvatarUri] = useState<string | null>(null);
  const [pendingHeaderUri, setPendingHeaderUri] = useState<string | null>(null);
  const [moderating, setModerating] = useState(false);
  const [blockedContent, setBlockedContent] = useState<{ severity: 'high' | 'extreme'; reason: string; contentType: ContentType } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState('');
  const [saveError, setSaveError] = useState('');

  const loadAll = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      setUserEmail(user.email ?? '');
      setUserCreatedAt(user.created_at ?? '');

      const [profileRes, babyRes, postsRes, villagesRes, followersRes, followingRes, savedRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('babies').select('id,name,birth_date,due_date,is_expecting,photo_url,gender').eq('user_id', user.id).limit(1).maybeSingle(),
        supabase.from('posts').select('id,content,post_type,created_at,likes,image_url').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('user_villages').select('village_id').eq('user_id', user.id),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', user.id),
        supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', user.id),
        supabase.from('saved_posts').select('post_id, posts(id,content,post_type,created_at,likes,image_url,author)').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);

      setProfile(profileRes.data ?? null);
      setBaby(babyRes.data ?? null);
      setPosts(postsRes.data ?? []);
      setSavedPosts((savedRes.data ?? []).map((r: any) => r.posts).filter(Boolean));
      setMyVillageIds((villagesRes.data ?? []).map((r: any) => r.village_id));
      setFollowerCount(followersRes.count ?? 0);
      setFollowingCount(followingRes.count ?? 0);

      // Load incoming follow requests if account is private
      if (profileRes.data?.is_private) {
        const { data: reqData } = await (supabase as any)
          .from('follow_requests')
          .select('id, requester_id, created_at')
          .eq('target_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: true });
        if (reqData && reqData.length > 0) {
          const requesterIds = reqData.map((r: any) => r.requester_id);
          const { data: reqProfiles } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', requesterIds);
          const profileMap: Record<string, any> = {};
          (reqProfiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });
          setFollowRequests(reqData.map((r: any) => ({
            id: r.id,
            requester_id: r.requester_id,
            created_at: r.created_at,
            ...profileMap[r.requester_id],
          })));
        } else {
          setFollowRequests([]);
        }
      } else {
        setFollowRequests([]);
      }
    } catch (err: any) {
      console.warn('Profile loadAll error:', err.message);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  function startEdit() {
    setEditUsername(profile?.username ?? '');
    setEditDisplayName(profile?.display_name ?? '');
    setEditBio(profile?.bio ?? '');
    setEditParentRole(profile?.parent_role ?? '');
    const savedTerm = profile?.preferred_term ?? '';
    const knownTerm = PARENT_TERM_OPTIONS.some(o => o.id === savedTerm);
    if (savedTerm && !knownTerm) {
      setEditPreferredTerm(CUSTOM_TERM_ID);
      setEditCustomTerm(savedTerm);
    } else {
      setEditPreferredTerm(savedTerm);
      setEditCustomTerm('');
    }
    setEditFamilyStructure(profile?.family_structure ?? '');
    setEditFamilyStructureCustom(profile?.family_structure_custom ?? '');
    setEditShowVillages(profile?.show_villages !== false);
    setEditBabyInfoPrivate(profile?.baby_info_private === true);
    setPendingAvatarUri(null);
    setUsernameError('');
    setSaveError('');
    setEditing(true);
  }

  function cancelEdit() {
    setPendingAvatarUri(null);
    setPendingHeaderUri(null);
    setUsernameError('');
    setSaveError('');
    setEditing(false);
  }

  async function handleFollowRequest(requestId: string, requesterId: string, accept: boolean) {
    setProcessingRequestId(requestId);
    if (accept) {
      await (supabase as any).from('follow_requests').update({ status: 'accepted' }).eq('id', requestId);
      await (supabase as any).from('follows').insert({ follower_id: requesterId, following_id: currentUserId });
      setFollowerCount(c => c + 1);
    } else {
      await (supabase as any).from('follow_requests').update({ status: 'rejected' }).eq('id', requestId);
    }
    setFollowRequests(prev => prev.filter(r => r.id !== requestId));
    setProcessingRequestId(null);
  }

  async function pickHeader() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to add a header photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setModerating(true);
    const modResult = await moderateImage(result.assets[0].uri);
    setModerating(false);
    if (modResult.blocked) {
      setBlockedContent({ severity: modResult.severity, reason: modResult.reason, contentType: 'profile_avatar' });
      return;
    }
    setPendingHeaderUri(result.assets[0].uri);
  }

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to add a profile photo.');
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
      setBlockedContent({ severity: modResult.severity, reason: modResult.reason, contentType: 'profile_avatar' });
      return;
    }
    setPendingAvatarUri(result.assets[0].uri);
  }

  async function saveProfile() {
    setUsernameError('');
    setSaveError('');
    setSaving(true);
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) { setSaveError('Not signed in — please restart the app.'); return; }

      const trimmedUsername = editUsername.trim().toLowerCase();
      if (trimmedUsername) {
        if (!/^[a-z0-9_]{3,20}$/.test(trimmedUsername)) {
          setUsernameError('3–20 chars, letters / numbers / underscores only');
          return;
        }
        if (trimmedUsername !== profile?.username) {
          const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', trimmedUsername)
            .maybeSingle();
          if (existing) { setUsernameError('That username is already taken'); return; }
        }
      }

      let avatarUrl = profile?.avatar_url ?? null;
      if (pendingAvatarUri) {
        const uploaded = await uploadAvatar(pendingAvatarUri, user.id);
        if (uploaded) avatarUrl = uploaded;
      }

      let headerUrl = profile?.header_url ?? null;
      if (pendingHeaderUri) {
        const uploaded = await uploadAvatar(pendingHeaderUri, user.id);
        if (uploaded) headerUrl = uploaded;
      }

      const payload = {
        username: trimmedUsername || null,
        display_name: editDisplayName.trim() || null,
        bio: editBio.trim() || null,
        avatar_url: avatarUrl,
        header_url: headerUrl,
        parent_role: editParentRole || null,
        preferred_term: (editPreferredTerm === CUSTOM_TERM_ID ? editCustomTerm.trim() : editPreferredTerm) || null,
        family_structure: editFamilyStructure || null,
        family_structure_custom: editFamilyStructure === 'Other' ? (editFamilyStructureCustom.trim() || null) : null,
        show_villages: editShowVillages,
        baby_info_private: editBabyInfoPrivate,
      };

      // Try UPDATE first; if no rows matched, INSERT (handles first-time profile creation)
      const { data: updated, error: updateErr } = await supabase
        .from('profiles')
        .update(payload as any)
        .eq('id', user.id)
        .select('id');

      if (updateErr) throw updateErr;

      if (!updated || updated.length === 0) {
        const { error: insertErr } = await supabase
          .from('profiles')
          .insert({ id: user.id, ...payload } as any);
        if (insertErr) throw insertErr;
      }

      await loadAll();
      setEditing(false);
      setPendingAvatarUri(null);
      setPendingHeaderUri(null);
    } catch (err: any) {
      console.warn('saveProfile error:', err.message);
      setSaveError(err.message || 'Save failed — check your Supabase RLS policies.');
    } finally {
      setSaving(false);
    }
  }

  async function deletePost(postId: string) {
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (!error) setPosts(prev => prev.filter(p => p.id !== postId));
  }

  function confirmDeletePost(postId: string) {
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this post?')) deletePost(postId);
      return;
    }
    Alert.alert('Delete Post', 'Delete this post? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePost(postId) },
    ]);
  }

  async function togglePin(postId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const newPinnedId = profile?.pinned_post_id === postId ? null : postId;
    await supabase.from('profiles').update({ pinned_post_id: newPinnedId } as any).eq('id', user.id);
    setProfile(prev => prev ? { ...prev, pinned_post_id: newPinnedId } : prev);
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) Alert.alert('Error', error.message);
      }},
    ]);
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const sortedPosts = useMemo(() => {
    const pinnedId = profile?.pinned_post_id;
    if (!pinnedId) return posts;
    const pinned = posts.find(p => p.id === pinnedId);
    const rest = posts.filter(p => p.id !== pinnedId);
    return pinned ? [pinned, ...rest] : posts;
  }, [posts, profile?.pinned_post_id]);

  const avatarSource = pendingAvatarUri
    ? { uri: pendingAvatarUri }
    : profile?.avatar_url
    ? { uri: profile.avatar_url }
    : null;

  const headerDisplayUri = pendingHeaderUri || profile?.header_url || null;

  const displayName = profile?.display_name || profile?.username || userEmail.split('@')[0] || 'Your Name';
  const isAdmin = (profile as any)?.is_founder === true;
  const isOfficial = (profile as any)?.is_official === true;
  const isGoldTier = isAdmin || isOfficial;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.center}>
          <ActivityIndicator size="large" color="#B8A9C9" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea}>
      {loadError && <LoadErrorBanner message="Couldn't load your profile." onRetry={loadAll} />}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Top bar ── */}
        <View style={s.topBar}>
          <Text style={s.heading}>Profile</Text>
          {editing ? (
            <View style={s.topBarActions}>
              <TouchableOpacity onPress={cancelEdit} style={s.topBarCancelBtn}
                accessibilityRole="button" accessibilityLabel="Cancel edit">
                <Text style={s.topBarCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveProfile} style={s.topBarSaveBtn} disabled={saving}
                accessibilityRole="button" accessibilityLabel="Save profile">
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.topBarSaveText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity onPress={startEdit} style={s.editProfileBtn}
                accessibilityRole="button" accessibilityLabel="Edit profile">
                <Text style={s.editProfileBtnText}>Edit Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowSettings(true)} style={s.settingsBtn} activeOpacity={0.75}
                hitSlop={hitSlopFor(36)}
                accessibilityRole="button" accessibilityLabel="Open settings">
                <Text style={{ fontSize: 20 }}>⚙️</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Hero ── */}
        <View style={[s.hero, isGoldTier && s.heroAdmin]}>

          {/* Header banner */}
          <View style={s.headerBannerWrap}>
            {headerDisplayUri ? (
              <Image source={{ uri: headerDisplayUri }} style={s.headerBannerImage} resizeMode="cover" />
            ) : (
              <View style={[s.headerBannerPlaceholder, isGoldTier && s.headerBannerPlaceholderAdmin]} />
            )}
            {editing && (
              <TouchableOpacity style={s.headerBannerEditBtn} onPress={pickHeader} activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel={headerDisplayUri ? 'Change header photo' : 'Add header photo'}>
                <Text style={s.headerBannerEditText}>📷  {headerDisplayUri ? 'Change header' : 'Add header photo'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Avatar overlapping header */}
          <View style={s.avatarOverlapRow}>
            <TouchableOpacity
              style={[s.avatarWrap, isGoldTier && s.avatarWrapAdmin]}
              onPress={editing ? pickAvatar : undefined}
              activeOpacity={editing ? 0.75 : 1}
              accessibilityRole={editing ? 'button' : undefined}
              accessibilityLabel={editing ? 'Change profile photo' : undefined}
            >
              {avatarSource ? (
                <Image source={avatarSource} style={s.avatarImage} />
              ) : (
                <Text style={s.avatarInitial}>
                  {(profile?.display_name || userEmail).charAt(0).toUpperCase() || '?'}
                </Text>
              )}
              {editing && (
                <View style={s.cameraBadge}>
                  <Text style={s.cameraIcon}>📷</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Info — view or edit */}
          <View style={s.heroContentWrap}>
          {editing ? (
            <View style={s.editBlock}>
              <TextInput
                style={s.editNameInput}
                value={editDisplayName}
                onChangeText={setEditDisplayName}
                placeholder="Your name"
                placeholderTextColor="#C4BAB2"
                autoCapitalize="words"
                accessibilityLabel="Your name"
              />

              <View style={s.usernameRow}>
                <Text style={s.atSign}>@</Text>
                <TextInput
                  style={s.editUsernameInput}
                  value={editUsername}
                  onChangeText={v => {
                    setEditUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                    setUsernameError('');
                  }}
                  placeholder="username"
                  placeholderTextColor="#C4BAB2"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                  accessibilityLabel="Username"
                />
              </View>
              {usernameError ? <Text style={s.usernameError}>{usernameError}</Text> : null}

              <TextInput
                style={s.editBioInput}
                value={editBio}
                onChangeText={setEditBio}
                placeholder="Add a bio..."
                placeholderTextColor="#C4BAB2"
                multiline
                maxLength={160}
                accessibilityLabel="Bio"
              />
              <Text style={s.fieldLabel}>I am a...</Text>
              <View style={s.roleRow}>
                {PARENT_ROLES.map(role => (
                  <TouchableOpacity
                    key={role}
                    style={[s.roleChip, editParentRole === role && s.roleChipActive]}
                    onPress={() => setEditParentRole(prev => prev === role ? '' : role)}
                    accessibilityRole="button" accessibilityLabel={role}
                  >
                    <Text style={[s.roleChipText, editParentRole === role && s.roleChipTextActive]}>{role}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLabel}>Call me...</Text>
              <Text style={s.fieldHint}>How the app addresses you</Text>
              <View style={s.roleRow}>
                {PARENT_TERM_OPTIONS.map(term => (
                  <TouchableOpacity
                    key={term.id}
                    style={[s.roleChip, editPreferredTerm === term.id && s.roleChipActive]}
                    onPress={() => setEditPreferredTerm(prev => prev === term.id ? '' : term.id)}
                    accessibilityRole="button" accessibilityLabel={term.label}
                  >
                    <Text style={[s.roleChipText, editPreferredTerm === term.id && s.roleChipTextActive]}>{term.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {editPreferredTerm === CUSTOM_TERM_ID && (
                <TextInput
                  style={s.editNameInput}
                  value={editCustomTerm}
                  onChangeText={setEditCustomTerm}
                  placeholder="What should we call you?"
                  placeholderTextColor="#C4BAB2"
                  accessibilityLabel="Custom term"
                />
              )}

              <Text style={s.fieldLabel}>Our family looks like</Text>
              <Text style={s.fieldHint}>Helps us tailor invite wording for your household</Text>
              <View style={s.roleRow}>
                {FAMILY_STRUCTURE_OPTIONS.map(fs => (
                  <TouchableOpacity
                    key={fs}
                    style={[s.roleChip, editFamilyStructure === fs && s.roleChipActive]}
                    onPress={() => setEditFamilyStructure(prev => prev === fs ? '' : fs)}
                    accessibilityRole="button" accessibilityLabel={fs}
                  >
                    <Text style={[s.roleChipText, editFamilyStructure === fs && s.roleChipTextActive]}>{fs}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {editFamilyStructure === 'Other' && (
                <TextInput
                  style={s.editNameInput}
                  value={editFamilyStructureCustom}
                  onChangeText={setEditFamilyStructureCustom}
                  placeholder="Describe your family"
                  placeholderTextColor="#C4BAB2"
                  accessibilityLabel="Custom family structure"
                />
              )}

              {/* Village privacy toggle */}
              <View style={s.privacyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.privacyLabel}>Show my patches on my profile</Text>
                  <Text style={s.privacyHint}>Others can see which patches you're in</Text>
                </View>
                <Switch
                  value={editShowVillages}
                  onValueChange={setEditShowVillages}
                  trackColor={{ false: c.cardSage, true: c.sage }}
                  thumbColor={editShowVillages ? '#fff' : '#fff'}
                  accessibilityLabel="Show my patches on my profile"
                />
              </View>

              {/* Baby info privacy toggle */}
              <View style={s.privacyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.privacyLabel}>Keep baby info private</Text>
                  <Text style={s.privacyHint}>Hide your baby's name, photo, and birthday from others</Text>
                </View>
                <Switch
                  value={editBabyInfoPrivate}
                  onValueChange={setEditBabyInfoPrivate}
                  trackColor={{ false: c.cardSage, true: c.sage }}
                  thumbColor="#fff"
                  accessibilityLabel="Keep baby info private"
                />
              </View>

              {saveError ? <Text style={s.saveError}>{saveError}</Text> : null}
            </View>
          ) : (
            <View style={s.viewBlock}>
              <Text style={s.heroName}>{displayName}</Text>

              {isGoldTier && (
                <View style={s.founderWrap}>
                  <Text style={s.founderStars}>✦  ✦  ✦  ✦  ✦</Text>
                  <View style={s.founderBadge}>
                    <Text style={s.founderBadgeText}>
                      {isAdmin ? '👑  Founder of Parent Patch  👑' : '🌿  Official Parent Patch Account  🌿'}
                    </Text>
                  </View>
                  <Text style={s.founderStarsBottom}>⭐  ⭐  ⭐  ⭐  ⭐</Text>
                </View>
              )}

              {profile?.username && (
                <Text style={s.heroUsername}>@{profile.username}</Text>
              )}
              {profile?.parent_role && (
                <View style={s.roleBadge}>
                  <Text style={s.roleBadgeText}>{profile.parent_role}</Text>
                </View>
              )}
              {profile?.bio ? (
                <Text style={s.heroBio}>{profile.bio}</Text>
              ) : null}

              {/* Stats row */}
              <View style={s.statsRow}>
                <View style={s.statItem} accessible accessibilityLabel={`${posts.length} Posts`}>
                  <Text style={s.statNum}>{posts.length}</Text>
                  <Text style={s.statLbl}>Posts</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem} accessible accessibilityLabel={`${followerCount} Followers`}>
                  <Text style={s.statNum}>{followerCount}</Text>
                  <Text style={s.statLbl}>Followers</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem} accessible accessibilityLabel={`${followingCount} Following`}>
                  <Text style={s.statNum}>{followingCount}</Text>
                  <Text style={s.statLbl}>Following</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem} accessible accessibilityLabel={`${myVillageIds.length} Patches`}>
                  <Text style={s.statNum}>{myVillageIds.length}</Text>
                  <Text style={s.statLbl}>Patches</Text>
                </View>
              </View>

              {/* Follow requests — shown when account is private */}
              {profile?.is_private && followRequests.length > 0 && (
                <View style={{ marginTop: 12, width: '100%' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, marginBottom: 8 }}>
                    🔒 {followRequests.length} Follow Request{followRequests.length !== 1 ? 's' : ''}
                  </Text>
                  {followRequests.map(req => {
                    const name = req.display_name || req.username || 'Parent';
                    const initial = name.charAt(0).toUpperCase();
                    return (
                      <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.cardBlush, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                          {req.avatar_url
                            ? <Image source={{ uri: req.avatar_url }} style={{ width: 36, height: 36 }} />
                            : <Text style={{ fontSize: 14, fontWeight: '700', color: c.primary }}>{initial}</Text>
                          }
                        </View>
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary }}>{name}</Text>
                        {processingRequestId === req.id ? (
                          <ActivityIndicator size="small" color={c.primary} />
                        ) : (
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              onPress={() => handleFollowRequest(req.id, req.requester_id, true)}
                              style={{ backgroundColor: c.primary, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 }}
                              accessibilityRole="button" accessibilityLabel={`Accept follow request from ${name}`}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Accept</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleFollowRequest(req.id, req.requester_id, false)}
                              style={{ backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1.5, borderColor: c.separator }}
                              accessibilityRole="button" accessibilityLabel={`Decline follow request from ${name}`}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: c.textMuted }}>Decline</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* My villages chips — shown only when public */}
              {myVillageIds.length > 0 && profile?.show_villages !== false && (
                <View style={s.villageChipsWrap}>
                  {myVillageIds.slice(0, 6).map((id, i) => {
                    const v = VILLAGE_MAP[id];
                    if (!v) return null;
                    const chipColors = [
                      { bg: c.cardLavender, border: c.lavender },
                      { bg: c.cardBlue,     border: c.blue },
                      { bg: c.cardBlush,    border: c.blush },
                      { bg: c.cardHoney,    border: c.honey },
                      { bg: c.cardSage,     border: c.sage },
                    ];
                    const cc = chipColors[i % chipColors.length];
                    return (
                      <View key={id} style={[s.villageChip, { backgroundColor: cc.bg, borderColor: cc.border }]}>
                        <Text style={s.villageChipText}>{v.emoji} {v.name.replace(' Patch', '').replace(' Parents', '')}</Text>
                      </View>
                    );
                  })}
                  {myVillageIds.length > 6 && (
                    <View style={s.villageChip}>
                      <Text style={s.villageChipText}>+{myVillageIds.length - 6} more</Text>
                    </View>
                  )}
                </View>
              )}
              {profile?.show_villages === false && (
                <Text style={s.villagesPrivateNote}>Patches set to private</Text>
              )}
            </View>
          )}
          </View>
        </View>

        {/* ── Baby card ── */}
        <Text style={s.sectionTitle}>Baby Profile</Text>
        <View style={{ overflow: 'visible' }}>
        {baby ? (
          <TouchableOpacity
            style={[
              s.babyCard,
              baby.gender?.toLowerCase() === 'girl' && { backgroundColor: c.girlBg, borderLeftColor: c.girlBorder, shadowColor: c.girlBorder },
              baby.gender?.toLowerCase() === 'boy' && { backgroundColor: c.boyBg, borderLeftColor: c.boyBorder, shadowColor: c.boyBorder },
            ]}
            onPress={() => setShowProfileSheet(true)}
            activeOpacity={0.85}
            accessibilityRole="button" accessibilityLabel="Open baby profile"
          >
            <View style={s.babyCardLeft}>
              {baby.photo_url ? (
                <Image source={{ uri: baby.photo_url }} style={s.babyPhoto} />
              ) : (
                <View style={[
                  s.babyAvatarCircle,
                  baby.gender?.toLowerCase() === 'girl' && { backgroundColor: c.girlBorder },
                  baby.gender?.toLowerCase() === 'boy' && { backgroundColor: c.boyBorder },
                ]}>
                  <Text style={s.babyAvatarInitial}>{baby.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View>
                <Text style={s.babyName}>{baby.name}</Text>
                <Text style={s.babyAge}>
                  {baby.is_expecting
                    ? (baby.due_date ? `Due ${formatDateShort(baby.due_date)} 🤰` : 'Due soon 🤰')
                    : baby.birth_date
                    ? `${formatDateShort(baby.birth_date)} · ${ageLabel(baby.birth_date)}`
                    : ''}
                </Text>
              </View>
            </View>
            <Text style={s.babyChevron}>›</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.babyCardEmpty} onPress={() => setShowProfileSheet(true)} activeOpacity={0.85}
            accessibilityRole="button" accessibilityLabel="Add baby profile">
            <Text style={s.babyCardEmptyText}>+ Add baby profile</Text>
          </TouchableOpacity>
        )}
        </View>

        {/* ── Posts / Journal / Calendar tab toggle ── */}
        <View style={[s.tabToggleRow, { marginTop: 28 }]}>
          <TouchableOpacity
            style={[s.tabToggleBtn, profileTab === 'posts' && s.tabToggleBtnActive]}
            onPress={() => setProfileTab('posts')}
            activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Posts tab"
          >
            <Text style={[s.tabToggleText, profileTab === 'posts' && s.tabToggleTextActive]}>
              💬 Posts
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabToggleBtn, profileTab === 'saved' && s.tabToggleBtnActive]}
            onPress={() => setProfileTab('saved')}
            activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Saved tab"
          >
            <Text style={[s.tabToggleText, profileTab === 'saved' && s.tabToggleTextActive]}>
              🔖 Saved
            </Text>
          </TouchableOpacity>
          {isSubscribed && (
            <TouchableOpacity
              style={[s.tabToggleBtn, profileTab === 'journal' && s.tabToggleBtnActive]}
              onPress={() => setProfileTab('journal')}
              activeOpacity={0.8}
              accessibilityRole="button" accessibilityLabel="Journal tab"
            >
              <Text style={[s.tabToggleText, profileTab === 'journal' && s.tabToggleTextActive]}>
                📖 Journal
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {profileTab === 'posts' ? (
          sortedPosts.length === 0 ? (
            <View style={s.emptyPosts}>
              <Text style={s.emptyPostsText}>No posts yet — share something with your community!</Text>
            </View>
          ) : (
            sortedPosts.map(post => {
              const isPinned = profile?.pinned_post_id === post.id;
              return (
                <View key={post.id} style={[
                  s.postCard,
                  isPinned && s.postCardPinned,
                  {
                    borderLeftWidth: 4,
                    borderLeftColor: post.post_type === 'milestone' ? c.postMilestone
                      : post.post_type === 'question' ? c.postQuestion
                      : c.postText,
                  },
                ]}>
                  {isPinned && (
                    <View style={s.pinnedBanner}>
                      <Text style={s.pinnedBannerText}>📌 Pinned</Text>
                    </View>
                  )}
                  <View style={s.postCardTop}>
                    <View style={[
                      s.postTypeBadge,
                      post.post_type === 'milestone' && { backgroundColor: c.cardHoney },
                      post.post_type === 'question' && { backgroundColor: c.cardBlue },
                      post.post_type === 'text' && { backgroundColor: c.cardBlush },
                    ]}>
                      <Text style={s.postTypeBadgeText}>
                        {post.post_type === 'milestone' ? '🎉 Milestone' : post.post_type === 'question' ? '❓ Question' : '💬 Update'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity onPress={() => togglePin(post.id)} style={s.postDeleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button" accessibilityLabel={isPinned ? 'Unpin post' : 'Pin post'}>
                        <Text style={s.postDeleteIcon}>{isPinned ? '📌' : '📍'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmDeletePost(post.id)} style={s.postDeleteBtn}
                        accessibilityRole="button" accessibilityLabel="Delete post">
                        <Text style={s.postDeleteIcon}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={s.postContent}>{post.content}</Text>
                  {post.image_url ? (
                    <Image source={{ uri: post.image_url }} style={s.postImage} resizeMode="cover" />
                  ) : null}
                  <View style={s.postCardFooter}>
                    <Text style={s.postTimestamp}>{getTimeAgo(post.created_at)}</Text>
                    <Text style={s.postLikes}>❤️ {post.likes}</Text>
                  </View>
                </View>
              );
            })
          )
        ) : profileTab === 'saved' ? (
          savedPosts.length === 0 ? (
            <View style={s.emptyPosts}>
              <Text style={s.emptyPostsText}>No saved posts yet — tap 🏷️ on any post to bookmark it.</Text>
            </View>
          ) : (
            savedPosts.map(post => (
              <View key={post.id} style={[
                s.postCard,
                {
                  borderLeftWidth: 4,
                  borderLeftColor: post.post_type === 'milestone' ? c.postMilestone
                    : post.post_type === 'question' ? c.postQuestion
                    : c.postText,
                },
              ]}>
                <View style={s.postCardTop}>
                  <View style={[
                    s.postTypeBadge,
                    post.post_type === 'milestone' && { backgroundColor: c.cardHoney },
                    post.post_type === 'question' && { backgroundColor: c.cardBlue },
                    post.post_type === 'text' && { backgroundColor: c.cardBlush },
                  ]}>
                    <Text style={s.postTypeBadgeText}>
                      {post.post_type === 'milestone' ? '🎉 Milestone' : post.post_type === 'question' ? '❓ Question' : '💬 Update'}
                    </Text>
                  </View>
                  {post.author && <Text style={s.postTimestamp}>by {post.author}</Text>}
                </View>
                <Text style={s.postContent}>{post.content}</Text>
                {post.image_url ? (
                  <Image source={{ uri: post.image_url }} style={s.postImage} resizeMode="cover" />
                ) : null}
                <View style={s.postCardFooter}>
                  <Text style={s.postTimestamp}>{getTimeAgo(post.created_at)}</Text>
                  <Text style={s.postLikes}>❤️ {post.likes}</Text>
                </View>
              </View>
            ))
          )
        ) : (
          <PaywallGate feature="baby_journal" isTracker title="Baby Journal" description="Write memories and notes for your baby to look back on someday." emoji="📓">
            <BabyJournal
              userId={profile?.id ?? null}
              babyId={baby?.id ?? null}
              babyName={baby?.name ?? null}
            />
          </PaywallGate>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <BabyProfileSheet
        visible={showProfileSheet}
        onClose={() => { setShowProfileSheet(false); loadAll(); }}
      />

      <Modal visible={showSettings} animationType="slide" presentationStyle="fullScreen">
        <SettingsScreen
          onBack={() => { setShowSettings(false); loadAll(); }}
          onTakeTour={() => {
            requestTour();
            setShowSettings(false);
            navigation.navigate('Home');
          }}
        />
      </Modal>

      {blockedContent && currentUserId && (
        <ContentBlockedModal
          visible={!!blockedContent}
          severity={blockedContent.severity}
          reason={blockedContent.reason}
          contentType={blockedContent.contentType}
          userId={currentUserId}
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
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: c.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: c.textSecondary,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBarCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  topBarCancelText: {
    fontSize: 15,
    color: c.textMuted,
    fontWeight: '600',
  },
  topBarSaveBtn: {
    backgroundColor: c.primary,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  topBarSaveText: {
    color: c.primaryText,
    fontWeight: '700',
    fontSize: 14,
  },
  editProfileBtn: {
    borderWidth: 1.5,
    borderColor: c.editBtn,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  editProfileBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: c.editBtn,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.card,
    borderWidth: 1.5,
    borderColor: c.separator,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Hero
  hero: {
    backgroundColor: c.heroBg,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: c.heroShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  headerBannerWrap: {
    width: '100%',
    height: 116,
    position: 'relative',
  },
  headerBannerImage: {
    width: '100%',
    height: 116,
  },
  headerBannerPlaceholder: {
    width: '100%',
    height: 116,
    backgroundColor: c.cardLavender,
  },
  headerBannerPlaceholderAdmin: {
    backgroundColor: '#FFF0C8',
  },
  headerBannerEditBtn: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  headerBannerEditText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  avatarOverlapRow: {
    width: '100%',
    alignItems: 'center',
    marginTop: -44,
    marginBottom: 4,
  },
  heroContentWrap: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 4,
  },
  heroAdmin: {
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.45)',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: c.avatarBg,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarWrapAdmin: {
    borderWidth: 3,
    borderColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 8,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarInitial: {
    fontSize: 34,
    fontWeight: '800',
    color: c.primary,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.roleBadge,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIcon: { fontSize: 13 },

  // view mode
  viewBlock: { alignItems: 'center', width: '100%' },
  heroName: {
    fontSize: 22,
    fontWeight: '800',
    color: c.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  heroUsername: {
    fontSize: 14,
    color: c.textMuted,
    fontWeight: '600',
    marginBottom: 8,
  },
  founderWrap: {
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    marginBottom: 6,
  },
  founderStars: {
    fontSize: 11,
    color: '#D4AF37',
    letterSpacing: 3,
    fontWeight: '700',
  },
  founderBadge: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 9,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  founderBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#7C5C00',
    letterSpacing: 0.3,
  },
  founderStarsBottom: {
    fontSize: 13,
    color: '#D4AF37',
    letterSpacing: 4,
  },
  roleBadge: {
    backgroundColor: c.roleBadge,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 10,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: c.primaryText,
  },
  heroBio: {
    fontSize: 14,
    color: c.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: c.sage,
    paddingTop: 14,
    width: '100%',
    marginTop: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 15,
    fontWeight: '800',
    color: c.textSecondary,
    marginBottom: 2,
  },
  statLbl: {
    fontSize: 11,
    color: c.textMuted,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: c.cardSage,
  },

  // edit mode
  editBlock: { width: '100%', gap: 10 },
  editNameInput: {
    fontSize: 18,
    fontWeight: '700',
    color: c.textPrimary,
    textAlign: 'center',
    borderBottomWidth: 2,
    borderBottomColor: c.sage,
    paddingVertical: 6,
    marginBottom: 2,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.inputBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  atSign: {
    fontSize: 15,
    color: c.textMuted,
    fontWeight: '700',
    marginRight: 4,
  },
  editUsernameInput: {
    flex: 1,
    fontSize: 15,
    color: c.textPrimary,
    fontWeight: '600',
    padding: 0,
  },
  usernameError: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: -4,
    paddingHorizontal: 4,
  },
  saveError: {
    fontSize: 13,
    color: '#DC2626',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  editBioInput: {
    backgroundColor: c.inputBg,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: c.textPrimary,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 2,
    marginTop: 4,
  },
  fieldHint: {
    fontSize: 12,
    color: c.textMuted,
    paddingHorizontal: 2,
    marginBottom: 6,
    marginTop: 2,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: c.cardHoney,
  },
  roleChipActive: {
    backgroundColor: c.roleBadge,
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textMuted,
  },
  roleChipTextActive: {
    color: c.primaryText,
  },

  // ── Section title
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.textSecondary,
    marginBottom: 12,
  },

  // ── Posts / Journal tab toggle
  tabToggleRow: {
    flexDirection: 'row',
    backgroundColor: c.inputBg,
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tabToggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center',
  },
  tabToggleBtnActive: {
    backgroundColor: c.card,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
  },
  tabToggleText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
  tabToggleTextActive: { color: c.textPrimary },

  // ── Baby card
  babyCard: {
    backgroundColor: c.cardSage,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    borderLeftWidth: 4,
    borderLeftColor: c.editBtn,
    shadowColor: c.editBtn,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  babyCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  babyPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  babyAvatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.avatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  babyAvatarInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  babyName: {
    fontSize: 16,
    fontWeight: '700',
    color: c.textPrimary,
    marginBottom: 2,
  },
  babyAge: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 5,
  },
  babyChevron: {
    fontSize: 22,
    color: c.textMuted,
  },
  babyCardEmpty: {
    backgroundColor: c.cardHoney,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: c.editBtn,
    borderStyle: 'dashed',
  },
  babyCardEmptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: c.editBtn,
  },

  // ── Posts
  emptyPosts: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  emptyPostsText: {
    fontSize: 14,
    color: c.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  postCard: {
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
  postCardPinned: {
    borderTopWidth: 2,
    borderTopColor: c.primary,
  },
  pinnedBanner: {
    marginBottom: 8,
  },
  pinnedBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: c.primary,
    letterSpacing: 0.3,
  },
  postCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  postTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  postTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: c.textSecondary,
  },
  postDeleteBtn: {
    padding: 4,
  },
  postDeleteIcon: {
    fontSize: 15,
  },
  postContent: {
    fontSize: 14,
    lineHeight: 21,
    color: c.textSecondary,
    marginBottom: 10,
  },
  postImage: {
    width: 160,
    height: 210,
    alignSelf: 'center',
    borderRadius: 12,
    marginBottom: 10,
  },
  postCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: c.separator,
    paddingTop: 8,
  },
  postTimestamp: {
    fontSize: 11,
    color: c.textMuted,
  },
  postLikes: {
    fontSize: 12,
    color: c.textMuted,
    fontWeight: '500',
  },

  // ── Villages on own profile
  villageChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
    justifyContent: 'center',
  },
  villageChip: {
    backgroundColor: c.cardLavender,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: c.lavender,
  },
  villageChipText: {
    fontSize: 12,
    color: c.textSecondary,
    fontWeight: '600',
  },
  villagesPrivateNote: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },

  // ── Privacy toggle
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
    gap: 12,
  },
  privacyLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: c.textSecondary,
    marginBottom: 2,
  },
  privacyHint: {
    fontSize: 11,
    color: c.textMuted,
  },

  // ── Sign out
  signOutBtn: {
    backgroundColor: c.signOut,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
    shadowColor: c.signOut,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  signOutText: {
    color: c.primaryText,
    fontSize: 16,
    fontWeight: '700',
  },
  });
}
