import React, { useCallback, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import BabyProfileSheet from './BabyProfileSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  parent_role: string | null;
}

interface Baby {
  id: string;
  name: string;
  birth_date: string | null;
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userCreatedAt, setUserCreatedAt] = useState('');
  const [baby, setBaby] = useState<Baby | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);

  // Edit state
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editParentRole, setEditParentRole] = useState('');
  const [pendingAvatarUri, setPendingAvatarUri] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState('');
  const [saveError, setSaveError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email ?? '');
      setUserCreatedAt(user.created_at ?? '');

      const [profileRes, babyRes, postsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('babies').select('id,name,birth_date,is_expecting,photo_url,gender').eq('user_id', user.id).limit(1).maybeSingle(),
        supabase.from('posts').select('id,content,post_type,created_at,likes').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);

      setProfile(profileRes.data ?? null);
      setBaby(babyRes.data ?? null);
      setPosts(postsRes.data ?? []);
    } catch (err: any) {
      console.warn('Profile loadAll error:', err.message);
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
    setPendingAvatarUri(null);
    setUsernameError('');
    setSaveError('');
    setEditing(true);
  }

  function cancelEdit() {
    setPendingAvatarUri(null);
    setUsernameError('');
    setSaveError('');
    setEditing(false);
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
    if (!result.canceled && result.assets[0]) {
      setPendingAvatarUri(result.assets[0].uri);
    }
  }

  async function saveProfile() {
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

    setUsernameError('');
    setSaveError('');
    setSaving(true);
    try {
      let avatarUrl = profile?.avatar_url ?? null;
      if (pendingAvatarUri) {
        const uploaded = await uploadAvatar(pendingAvatarUri, user.id);
        if (uploaded) avatarUrl = uploaded;
      }

      const payload = {
        username: trimmedUsername || null,
        display_name: editDisplayName.trim() || null,
        bio: editBio.trim() || null,
        avatar_url: avatarUrl,
        parent_role: editParentRole || null,
      };

      // Try UPDATE first; if no rows matched, INSERT (handles first-time profile creation)
      const { data: updated, error: updateErr } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id)
        .select('id');

      if (updateErr) throw updateErr;

      if (!updated || updated.length === 0) {
        const { error: insertErr } = await supabase
          .from('profiles')
          .insert({ id: user.id, ...payload });
        if (insertErr) throw insertErr;
      }

      await loadAll();
      setEditing(false);
      setPendingAvatarUri(null);
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

  const avatarSource = pendingAvatarUri
    ? { uri: pendingAvatarUri }
    : profile?.avatar_url
    ? { uri: profile.avatar_url }
    : null;

  const displayName = profile?.display_name || profile?.username || userEmail.split('@')[0] || 'Your Name';

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
              <TouchableOpacity onPress={cancelEdit} style={s.topBarCancelBtn}>
                <Text style={s.topBarCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveProfile} style={s.topBarSaveBtn} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.topBarSaveText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={startEdit} style={s.editProfileBtn}>
              <Text style={s.editProfileBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Hero ── */}
        <View style={s.hero}>

          {/* Avatar */}
          <TouchableOpacity
            style={s.avatarWrap}
            onPress={editing ? pickAvatar : undefined}
            activeOpacity={editing ? 0.75 : 1}
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

          {/* Info — view or edit */}
          {editing ? (
            <View style={s.editBlock}>
              <TextInput
                style={s.editNameInput}
                value={editDisplayName}
                onChangeText={setEditDisplayName}
                placeholder="Your name"
                placeholderTextColor="#C4BAB2"
                autoCapitalize="words"
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
              />
              <Text style={s.fieldLabel}>I am a...</Text>
              <View style={s.roleRow}>
                {PARENT_ROLES.map(role => (
                  <TouchableOpacity
                    key={role}
                    style={[s.roleChip, editParentRole === role && s.roleChipActive]}
                    onPress={() => setEditParentRole(prev => prev === role ? '' : role)}
                  >
                    <Text style={[s.roleChipText, editParentRole === role && s.roleChipTextActive]}>{role}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {saveError ? <Text style={s.saveError}>{saveError}</Text> : null}
            </View>
          ) : (
            <View style={s.viewBlock}>
              <Text style={s.heroName}>{displayName}</Text>
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
                <View style={s.statItem}>
                  <Text style={s.statNum}>{posts.length}</Text>
                  <Text style={s.statLbl}>Posts</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statNum} numberOfLines={1} adjustsFontSizeToFit>
                    {userCreatedAt ? memberSince(userCreatedAt) : '–'}
                  </Text>
                  <Text style={s.statLbl}>Member since</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Baby card ── */}
        <Text style={s.sectionTitle}>Baby Profile</Text>
        {baby ? (
          <TouchableOpacity
            style={[
              s.babyCard,
              baby.gender?.toLowerCase() === 'girl' && { backgroundColor: '#FFC2C3', borderLeftColor: '#FA92B1', shadowColor: '#FA92B1' },
              baby.gender?.toLowerCase() === 'boy' && { backgroundColor: '#AEC5F1', borderLeftColor: '#57B2E8', shadowColor: '#57B2E8' },
            ]}
            onPress={() => setShowProfileSheet(true)}
            activeOpacity={0.85}
          >
            <View style={s.babyCardLeft}>
              {baby.photo_url ? (
                <Image source={{ uri: baby.photo_url }} style={s.babyPhoto} />
              ) : (
                <View style={[
                  s.babyAvatarCircle,
                  baby.gender?.toLowerCase() === 'girl' && { backgroundColor: '#FA92B1' },
                  baby.gender?.toLowerCase() === 'boy' && { backgroundColor: '#57B2E8' },
                ]}>
                  <Text style={s.babyAvatarInitial}>{baby.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View>
                <Text style={s.babyName}>{baby.name}</Text>
                <Text style={s.babyAge}>
                  {baby.is_expecting
                    ? 'Due soon 🤰'
                    : baby.birth_date
                    ? `${formatDateShort(baby.birth_date)} · ${ageLabel(baby.birth_date)}`
                    : ''}
                </Text>
              </View>
            </View>
            <Text style={s.babyChevron}>›</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.babyCardEmpty} onPress={() => setShowProfileSheet(true)} activeOpacity={0.85}>
            <Text style={s.babyCardEmptyText}>+ Add baby profile</Text>
          </TouchableOpacity>
        )}

        {/* ── Your Posts ── */}
        <Text style={[s.sectionTitle, { marginTop: 28 }]}>Your Posts</Text>
        {posts.length === 0 ? (
          <View style={s.emptyPosts}>
            <Text style={s.emptyPostsText}>No posts yet — share something with your village!</Text>
          </View>
        ) : (
          posts.map(post => (
            <View key={post.id} style={[
              s.postCard,
              {
                borderLeftWidth: 4,
                borderLeftColor: post.post_type === 'milestone' ? '#F9DE87'
                  : post.post_type === 'question' ? '#57B2E8'
                  : '#B1A7F0',
              },
            ]}>
              <View style={s.postCardTop}>
                <View style={[
                  s.postTypeBadge,
                  post.post_type === 'milestone' && { backgroundColor: '#F8F3D4' },
                  post.post_type === 'question' && { backgroundColor: '#AEC5F1' },
                  post.post_type === 'text' && { backgroundColor: '#FDE4DE' },
                ]}>
                  <Text style={s.postTypeBadgeText}>
                    {post.post_type === 'milestone' ? '🎉 Milestone' : post.post_type === 'question' ? '❓ Question' : '💬 Update'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => confirmDeletePost(post.id)} style={s.postDeleteBtn}>
                  <Text style={s.postDeleteIcon}>🗑</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.postContent}>{post.content}</Text>
              <View style={s.postCardFooter}>
                <Text style={s.postTimestamp}>{getTimeAgo(post.created_at)}</Text>
                <Text style={s.postLikes}>❤️ {post.likes}</Text>
              </View>
            </View>
          ))
        )}

        {/* ── Sign out ── */}
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      <BabyProfileSheet
        visible={showProfileSheet}
        onClose={() => { setShowProfileSheet(false); loadAll(); }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FEFCF8' },
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
    color: '#5A544E',
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
    color: '#B0A89E',
    fontWeight: '600',
  },
  topBarSaveBtn: {
    backgroundColor: '#B1A7F0',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  topBarSaveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  editProfileBtn: {
    borderWidth: 1.5,
    borderColor: '#94B58C',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  editProfileBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94B58C',
  },

  // ── Hero
  hero: {
    backgroundColor: '#FDE4DE',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#DBABBF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FFC2C3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarInitial: {
    fontSize: 34,
    fontWeight: '800',
    color: '#B1A7F0',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FA92B1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIcon: { fontSize: 13 },

  // view mode
  viewBlock: { alignItems: 'center', width: '100%' },
  heroName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#3D3530',
    marginBottom: 4,
    textAlign: 'center',
  },
  heroUsername: {
    fontSize: 14,
    color: '#AEBCB1',
    fontWeight: '600',
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: '#FA92B1',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 10,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  heroBio: {
    fontSize: 14,
    color: '#8A7E78',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#C1C89B',
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
    color: '#5A544E',
    marginBottom: 2,
  },
  statLbl: {
    fontSize: 11,
    color: '#B0A89E',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#D3E5CF',
  },

  // edit mode
  editBlock: { width: '100%', gap: 10 },
  editNameInput: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3D3530',
    textAlign: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#C1C89B',
    paddingVertical: 6,
    marginBottom: 2,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F5F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  atSign: {
    fontSize: 15,
    color: '#AEBCB1',
    fontWeight: '700',
    marginRight: 4,
  },
  editUsernameInput: {
    flex: 1,
    fontSize: 15,
    color: '#3D3530',
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
    backgroundColor: '#F8F5F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#3D3530',
    minHeight: 72,
    textAlignVertical: 'top',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A8E88',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 2,
    marginTop: 4,
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
    backgroundColor: '#F8F3D4',
  },
  roleChipActive: {
    backgroundColor: '#FA92B1',
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A7E78',
  },
  roleChipTextActive: {
    color: '#fff',
  },

  // ── Section title
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#5A544E',
    marginBottom: 12,
  },

  // ── Baby card
  babyCard: {
    backgroundColor: '#D3E5CF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#94B58C',
    shadowColor: '#94B58C',
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
    backgroundColor: '#FFC2C3',
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
    color: '#3D3530',
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
    color: '#AEBCB1',
  },
  babyCardEmpty: {
    backgroundColor: '#F8F3D4',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#94B58C',
    borderStyle: 'dashed',
  },
  babyCardEmptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94B58C',
  },

  // ── Posts
  emptyPosts: {
    backgroundColor: '#fff',
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
    color: '#B0A89E',
    textAlign: 'center',
    lineHeight: 20,
  },
  postCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    color: '#5A544E',
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
    color: '#5A544E',
    marginBottom: 10,
  },
  postCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F5F0EA',
    paddingTop: 8,
  },
  postTimestamp: {
    fontSize: 11,
    color: '#B0A89E',
  },
  postLikes: {
    fontSize: 12,
    color: '#B0A89E',
    fontWeight: '500',
  },

  // ── Sign out
  signOutBtn: {
    backgroundColor: '#FF8BA0',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
    shadowColor: '#FF8BA0',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  signOutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
