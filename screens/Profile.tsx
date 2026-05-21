import React, { useCallback, useMemo, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { VILLAGE_MAP } from '../lib/villageData';
import BabyProfileSheet from './BabyProfileSheet';
import BabyJournal from './BabyJournal';
import { useColors, Colors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  parent_role: string | null;
  show_villages: boolean | null;
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
  const s = useMemo(() => makeStyles(c), [c]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userCreatedAt, setUserCreatedAt] = useState('');
  const [baby, setBaby] = useState<Baby | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [myVillageIds, setMyVillageIds] = useState<string[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [profileTab, setProfileTab] = useState<'posts' | 'journal'>('posts');

  // Edit state
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editParentRole, setEditParentRole] = useState('');
  const [editShowVillages, setEditShowVillages] = useState(true);
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

      const [profileRes, babyRes, postsRes, villagesRes, followersRes, followingRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('babies').select('id,name,birth_date,is_expecting,photo_url,gender').eq('user_id', user.id).limit(1).maybeSingle(),
        supabase.from('posts').select('id,content,post_type,created_at,likes,image_url').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('user_villages').select('village_id').eq('user_id', user.id),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', user.id),
        supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', user.id),
      ]);

      setProfile(profileRes.data ?? null);
      setBaby(babyRes.data ?? null);
      setPosts(postsRes.data ?? []);
      setMyVillageIds((villagesRes.data ?? []).map((r: any) => r.village_id));
      setFollowerCount(followersRes.count ?? 0);
      setFollowingCount(followingRes.count ?? 0);
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
    setEditShowVillages(profile?.show_villages !== false);
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
        show_villages: editShowVillages,
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
              {/* Village privacy toggle */}
              <View style={s.privacyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.privacyLabel}>Show my villages on my profile</Text>
                  <Text style={s.privacyHint}>Others can see which villages you're in</Text>
                </View>
                <Switch
                  value={editShowVillages}
                  onValueChange={setEditShowVillages}
                  trackColor={{ false: c.cardSage, true: c.sage }}
                  thumbColor={editShowVillages ? '#fff' : '#fff'}
                />
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
                  <Text style={s.statNum}>{followerCount}</Text>
                  <Text style={s.statLbl}>Followers</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statNum}>{followingCount}</Text>
                  <Text style={s.statLbl}>Following</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statNum}>{myVillageIds.length}</Text>
                  <Text style={s.statLbl}>Villages</Text>
                </View>
              </View>

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
                        <Text style={s.villageChipText}>{v.emoji} {v.name.replace(' Village', '').replace(' Parents', '')}</Text>
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
                <Text style={s.villagesPrivateNote}>Villages set to private</Text>
              )}
            </View>
          )}
        </View>

        {/* ── Baby card ── */}
        <Text style={s.sectionTitle}>Baby Profile</Text>
        {baby ? (
          <TouchableOpacity
            style={[
              s.babyCard,
              baby.gender?.toLowerCase() === 'girl' && { backgroundColor: c.girlBg, borderLeftColor: c.girlBorder, shadowColor: c.girlBorder },
              baby.gender?.toLowerCase() === 'boy' && { backgroundColor: c.boyBg, borderLeftColor: c.boyBorder, shadowColor: c.boyBorder },
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

        {/* ── Posts / Journal tab toggle ── */}
        <View style={[s.tabToggleRow, { marginTop: 28 }]}>
          <TouchableOpacity
            style={[s.tabToggleBtn, profileTab === 'posts' && s.tabToggleBtnActive]}
            onPress={() => setProfileTab('posts')}
            activeOpacity={0.8}
          >
            <Text style={[s.tabToggleText, profileTab === 'posts' && s.tabToggleTextActive]}>
              💬 Your Posts
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabToggleBtn, profileTab === 'journal' && s.tabToggleBtnActive]}
            onPress={() => setProfileTab('journal')}
            activeOpacity={0.8}
          >
            <Text style={[s.tabToggleText, profileTab === 'journal' && s.tabToggleTextActive]}>
              📖 Baby Journal
            </Text>
          </TouchableOpacity>
        </View>

        {profileTab === 'posts' ? (
          posts.length === 0 ? (
            <View style={s.emptyPosts}>
              <Text style={s.emptyPostsText}>No posts yet — share something with your village!</Text>
            </View>
          ) : (
            posts.map(post => (
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
                  <TouchableOpacity onPress={() => confirmDeletePost(post.id)} style={s.postDeleteBtn}>
                    <Text style={s.postDeleteIcon}>🗑</Text>
                  </TouchableOpacity>
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
          <BabyJournal
            userId={profile?.id ?? null}
            babyId={baby?.id ?? null}
            babyName={baby?.name ?? null}
          />
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

  // ── Hero
  hero: {
    backgroundColor: c.heroBg,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: c.heroShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: c.avatarBg,
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
