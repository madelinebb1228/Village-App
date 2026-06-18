import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { VILLAGE_MAP } from '../lib/villageData';
import { useColors, Colors } from '../lib/theme';

interface PublicProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  parent_role: string | null;
  show_villages: boolean | null;
  pinned_post_id: string | null;
  is_private: boolean | null;
}

interface PinnedPost {
  id: string;
  content: string;
  post_type: string;
  image_url: string | null;
  likes: number;
  created_at: string;
}

interface Props {
  userId: string | null;
  visible: boolean;
  onClose: () => void;
  onMessage?: (userId: string) => void;
}

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function getTimeAgo(dateString: string): string {
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(dateString) ? dateString : dateString + 'Z';
  const seconds = Math.floor((Date.now() - new Date(normalized).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    closeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    closeText: { fontSize: 16, fontWeight: '700', color: c.primary },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    ownProfileText: { fontSize: 15, color: c.textMuted, textAlign: 'center', lineHeight: 22 },

    content: { padding: 20 },

    hero: {
      backgroundColor: c.heroBg,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      marginBottom: 20,
      shadowColor: c.heroShadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 4,
    },
    avatarWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: c.avatarBg,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
      overflow: 'hidden',
    },
    avatarImage: { width: 80, height: 80, borderRadius: 40 },
    avatarInitial: { fontSize: 30, fontWeight: '800', color: c.primary },

    heroName: {
      fontSize: 20,
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
    roleBadgeText: { fontSize: 12, fontWeight: '700', color: c.textOnColored },
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
    statItem: { flex: 1, alignItems: 'center' },
    statNum: { fontSize: 15, fontWeight: '800', color: c.textSecondary, marginBottom: 2 },
    statLbl: { fontSize: 11, color: c.textMuted, fontWeight: '500' },
    statDivider: { width: 1, height: 32, backgroundColor: c.cardSage },

    section: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textSecondary,
    },
    commonBadge: {
      backgroundColor: c.cardSage,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    commonBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
    },

    villageChipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    villageChip: {
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
    },
    villageChipText: {
      fontSize: 12,
      color: c.textSecondary,
      fontWeight: '600',
    },

    privateNote: {
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
      fontStyle: 'italic',
      marginTop: 4,
    },

    pinnedCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderTopWidth: 2,
      borderTopColor: c.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    pinnedLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: c.primary,
      letterSpacing: 0.3,
      marginBottom: 8,
    },
    pinnedTypeBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
      marginBottom: 8,
    },
    pinnedTypeBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textSecondary,
    },
    pinnedContent: {
      fontSize: 14,
      lineHeight: 21,
      color: c.textSecondary,
      marginBottom: 10,
    },
    pinnedImage: {
      width: '100%',
      height: 180,
      borderRadius: 10,
      marginBottom: 10,
    },
    pinnedFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: c.separator,
      paddingTop: 8,
    },
    pinnedStat: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
    pinnedTime: { fontSize: 11, color: c.textMuted },
  });
}

export default function PublicProfileSheet({ userId, visible, onClose, onMessage }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [postCount, setPostCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [theirVillageIds, setTheirVillageIds] = useState<string[]>([]);
  const [myVillageIds, setMyVillageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [pinnedPost, setPinnedPost] = useState<PinnedPost | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);
  const [followRequestStatus, setFollowRequestStatus] = useState<'none' | 'pending'>('none');
  const [showReportUser, setShowReportUser] = useState(false);
  const [reportUserReason, setReportUserReason] = useState('');
  const [reportUserSubmitting, setReportUserSubmitting] = useState(false);
  const [reportUserDone, setReportUserDone] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    setProfile(null);
    setPinnedPost(null);
    setTheirVillageIds([]);
    setMyVillageIds([]);
    setPostCount(0);
    setFollowerCount(0);
    setFollowingCount(0);
    setIsOwnProfile(false);
    setIsFollowing(false);
    setIsBlocked(false);
    setIsMuted(false);
    setFollowRequestStatus('none');
    setShowReportUser(false);
    setReportUserDone(false);

    (async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setMyId(user.id);

        if (user.id === userId) {
          setIsOwnProfile(true);
          setLoading(false);
          return;
        }

        const [profileRes, postsRes, theirVillagesRes, myVillagesRes, followersRes, followingRes, isFollowingRes, blockRes, muteRes, followReqRes] = await Promise.all([
          supabase.from('profiles').select('id,username,display_name,bio,avatar_url,parent_role,show_villages,pinned_post_id,is_private').eq('id', userId).maybeSingle(),
          supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('user_villages').select('village_id').eq('user_id', userId),
          supabase.from('user_villages').select('village_id').eq('user_id', user.id),
          supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
          supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
          supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', userId).maybeSingle(),
          supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id).eq('blocked_id', userId).maybeSingle(),
          supabase.from('user_mutes').select('muted_id').eq('muter_id', user.id).eq('muted_id', userId).maybeSingle(),
          (supabase as any).from('follow_requests').select('status').eq('requester_id', user.id).eq('target_id', userId).maybeSingle(),
        ]);

        setProfile(profileRes.data ?? null);
        setPostCount(postsRes.count ?? 0);
        setFollowerCount(followersRes.count ?? 0);
        setFollowingCount(followingRes.count ?? 0);
        setTheirVillageIds((theirVillagesRes.data ?? []).map((r: any) => r.village_id));
        setMyVillageIds((myVillagesRes.data ?? []).map((r: any) => r.village_id));
        setIsFollowing(!!isFollowingRes.data);
        setIsBlocked(!!blockRes.data);
        setIsMuted(!!muteRes.data);
        setFollowRequestStatus(followReqRes.data?.status === 'pending' ? 'pending' : 'none');

        const pinnedId = (profileRes.data as any)?.pinned_post_id;
        if (pinnedId) {
          const { data: pinned } = await supabase
            .from('posts')
            .select('id,content,post_type,image_url,likes,created_at')
            .eq('id', pinnedId)
            .maybeSingle();
          setPinnedPost((pinned as any) ?? null);
        }
      } catch (err: any) {
        console.warn('PublicProfileSheet error:', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, userId]);

  async function toggleFollow() {
    if (!myId || !userId || followLoading) return;
    setFollowLoading(true);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', userId);
      setIsFollowing(false);
      setFollowerCount(c => Math.max(0, c - 1));
    } else if (profile?.is_private) {
      if (followRequestStatus === 'pending') {
        await (supabase as any).from('follow_requests').delete().eq('requester_id', myId).eq('target_id', userId);
        setFollowRequestStatus('none');
      } else {
        await (supabase as any).from('follow_requests').insert({ requester_id: myId, target_id: userId });
        setFollowRequestStatus('pending');
      }
    } else {
      await (supabase as any).from('follows').insert({ follower_id: myId, following_id: userId });
      setIsFollowing(true);
      setFollowerCount(c => c + 1);
    }
    setFollowLoading(false);
  }

  async function toggleMute() {
    if (!myId || !userId || muteLoading) return;
    setMuteLoading(true);
    if (isMuted) {
      await (supabase as any).from('user_mutes').delete().eq('muter_id', myId).eq('muted_id', userId);
      setIsMuted(false);
    } else {
      await (supabase as any).from('user_mutes').insert({ muter_id: myId, muted_id: userId });
      setIsMuted(true);
    }
    setMuteLoading(false);
  }

  async function handleBlock() {
    if (!myId || !userId || blockLoading) return;
    const name = profile?.display_name || profile?.username || 'this user';
    if (isBlocked) {
      const doUnblock = async () => {
        setBlockLoading(true);
        await supabase.from('user_blocks').delete().eq('blocker_id', myId).eq('blocked_id', userId);
        setIsBlocked(false);
        setBlockLoading(false);
      };
      if (Platform.OS === 'web') {
        if (window.confirm(`Unblock ${name}?`)) doUnblock();
      } else {
        Alert.alert('Unblock', `Unblock ${name}?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Unblock', onPress: doUnblock },
        ]);
      }
    } else {
      const doBlock = async () => {
        setBlockLoading(true);
        await supabase.from('user_blocks').insert({ blocker_id: myId, blocked_id: userId });
        setIsBlocked(true);
        setBlockLoading(false);
        onClose();
      };
      if (Platform.OS === 'web') {
        if (window.confirm(`Block ${name}? They won't be able to see your profile or message you.`)) doBlock();
      } else {
        Alert.alert('Block User', `Block ${name}?\n\nThey won't be able to see your profile or send you messages.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Block', style: 'destructive', onPress: doBlock },
        ]);
      }
    }
  }

  async function submitUserReport() {
    if (!myId || !userId || !reportUserReason) return;
    setReportUserSubmitting(true);
    await supabase.from('user_reports').insert({ reporter_id: myId, reported_id: userId, reason: reportUserReason });
    setReportUserSubmitting(false);
    setReportUserDone(true);
  }

  const commonIds = theirVillageIds.filter(id => myVillageIds.includes(id));
  const displayName = profile?.display_name || profile?.username || 'Villager';
  const initial = displayName.charAt(0).toUpperCase();
  const showVillages = profile?.show_villages !== false;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safeArea}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
            <Text style={s.closeText}>Done</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={c.primary} size="large" />
          </View>
        ) : isOwnProfile ? (
          <View style={s.center}>
            <Text style={s.ownProfileText}>That's you! Edit your profile from the Profile tab.</Text>
          </View>
        ) : !profile ? (
          <View style={s.center}>
            <Text style={s.ownProfileText}>Profile not found.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {/* Hero card */}
            <View style={s.hero}>
              {/* Avatar */}
              <View style={s.avatarWrap}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={s.avatarImage} />
                ) : (
                  <Text style={s.avatarInitial}>{initial}</Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.heroName}>{displayName}</Text>
                {profile.is_private && <Text style={{ fontSize: 16 }}>🔒</Text>}
              </View>
              {profile.username && (
                <Text style={s.heroUsername}>@{profile.username}</Text>
              )}
              {profile.parent_role && (
                <View style={s.roleBadge}>
                  <Text style={s.roleBadgeText}>{profile.parent_role}</Text>
                </View>
              )}
              {profile.bio ? (
                <Text style={s.heroBio}>{profile.bio}</Text>
              ) : null}

              {/* Stats */}
              <View style={s.statsRow}>
                <View style={s.statItem}>
                  <Text style={s.statNum}>{postCount}</Text>
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
                {showVillages && (
                  <>
                    <View style={s.statDivider} />
                    <View style={s.statItem}>
                      <Text style={s.statNum}>{theirVillageIds.length}</Text>
                      <Text style={s.statLbl}>Patches</Text>
                    </View>
                  </>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
                {!isBlocked && (
                  <TouchableOpacity
                    onPress={toggleFollow}
                    disabled={followLoading}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: isFollowing || followRequestStatus === 'pending' ? c.card : c.primary,
                      borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10,
                      borderWidth: isFollowing || followRequestStatus === 'pending' ? 1.5 : 0,
                      borderColor: c.separator,
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>
                      {isFollowing ? '✓' : followRequestStatus === 'pending' ? '⏳' : '+'}
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: isFollowing || followRequestStatus === 'pending' ? c.textPrimary : '#fff' }}>
                      {isFollowing ? 'Following' : followRequestStatus === 'pending' ? 'Requested' : 'Follow'}
                    </Text>
                  </TouchableOpacity>
                )}
                {!isBlocked && (
                  <TouchableOpacity
                    onPress={toggleMute}
                    disabled={muteLoading}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: isMuted ? c.cardHoney : c.card, borderRadius: 20,
                      paddingHorizontal: 16, paddingVertical: 10,
                      borderWidth: 1.5, borderColor: isMuted ? c.honey : c.separator,
                    }}
                  >
                    {muteLoading
                      ? <ActivityIndicator size="small" color={c.textMuted} />
                      : <>
                          <Text style={{ fontSize: 14 }}>🔇</Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>
                            {isMuted ? 'Unmute' : 'Mute'}
                          </Text>
                        </>
                    }
                  </TouchableOpacity>
                )}
                {onMessage && userId && !isBlocked && (
                  <TouchableOpacity
                    onPress={() => { onClose(); onMessage(userId); }}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: c.card, borderRadius: 20,
                      paddingHorizontal: 20, paddingVertical: 10,
                      borderWidth: 1.5, borderColor: c.separator,
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>💬</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>Message</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => { setShowReportUser(true); setReportUserReason(''); setReportUserDone(false); }}
                  activeOpacity={0.85}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: c.card, borderRadius: 20,
                    paddingHorizontal: 16, paddingVertical: 10,
                    borderWidth: 1.5, borderColor: c.separator,
                  }}
                >
                  <Text style={{ fontSize: 14 }}>🚩</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>Report</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleBlock}
                  disabled={blockLoading}
                  activeOpacity={0.85}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: isBlocked ? '#FEE2E2' : c.card, borderRadius: 20,
                    paddingHorizontal: 16, paddingVertical: 10,
                    borderWidth: 1.5, borderColor: isBlocked ? '#FCA5A5' : c.separator,
                  }}
                >
                  {blockLoading
                    ? <ActivityIndicator size="small" color="#DC2626" />
                    : <>
                        <Text style={{ fontSize: 14 }}>🚫</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: isBlocked ? '#DC2626' : c.textPrimary }}>
                          {isBlocked ? 'Unblock' : 'Block'}
                        </Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            </View>

            {/* Private account banner (shown if private and not following) */}
            {profile.is_private && !isFollowing && (
              <View style={{
                backgroundColor: c.card, borderRadius: 16, padding: 16, marginBottom: 12,
                alignItems: 'center', gap: 6,
                borderWidth: 1.5, borderColor: c.separator,
              }}>
                <Text style={{ fontSize: 28 }}>🔒</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>This account is private</Text>
                <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 18 }}>
                  {followRequestStatus === 'pending'
                    ? 'Your follow request is pending approval.'
                    : 'Follow this account to see their posts and patches.'}
                </Text>
              </View>
            )}

            {/* Pinned post */}
            {pinnedPost && (
              <View style={s.pinnedCard}>
                <Text style={s.pinnedLabel}>📌 Pinned</Text>
                <View style={[
                  s.pinnedTypeBadge,
                  pinnedPost.post_type === 'milestone' ? { backgroundColor: c.cardHoney }
                    : pinnedPost.post_type === 'question' ? { backgroundColor: c.cardBlue }
                    : { backgroundColor: c.cardBlush },
                ]}>
                  <Text style={s.pinnedTypeBadgeText}>
                    {pinnedPost.post_type === 'milestone' ? '🎉 Milestone'
                      : pinnedPost.post_type === 'question' ? '❓ Question'
                      : '💬 Update'}
                  </Text>
                </View>
                {!!pinnedPost.content && (
                  <Text style={s.pinnedContent}>{pinnedPost.content}</Text>
                )}
                {pinnedPost.image_url && (
                  <Image source={{ uri: pinnedPost.image_url }} style={s.pinnedImage} resizeMode="cover" />
                )}
                <View style={s.pinnedFooter}>
                  <Text style={s.pinnedStat}>❤️ {pinnedPost.likes || 0}</Text>
                  <Text style={s.pinnedTime}>{getTimeAgo(pinnedPost.created_at)}</Text>
                </View>
              </View>
            )}

            {/* Villages section */}
            {showVillages && theirVillageIds.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionTitle}>Patches</Text>
                  {commonIds.length > 0 && (
                    <View style={s.commonBadge}>
                      <Text style={s.commonBadgeText}>🏘️ {commonIds.length} in common</Text>
                    </View>
                  )}
                </View>

                <View style={s.villageChipsWrap}>
                  {theirVillageIds.map((id, i) => {
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
                        <Text style={s.villageChipText}>
                          {v.emoji} {v.name.replace(' Patch', '').replace(' Parents', '')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {!showVillages && (
              <Text style={s.privateNote}>This user's patches are private.</Text>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Report user modal */}
      <Modal
        visible={showReportUser}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReportUser(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 14,
            borderBottomWidth: 1, borderBottomColor: c.separator,
          }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>Report User</Text>
            <TouchableOpacity onPress={() => setShowReportUser(false)}>
              <Text style={{ fontSize: 18, color: c.textMuted }}>✕</Text>
            </TouchableOpacity>
          </View>
          {reportUserDone ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 }}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>Report Submitted</Text>
              <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 }}>
                Thank you for helping keep the community safe. We'll review this account.
              </Text>
              <TouchableOpacity
                onPress={() => setShowReportUser(false)}
                style={{ marginTop: 8, backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 28, paddingVertical: 12 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
              <Text style={{ fontSize: 15, color: c.textSecondary, marginBottom: 4 }}>
                Why are you reporting this account?
              </Text>
              {['Spam or fake account', 'Inappropriate content', 'Harassment or bullying', 'Impersonation', 'Other'].map(reason => (
                <TouchableOpacity
                  key={reason}
                  onPress={() => setReportUserReason(reason)}
                  style={{
                    padding: 14, borderRadius: 12, borderWidth: 1.5,
                    borderColor: reportUserReason === reason ? c.primary : c.separator,
                    backgroundColor: reportUserReason === reason ? c.cardLavender : c.card,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.textPrimary }}>{reason}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={submitUserReport}
                disabled={!reportUserReason || reportUserSubmitting}
                style={{
                  marginTop: 8, backgroundColor: c.primary, borderRadius: 20,
                  paddingVertical: 14, alignItems: 'center',
                  opacity: !reportUserReason || reportUserSubmitting ? 0.4 : 1,
                }}
              >
                {reportUserSubmitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Submit Report</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </Modal>
  );
}
