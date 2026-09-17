import React, { useContext, useEffect, useMemo, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Village, villagesByIds } from '../lib/villageData';
import { useColors, Colors } from '../lib/theme';
import { typography } from '../lib/typography';
import { hitSlopFor } from '../lib/accessibility';
import LoadErrorBanner from '../components/LoadErrorBanner';
import { useSubscription } from '../lib/subscriptionContext';
import { Post as FeedPost } from '../types/feed';
import PostPreviewCard from '../components/discover/PostPreviewCard';
import ProfileMediaGrid from '../components/profile/ProfileMediaGrid';
import PatchChipRow from '../components/profile/PatchChipRow';
import VillageFeedSheet from './VillageFeedSheet';
import { joinPatch, leavePatch } from '../lib/discoverData';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive, maxWidthFor } from '../lib/responsive';
import { AppContext } from '../lib/AppContext';
import ConfinedOverlay from '../components/ConfinedOverlay';

interface PublicProfile {
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
  is_founder: boolean | null;
  is_official: boolean | null;
}

interface PublicBaby {
  name: string;
  birth_date: string | null;
  is_expecting: boolean | null;
}

interface Props {
  userId: string | null;
  visible: boolean;
  onClose: () => void;
  onMessage?: (userId: string) => void;
  // When this sheet is itself nested inside another Modal (SearchSheet,
  // VillageFeedSheet), navigating to PostDetail switches the tab underneath
  // but doesn't dismiss that ancestor Modal, since it's a portal independent
  // of navigation focus. Callers that nest this sheet pass their own close
  // handler here so it's dismissed too.
  dismissParents?: () => void;
  /** 'modal' (default): existing mobile full-screen Modal. 'inline': no
   * Modal wrapper, for DesktopSecondaryHost to place beside the sidebar. */
  presentation?: 'modal' | 'inline';
}

// Whichever tab is currently focused when this sheet is opened — used as the
// PostDetail back-destination, since the sheet itself is a modal reused from
// many different screens (Home, Discover, SearchSheet, Profile) rather than
// a route with a fixed origin.
function currentRouteName(navigation: any): string | undefined {
  try {
    const state = navigation.getState();
    return state?.routes?.[state.index]?.name;
  } catch {
    return undefined;
  }
}

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}


function makeStyles(c: Colors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    closeBtn: { paddingHorizontal: 4, paddingVertical: 4, minWidth: 30 },
    closeText: { fontSize: 16, fontWeight: '700', color: c.primary },
    topBarTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    ownProfileText: { fontSize: 15, color: c.textMuted, textAlign: 'center', lineHeight: 22 },

    content: { padding: 20 },

    // Bleeds past `content`'s own 20px padding so the cover photo reads as an
    // edge-to-edge social header, matching the redesigned own-Profile screen.
    hero: {
      marginHorizontal: -20,
      marginBottom: 20,
    },
    headerBannerWrap: { width: '100%', height: 160 },
    headerBannerWrapWide: { height: 120 },
    headerBannerImage: { width: '100%', height: 160 },
    headerBannerImageWide: { height: 120 },
    headerBannerPlaceholder: { width: '100%', height: 160, backgroundColor: c.cardLavender, overflow: 'hidden' },
    // Subtle abstract accents for Founder/Official profiles that haven't
    // uploaded a cover — replaces the old flat honey rectangle, which read as
    // an unfinished placeholder rather than a designed cover. Two soft,
    // low-opacity tinted circles bleeding off-canvas; no text/emoji/logo.
    bannerAccentCircleA: {
      position: 'absolute', width: 220, height: 220, borderRadius: 110,
      top: -130, right: -50, backgroundColor: c.cardHoney, opacity: 0.55,
    },
    bannerAccentCircleB: {
      position: 'absolute', width: 160, height: 160, borderRadius: 80,
      bottom: -90, left: -40, backgroundColor: c.cardBlush, opacity: 0.4,
    },
    avatarOverlapRow: { width: '100%', alignItems: 'center', marginTop: -52, marginBottom: 4 },
    avatarOverlapRowWide: { width: 'auto', alignItems: 'flex-start', marginTop: 0, marginBottom: 0 },
    heroWideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 20, paddingHorizontal: 24, marginTop: -48 },
    heroContentWrap: { width: '100%', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 4 },
    heroContentWrapWide: { flex: 1, width: undefined, alignItems: 'flex-start', paddingHorizontal: 0, paddingBottom: 4, paddingTop: 14 },
    avatarWrap: {
      width: 104,
      height: 104,
      borderRadius: 52,
      backgroundColor: c.avatarBg,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      borderWidth: 4,
      borderColor: c.bg,
    },
    avatarImage: { width: 96, height: 96, borderRadius: 48 },
    avatarInitial: { fontSize: 38, fontWeight: '800', color: c.primary },
    founderBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'center',
      backgroundColor: c.cardHoney,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginTop: 4,
      marginBottom: 6,
    },
    founderBadgeText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: c.honey,
    },

    heroName: {
      ...typography.screenTitle,
      color: c.textPrimary,
      marginBottom: 2,
      textAlign: 'center',
    },
    heroUsername: {
      fontSize: 14.5,
      color: c.textMuted,
      fontWeight: '600',
      marginBottom: 8,
      textAlign: 'center',
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
      gap: 28,
      justifyContent: 'center',
      width: '100%',
      marginTop: 4,
    },
    statItem: { alignItems: 'center' },
    statNum: { fontSize: 15, fontWeight: '800', color: c.textSecondary, marginBottom: 2 },
    statLbl: { fontSize: 11, color: c.textMuted, fontWeight: '500' },

    section: { marginBottom: 20 },
    sectionTitle: {
      ...typography.sectionTitle,
      color: c.textPrimary,
      marginBottom: 8,
    },
    babySnippet: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.separator,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    babySnippetText: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    commonBadge: {
      alignSelf: 'flex-start',
      backgroundColor: c.cardSage,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginBottom: 8,
    },
    commonBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
    },

    tabRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    tabBtn: { paddingVertical: 10, paddingHorizontal: 4, marginRight: 16, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabBtnActive: { borderBottomColor: c.primary },
    tabBtnText: { fontSize: 14, fontWeight: '700', color: c.textMuted },
    tabBtnTextActive: { color: c.textPrimary },
    emptyTabText: { fontSize: 13.5, color: c.textMuted, textAlign: 'center', paddingVertical: 20 },

  });
}

export default function PublicProfileSheet({ userId, visible, onClose, onMessage, dismissParents, presentation = 'modal' }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { isSubscribed } = useSubscription();
  const navigation = useNavigation<any>();
  const { width: windowWidth, isDesktop, isTablet } = useResponsive();
  const profileMaxWidth = maxWidthFor(windowWidth, 'profile');
  const isWideProfile = isDesktop || isTablet;
  const { pushSecondary } = useContext(AppContext);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [postCount, setPostCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [theirVillageIds, setTheirVillageIds] = useState<string[]>([]);
  const [myVillageIds, setMyVillageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [myId, setMyId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [canViewPosts, setCanViewPosts] = useState(false);
  const [profileTab, setProfileTab] = useState<'posts' | 'media'>('posts');
  const [baby, setBaby] = useState<PublicBaby | null>(null);
  const [feedVillage, setFeedVillage] = useState<Village | null>(null);
  const [joiningVillageId, setJoiningVillageId] = useState<string | null>(null);
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
    setPosts([]);
    setCanViewPosts(false);
    setProfileTab('posts');
    setBaby(null);
    setTheirVillageIds([]);
    setMyVillageIds([]);
    setPostCount(0);
    setFollowerCount(0);
    setFollowingCount(0);
    setIsFollowing(false);
    setIsBlocked(false);
    setIsMuted(false);
    setFollowRequestStatus('none');
    setShowReportUser(false);
    setReportUserDone(false);

    (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setMyId(user.id);

        if (user.id === userId) {
          // Opening your own identity from a post/comment should land you on
          // the real Profile tab rather than a dead-end "that's you"
          // placeholder — same dismiss-then-navigate pattern as openPost()
          // below. Done inline here (not as a separate effect watching an
          // `isOwnProfile` boolean) so the decision is always based on the
          // userId this exact fetch resolved for, never a stale flag left
          // over from a previous, different profile that was open earlier.
          onClose();
          dismissParents?.();
          navigation.navigate('Profile');
          return;
        }

        const [profileRes, postsCountRes, theirVillagesRes, myVillagesRes, followersRes, followingRes, isFollowingRes, blockRes, muteRes, followReqRes] = await Promise.all([
          (supabase as any).from('profiles').select('id,username,display_name,bio,avatar_url,header_url,parent_role,preferred_term,family_structure,family_structure_custom,show_villages,baby_info_private,pinned_post_id,is_private,is_founder,is_official').eq('id', userId).maybeSingle(),
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

        const profileData = profileRes.data ?? null;
        setProfile(profileData);
        setPostCount(postsCountRes.count ?? 0);
        setFollowerCount(followersRes.count ?? 0);
        setFollowingCount(followingRes.count ?? 0);
        setTheirVillageIds((theirVillagesRes.data ?? []).map((r: any) => r.village_id));
        setMyVillageIds((myVillagesRes.data ?? []).map((r: any) => r.village_id));
        const following = !!isFollowingRes.data;
        setIsFollowing(following);
        setIsBlocked(!!blockRes.data);
        setIsMuted(!!muteRes.data);
        setFollowRequestStatus(followReqRes.data?.status === 'pending' ? 'pending' : 'none');

        // Private accounts only reveal actual post content (pinned post,
        // Posts/Media tabs) to accepted followers — never fetched into state
        // before access is granted, not just hidden in the UI.
        const canView = !profileData?.is_private || following;
        setCanViewPosts(canView);
        if (canView) {
          const { data: postsData } = await supabase
            .from('posts')
            .select('id,user_id,author,content,post_type,created_at,likes,image_url,video_url,tags,is_sensitive,sensitive_label')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
          const authorProfile = { username: profileData?.username ?? null, display_name: profileData?.display_name ?? null };
          setPosts((postsData ?? []).map((p: any) => ({ ...p, profiles: authorProfile })));
        }

        if (!profileData?.baby_info_private) {
          const { data: babyData } = await supabase
            .from('babies')
            .select('name,birth_date,is_expecting')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();
          setBaby((babyData as any) ?? null);
        }
      } catch (err: any) {
        console.warn('PublicProfileSheet error:', err.message);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, userId, retryTick]);

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

  // Reuses the same Patch join/leave mutation Discover and Home's search use —
  // membership can be changed from any profile that shows the chip, not just
  // the viewer's own.
  async function toggleVillageMembership(villageId: string) {
    setJoiningVillageId(villageId);
    const wasJoined = myVillageIds.includes(villageId);
    const { error } = wasJoined ? await leavePatch(villageId) : await joinPatch(villageId);
    if (error) {
      Alert.alert('Something went wrong', wasJoined ? "Couldn't leave this patch. Please try again." : "Couldn't join this patch. Please try again.");
    } else if (wasJoined) {
      setMyVillageIds(prev => prev.filter(id => id !== villageId));
    } else {
      setMyVillageIds(prev => [...prev, villageId]);
    }
    setJoiningVillageId(null);
  }

  function openPost(post: FeedPost) {
    onClose();
    dismissParents?.();
    navigation.navigate('PostDetail', { postId: post.id, origin: currentRouteName(navigation) });
  }

  function openVillageFeed(v: Village) {
    if (isDesktop) pushSecondary({ type: 'villageFeed', villageId: v.id });
    else setFeedVillage(v);
  }

  const commonIds = theirVillageIds.filter(id => myVillageIds.includes(id));
  const displayName = profile?.display_name || profile?.username || 'Parent';
  const initial = displayName.charAt(0).toUpperCase();
  const showVillages = profile?.show_villages !== false;
  const isAdmin = profile?.is_founder === true;
  const isOfficial = profile?.is_official === true;
  const isGoldTier = isAdmin || isOfficial;
  const theirVillages = villagesByIds(theirVillageIds);

  const familyLabel = profile?.family_structure === 'Other' ? profile?.family_structure_custom : profile?.family_structure;
  const identityLine = [profile?.parent_role || profile?.preferred_term || null, familyLabel].filter(Boolean).join(' · ');

  const sortedPosts = useMemo(() => {
    const pinnedId = profile?.pinned_post_id;
    if (!pinnedId) return posts;
    const pinned = posts.find(p => p.id === pinnedId);
    const rest = posts.filter(p => p.id !== pinnedId);
    return pinned ? [pinned, ...rest] : posts;
  }, [posts, profile?.pinned_post_id]);
  const mediaPosts = useMemo(() => posts.filter(p => p.image_url || p.video_url), [posts]);

  if (presentation === 'inline' && !visible) return null;
  const Wrapper: any = presentation === 'modal' ? Modal : React.Fragment;
  const wrapperProps: any = presentation === 'modal'
    ? { visible, animationType: 'slide', presentationStyle: 'pageSheet', onRequestClose: onClose }
    : {};

  return (
    <Wrapper {...wrapperProps}>
      <SafeAreaView style={s.safeArea}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7} hitSlop={hitSlopFor(24)}
            accessibilityRole="button" accessibilityLabel={presentation === 'inline' ? 'Back' : 'Close'}>
            {presentation === 'inline'
              ? <Ionicons name="chevron-back" size={22} color={c.textPrimary} />
              : <Text style={s.closeText}>Done</Text>}
          </TouchableOpacity>
          <Text style={s.topBarTitle}>Profile</Text>
          <View style={{ width: 30 }} />
        </View>

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={c.primary} size="large" />
          </View>
        ) : loadError ? (
          <View style={s.center}>
            <LoadErrorBanner message="Couldn't load this profile." onRetry={() => setRetryTick(t => t + 1)} />
          </View>
        ) : !profile ? (
          <View style={s.center}>
            <Text style={s.ownProfileText}>Profile not found.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[s.content, { width: '100%', maxWidth: profileMaxWidth, alignSelf: 'center' }]} showsVerticalScrollIndicator={false}>
            {/* Hero */}
            <View style={s.hero}>
              {/* Cover — edge-to-edge, matching the redesigned own-Profile header */}
              <View style={[s.headerBannerWrap, isWideProfile && s.headerBannerWrapWide]}>
                {profile.header_url ? (
                  <Image source={{ uri: profile.header_url }} style={[s.headerBannerImage, isWideProfile && s.headerBannerImageWide]} resizeMode="cover" />
                ) : (
                  <View style={[s.headerBannerPlaceholder, isWideProfile && s.headerBannerImageWide]}>
                    {isGoldTier && (
                      <>
                        <View style={s.bannerAccentCircleA} />
                        <View style={s.bannerAccentCircleB} />
                      </>
                    )}
                  </View>
                )}
              </View>

              <View style={isWideProfile ? s.heroWideRow : undefined}>
              <View style={[s.avatarOverlapRow, isWideProfile && s.avatarOverlapRowWide]}>
                <View style={s.avatarWrap}>
                  {profile.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={s.avatarImage} />
                  ) : (
                    <Text style={s.avatarInitial}>{initial}</Text>
                  )}
                </View>
              </View>

              <View style={[s.heroContentWrap, isWideProfile && s.heroContentWrapWide]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[s.heroName, isWideProfile && { textAlign: 'left' }]}>{displayName}</Text>
                {profile.is_private && <Ionicons name="lock-closed" size={15} color={c.textMuted} />}
              </View>

              {isGoldTier && (
                <View style={[s.founderBadge, isWideProfile && { alignSelf: 'flex-start' }]}>
                  <Ionicons name={isAdmin ? 'ribbon' : 'leaf'} size={13} color={isAdmin ? c.honey : c.sage} />
                  <Text style={s.founderBadgeText}>
                    {isAdmin ? 'Founder of Parent Patch' : 'Official Parent Patch Account'}
                  </Text>
                </View>
              )}

              {(profile.username || identityLine) && (
                <Text style={[s.heroUsername, isWideProfile && { textAlign: 'left' }]}>
                  {profile.username ? `@${profile.username}` : ''}
                  {profile.username && identityLine ? '  ·  ' : ''}
                  {identityLine}
                </Text>
              )}
              {profile.bio ? (
                <Text style={[s.heroBio, isWideProfile && { textAlign: 'left' }]}>{profile.bio}</Text>
              ) : null}

              {/* Social stats — Patches is a community count, kept out of
                  this row and shown in its own section below instead. */}
              <View style={[s.statsRow, isWideProfile && { justifyContent: 'flex-start', width: 'auto' }]}>
                <View style={s.statItem}>
                  <Text style={s.statNum}>{postCount}</Text>
                  <Text style={s.statLbl}>Posts</Text>
                </View>
                <View style={s.statItem}>
                  <Text style={s.statNum}>{followingCount}</Text>
                  <Text style={s.statLbl}>Following</Text>
                </View>
                <View style={s.statItem}>
                  <Text style={s.statNum}>{followerCount}</Text>
                  <Text style={s.statLbl}>Followers</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
                {!isBlocked && (
                  <TouchableOpacity
                    onPress={toggleFollow}
                    disabled={followLoading}
                    activeOpacity={0.85}
                    hitSlop={hitSlopFor(34)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: isFollowing || followRequestStatus === 'pending' ? c.card : c.primary,
                      borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10,
                      borderWidth: isFollowing || followRequestStatus === 'pending' ? 1.5 : 0,
                      borderColor: c.separator,
                    }}
                  >
                    <Ionicons
                      name={isFollowing ? 'checkmark' : followRequestStatus === 'pending' ? 'time-outline' : 'add'}
                      size={15}
                      color={isFollowing || followRequestStatus === 'pending' ? c.textPrimary : c.primaryText}
                    />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: isFollowing || followRequestStatus === 'pending' ? c.textPrimary : c.primaryText }}>
                      {isFollowing ? 'Following' : followRequestStatus === 'pending' ? 'Requested' : 'Follow'}
                    </Text>
                  </TouchableOpacity>
                )}
                {!isBlocked && (
                  <TouchableOpacity
                    onPress={toggleMute}
                    disabled={muteLoading}
                    activeOpacity={0.85}
                    hitSlop={hitSlopFor(34)}
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
                          <Ionicons name={isMuted ? 'volume-mute' : 'volume-mute-outline'} size={15} color={c.textPrimary} />
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
                    hitSlop={hitSlopFor(34)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: c.card, borderRadius: 20,
                      paddingHorizontal: 20, paddingVertical: 10,
                      borderWidth: 1.5, borderColor: c.separator,
                    }}
                  >
                    <Ionicons name="chatbubble-outline" size={15} color={c.textPrimary} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>Message</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => { setShowReportUser(true); setReportUserReason(''); setReportUserDone(false); }}
                  activeOpacity={0.85}
                  hitSlop={hitSlopFor(34)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: c.card, borderRadius: 20,
                    paddingHorizontal: 16, paddingVertical: 10,
                    borderWidth: 1.5, borderColor: c.separator,
                  }}
                >
                  <Ionicons name="flag-outline" size={15} color={c.textPrimary} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>Report</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleBlock}
                  disabled={blockLoading}
                  activeOpacity={0.85}
                  hitSlop={hitSlopFor(34)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: c.card, borderRadius: 20,
                    paddingHorizontal: 16, paddingVertical: 10,
                    borderWidth: 1.5, borderColor: isBlocked ? c.signOut : c.separator,
                  }}
                >
                  {blockLoading
                    ? <ActivityIndicator size="small" color={c.signOut} />
                    : <>
                        <Ionicons name="ban-outline" size={15} color={isBlocked ? c.signOut : c.textPrimary} />
                        <Text style={{ fontSize: 14, fontWeight: '700', color: isBlocked ? c.signOut : c.textPrimary }}>
                          {isBlocked ? 'Unblock' : 'Block'}
                        </Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
              </View>
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

            {/* Family — secondary to the social identity above, respects baby_info_private */}
            {baby && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Family</Text>
                <View style={s.babySnippet}>
                  <Text style={s.babySnippetText}>
                    👶 {baby.is_expecting ? 'Expecting' : baby.name}
                  </Text>
                </View>
              </View>
            )}

            {/* Patches — community identity, tappable into the real feed */}
            <View style={s.section}>
              {isSubscribed && showVillages && commonIds.length > 0 && (
                <View style={s.commonBadge}>
                  <Text style={s.commonBadgeText}>🏘️ {commonIds.length} in common</Text>
                </View>
              )}
              <PatchChipRow
                title="Patches"
                villages={showVillages ? theirVillages : []}
                onPressVillage={(v) => openVillageFeed(v)}
                emptyTitle={showVillages ? 'No Patches yet' : "This user's patches are private."}
              />
            </View>

            {/* Posts / Media — gated behind canViewPosts, which is false for
                a private account the viewer doesn't follow (never fetched,
                not just hidden). */}
            {canViewPosts && (
              <View style={s.section}>
                <View style={s.tabRow}>
                  <TouchableOpacity
                    style={[s.tabBtn, profileTab === 'posts' && s.tabBtnActive]}
                    onPress={() => setProfileTab('posts')}
                    hitSlop={hitSlopFor(34)}
                    accessibilityRole="button" accessibilityState={{ selected: profileTab === 'posts' }} accessibilityLabel="Posts tab"
                  >
                    <Text style={[s.tabBtnText, profileTab === 'posts' && s.tabBtnTextActive]}>Posts</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.tabBtn, profileTab === 'media' && s.tabBtnActive]}
                    onPress={() => setProfileTab('media')}
                    hitSlop={hitSlopFor(34)}
                    accessibilityRole="button" accessibilityState={{ selected: profileTab === 'media' }} accessibilityLabel="Media tab"
                  >
                    <Text style={[s.tabBtnText, profileTab === 'media' && s.tabBtnTextActive]}>Media</Text>
                  </TouchableOpacity>
                </View>

                {profileTab === 'posts' ? (
                  sortedPosts.length === 0 ? (
                    <Text style={s.emptyTabText}>No posts yet</Text>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {sortedPosts.map(post => (
                        <PostPreviewCard
                          key={post.id}
                          post={post}
                          pinned={profile.pinned_post_id === post.id}
                          variant="profile"
                          onPress={() => openPost(post)}
                          onPressVillage={(id) => { const [v] = villagesByIds([id]); if (v) openVillageFeed(v); }}
                        />
                      ))}
                    </View>
                  )
                ) : (
                  mediaPosts.length === 0 ? (
                    <Text style={s.emptyTabText}>No media yet</Text>
                  ) : (
                    <ProfileMediaGrid posts={mediaPosts} onPressPost={openPost} />
                  )
                )}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Report user modal */}
      <ConfinedOverlay
        visible={showReportUser}
        presentation={presentation}
        onRequestClose={() => setShowReportUser(false)}
        maxWidth={480}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 14,
            borderBottomWidth: 1, borderBottomColor: c.separator,
          }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>Report User</Text>
            <TouchableOpacity onPress={() => setShowReportUser(false)} hitSlop={hitSlopFor(18)}
              accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={c.textMuted} />
            </TouchableOpacity>
          </View>
          {reportUserDone ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 }}>
              <Ionicons name="checkmark-circle" size={40} color={c.sage} />
              <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>Report Submitted</Text>
              <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 }}>
                Thank you for helping keep the community safe. We'll review this account.
              </Text>
              <TouchableOpacity
                onPress={() => setShowReportUser(false)}
                style={{ marginTop: 8, backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 28, paddingVertical: 12 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.primaryText }}>Close</Text>
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
                  ? <ActivityIndicator color={c.primaryText} />
                  : <Text style={{ fontSize: 15, fontWeight: '700', color: c.primaryText }}>Submit Report</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </ConfinedOverlay>

      {!isDesktop && (
        <VillageFeedSheet
          village={feedVillage}
          visible={feedVillage !== null}
          onClose={() => setFeedVillage(null)}
          joined={feedVillage !== null && myVillageIds.includes(feedVillage.id)}
          onToggleJoin={() => feedVillage && toggleVillageMembership(feedVillage.id)}
        />
      )}
    </Wrapper>
  );
}
