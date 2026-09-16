import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Share,
  Image,
  Linking,
  RefreshControl,
} from 'react-native';
import MentionTextInput from '../components/MentionTextInput';
import { Ionicons } from '@expo/vector-icons';
import { hitSlopFor } from '../lib/accessibility';
import { useResponsive, maxWidthFor } from '../lib/responsive';
import { restoreScrollFocus } from '../lib/webFocus';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AppContext } from '../lib/AppContext';
import CoachMarkTour, { CoachMarkStep } from '../components/CoachMarkTour';
import UserAvatar from '../components/UserAvatar';
import BabyProfileSheet from './BabyProfileSheet';
import PublicProfileSheet from './PublicProfileSheet';
import SearchSheet from './SearchSheet';
import QAScreen from './QAScreen';
import MessagesInbox from './MessagesInbox';
import NotificationsScreen from './NotificationsScreen';
import HandoffNotesSheet from '../components/HandoffNotesSheet';
import { useBaby } from '../lib/babyContext';
import { VILLAGE_MAP, Village, villagesByIds } from '../lib/villageData';
import VillageFeedSheet from './VillageFeedSheet';
import { joinPatch, leavePatch, trendingTagsFromPosts } from '../lib/discoverData';
import { useColors, Colors } from '../lib/theme';
import { typography } from '../lib/typography';
import LoadErrorBanner from '../components/LoadErrorBanner';
import StoriesBar, { StoryGroup } from '../components/StoriesBar';
import HomeIconRow from '../components/home/HomeIconRow';
import UpcomingEventsCard from '../components/home/UpcomingEventsCard';
import StoryViewer from '../components/StoryViewer';
import { moderateImage } from '../lib/contentModeration';
import ContentBlockedModal, { ContentType } from '../components/ContentBlockedModal';

import {
  Post, Comment, Stats, Reminder,
  POST_TAGS, MENTAL_HEALTH_KEYWORDS, PART_LIMITS, PART_LABELS,
} from '../types/feed';
import {
  todayRange, greetingFor, getBabyAge, getTimeAgo, resolveAuthorName, attachAuthorProfiles,
  showSourcePicker, uploadPostImage, uploadPostVideo,
  extractMentions, sendMentionNotifications, renderTextWithMentions,
  buildCommentTree, toggleReactionMutation, toggleRepostMutation, castPollVoteMutation,
} from '../lib/feedUtils.tsx';
import { VideoPostPlayer } from '../components/feed/VideoPostPlayer';
import { safeQuery, cacheSet, cacheGetStale } from '../lib/syncService';
import { useOneHanded } from '../lib/OneHandedContext';
import { useSubscription } from '../lib/subscriptionContext';
import TipOfTheDayCard from '../components/TipOfTheDayCard';
import FeedInsert from '../components/feed/FeedInsert';
import PatchLabel from '../components/feed/PatchLabel';
import PostTypeBadge from '../components/feed/PostTypeBadge';
import PostOptionsButton from '../components/feed/PostOptionsButton';
import HomeRightRail from '../components/home/HomeRightRail';
import { track, screenView } from '../lib/analytics';

async function fetchLatestHandoffNote(babyId: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from('handoff_notes')
    .select('note')
    .eq('baby_id', babyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.note ?? null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeTab() {
  const c = useColors();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { isOneHanded } = useOneHanded();
  const { width: windowWidth, isDesktop } = useResponsive();
  const feedMaxWidth = maxWidthFor(windowWidth, 'feed');
  const insets = useSafeAreaInsets();
  const { isSubscribed } = useSubscription();

  const [stats, setStats] = useState<Stats>({ feeds: 0, diapers: 0, pumpedMl: 0 });
  const [loading, setLoading] = useState(true);

  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoadError, setPostsLoadError] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postType, setPostType] = useState<Post['post_type']>('text');

  const [myReactions, setMyReactions] = useState<Map<string, string>>(new Map());
  const [reactionCounts, setReactionCounts] = useState<Map<string, Record<string, number>>>(new Map());
  const [reactionPickerPostId, setReactionPickerPostId] = useState<string | null>(null);
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [repostCounts, setRepostCounts] = useState<Map<string, number>>(new Map());
  const [myRepostIds, setMyRepostIds] = useState<Set<string>>(new Set());
  const [followingUserIds, setFollowingUserIds] = useState<Set<string>>(new Set());
  const [pollData, setPollData] = useState<Map<string, { options: { id: string; text: string; vote_count: number }[]; myVoteId: string | null }>>(new Map());
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [reportedPostIds, setReportedPostIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [reportCommentReason, setReportCommentReason] = useState('');
  const [reportCommentSubmitting, setReportCommentSubmitting] = useState(false);
  const [reportCommentDone, setReportCommentDone] = useState(false);
  const [reportedCommentIds, setReportedCommentIds] = useState<Set<string>>(new Set());
  const [pendingPostImageUri, setPendingPostImageUri] = useState<string | null>(null);
  const [pendingPostVideoUri, setPendingPostVideoUri] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [blockedContent, setBlockedContent] = useState<{ severity: 'high' | 'extreme'; reason: string; contentType: ContentType } | null>(null);
  const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set());
  const [privateUnfollowedIds, setPrivateUnfollowedIds] = useState<Set<string>>(new Set());
  const [revealedSensitiveIds, setRevealedSensitiveIds] = useState<Set<string>>(new Set());
  const [wordFilter, setWordFilter] = useState<string[]>([]);
  const [dismissedHealthBanner, setDismissedHealthBanner] = useState(false);
  const [isSensitive, setIsSensitive] = useState(false);
  const [sensitiveLabel, setSensitiveLabel] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [activePostType, setActivePostType] = useState<Post['post_type'] | null>(null);

  // The topic-chip row used to live here; it's moved to Discover's Trending
  // Topics now, which navigates back with this param instead — same filter
  // state and logic, just driven from outside instead of an always-visible
  // row of chips.
  useEffect(() => {
    if (route?.params?.filterTag) setActiveTag(route.params.filterTag);
  }, [route?.params?.filterTag]);

  // Set by tapping "See more <Type>s" in a PostTypeBadge's info popover,
  // wherever that badge is rendered (Home, Discover previews, Search,
  // Patch feed) — same route-param handoff as filterTag above.
  useEffect(() => {
    if (route?.params?.filterPostType) setActivePostType(route.params.filterPostType);
  }, [route?.params?.filterPostType]);
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [baby, setBaby] = useState<{ name: string; birth_date: string | null; due_date: string | null; is_expecting: boolean | null; photo_url: string | null; gender: string | null } | null>(null);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [showHandoffNotes, setShowHandoffNotes] = useState(false);
  const [latestHandoffNote, setLatestHandoffNote] = useState<string | null>(null);
  const [publicProfileUserId, setPublicProfileUserId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [messageTargetUserId, setMessageTargetUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [suppliesSnap, setSuppliesSnap] = useState<{
    formula: number | null; formulaLow: boolean;
    diapers: number | null; diapersLow: boolean;
    milkOz: number;
  } | null>(null);
  const [followedQuestions, setFollowedQuestions] = useState<Array<{
    id: string; author: string; content: string; topic: string;
    vote_score: number; answer_count: number; created_at: string;
  }>>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Array<{
    id: string; title: string; starts_at: string; all_day: boolean; calendar_type: 'personal' | 'shared';
  }>>([]);
  const [qaDetailId, setQaDetailId] = useState<string | null>(null);

  const { activeBaby } = useBaby();

  useFocusEffect(useCallback(() => {
    if (!activeBaby?.id) { setLatestHandoffNote(null); return; }
    fetchLatestHandoffNote(activeBaby.id).then(setLatestHandoffNote);
  }, [activeBaby?.id]));

  useEffect(() => { screenView('HomeTab'); }, []);

  // App tour (coach marks)
  const { tourRequestId, requestCreate, createAction } = useContext(AppContext);
  const [tourVisible, setTourVisible] = useState(false);
  const lastHandledTourRequestId = useRef(0);
  const lastHandledCreateActionId = useRef(0);
  const mainScrollRef = useRef<ScrollView>(null);
  const mainScrollYRef = useRef(0);

  // Web: react-native-web's <body> doesn't scroll (each screen owns its own
  // ScrollView), so keyboard arrow/PageUp/PageDown scrolling only works while
  // focus sits inside it. Restore focus here whenever this tab gains focus —
  // it's a no-op if focus is already somewhere more specific (a text input,
  // an open modal's own control), see restoreScrollFocus().
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'web') return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return;
    (mainScrollRef.current as any)?.getScrollableNode?.()?.focus?.();
  }, []));
  const iconRowRef = useRef<View>(null);
  const storiesRef = useRef<View>(null);
  const fabRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);

  // Stories
  const [storyViewGroups, setStoryViewGroups] = useState<StoryGroup[]>([]);
  const [storyViewGroupIndex, setStoryViewGroupIndex] = useState(0);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [showAddStory, setShowAddStory] = useState(false);
  const [storyMode, setStoryMode] = useState<'photo' | 'video' | 'text'>('photo');
  const [storyText, setStoryText] = useState('');
  const [storyBgColor, setStoryBgColor] = useState('#B1A7F0');
  const [storyImageUri, setStoryImageUri] = useState<string | null>(null);
  const [storyVideoUri, setStoryVideoUri] = useState<string | null>(null);
  const [storySubmitting, setStorySubmitting] = useState(false);
  const [storyRefreshKey, setStoryRefreshKey] = useState(0);
  const [streakRefreshKey, setStreakRefreshKey] = useState(0);

  const [feedMode, setFeedMode] = useState<'for-you' | 'following' | 'friends' | 'patches'>('for-you');
  const [refreshing, setRefreshing] = useState(false);
  // Gates the feed empty-state copy so "No posts yet" / "Not following
  // anyone" can't flash on screen before the very first fetch resolves.
  // Only applies once per app session — later refocuses reuse cached data.
  const [feedInitialLoading, setFeedInitialLoading] = useState(true);
  const hasLoadedFeedOnce = useRef(false);
  const [followingPosts, setFollowingPosts] = useState<Post[]>([]);
  const [friendsPosts, setFriendsPosts] = useState<Post[]>([]);
  // Posts from the user's joined Patches — the "Patches" feed tab. Separate
  // from myVillageIdsSet below only in that this is the fetched content;
  // myVillageIdsSet is membership, reused by the tappable Patch tag on any post.
  const [patchesPosts, setPatchesPosts] = useState<Post[]>([]);
  const [myVillageIdsSet, setMyVillageIdsSet] = useState<Set<string>>(new Set());
  const [feedVillage, setFeedVillage] = useState<Village | null>(null);
  const [joiningVillageId, setJoiningVillageId] = useState<string | null>(null);

  const filteredPosts = useMemo(() => {
    const source = feedMode === 'following' ? followingPosts
      : feedMode === 'friends' ? friendsPosts
      : feedMode === 'patches' ? patchesPosts
      : posts;
    let result = source.filter(p =>
      !blockedUserIds.has(p.user_id) &&
      !mutedUserIds.has(p.user_id) &&
      (p.user_id === currentUserId || !privateUnfollowedIds.has(p.user_id))
    );
    if (wordFilter.length > 0) {
      result = result.filter(p => {
        const lower = (p.content ?? '').toLowerCase();
        return !wordFilter.some(w => lower.includes(w));
      });
    }
    if (activeHashtag) result = result.filter(p => p.content?.toLowerCase().includes(`#${activeHashtag.toLowerCase()}`));
    if (activeTag) result = result.filter(p => p.tags?.includes(activeTag));
    if (activePostType) result = result.filter(p => p.post_type === activePostType);
    return result;
  }, [posts, followingPosts, friendsPosts, patchesPosts, feedMode, activeHashtag, activeTag, activePostType, blockedUserIds, mutedUserIds, privateUnfollowedIds, currentUserId, wordFilter]);

  const greeting = greetingFor(new Date().getHours(), displayName ?? undefined);

  // Desktop right rail data — reuses state Home already fetches for its own
  // feed/trending carousel, never a separate fetch. See HomeRightRail.
  const railJoinedVillages = useMemo(
    () => villagesByIds([...myVillageIdsSet]).filter(v => !v.hidden),
    [myVillageIdsSet],
  );
  const railTrendingTags = useMemo(() => trendingTagsFromPosts(trendingPosts, 8), [trendingPosts]);

  // ── Parent Patch feed inserts ─────────────────────────────────────────────
  // A small, deliberately limited set of branded utility cards woven into the
  // feed (never stacked at the top). The rest of Step 5's dashboard cards
  // (streak, supplies snapshot, baby profile) stay in their own component
  // files, untouched, for a future phase to surface elsewhere — Home just
  // doesn't render them at the top any more.
  type FeedInsertItem = { key: string; node: React.ReactNode };

  const feedInserts = useMemo<FeedInsertItem[]>(() => {
    const items: FeedInsertItem[] = [];

    if (baby && !loading) {
      const parts = [
        `${stats.feeds} feed${stats.feeds === 1 ? '' : 's'}`,
        `${stats.diapers} diaper${stats.diapers === 1 ? '' : 's'}`,
      ];
      if (stats.pumpedMl > 0) parts.push(`${stats.pumpedMl}ml pumped`);
      items.push({
        key: 'insert-today',
        node: (
          <FeedInsert
            accent="lavender"
            icon="today-outline"
            title={`${greeting.text} — today with ${baby.name}`}
            body={parts.join(' · ')}
            ctaLabel="View today"
            onPress={() => setShowProfileSheet(true)}
          />
        ),
      });
    }

    if (reminders.length > 0) {
      items.push({
        key: 'insert-reminder',
        node: (
          <FeedInsert
            accent="honey"
            icon="notifications-outline"
            title="Parent Patch reminder"
            body={reminders[0].text}
            ctaLabel="Log now"
            onPress={() => navigation.navigate('Track')}
          />
        ),
      });
    }

    if (isSubscribed && upcomingEvents.length > 0) {
      items.push({
        key: 'insert-upcoming',
        node: <UpcomingEventsCard events={upcomingEvents} onPress={() => navigation.navigate('Calendar')} />,
      });
    }

    if (activeBaby && latestHandoffNote) {
      items.push({
        key: 'insert-handoff',
        node: (
          <FeedInsert
            accent="blue"
            icon="chatbubble-ellipses-outline"
            title="Handoff note"
            body={latestHandoffNote}
            ctaLabel="View"
            onPress={() => setShowHandoffNotes(true)}
          />
        ),
      });
    }

    items.push({
      key: 'insert-tip',
      node: <TipOfTheDayCard onPress={(resourceId) => navigation.navigate('Discover', { initialResourceId: resourceId })} />,
    });

    return items;
  }, [baby, loading, stats, greeting, reminders, isSubscribed, upcomingEvents, activeBaby, latestHandoffNote, navigation]);

  // Interleave inserts roughly every 4 posts instead of stacking them at the
  // top — each insert appears at most once per feed load.
  const feedItems = useMemo(() => {
    const items: Array<{ kind: 'post'; post: Post } | { kind: 'insert'; key: string; node: React.ReactNode }> = [];
    let insertIdx = 0;
    filteredPosts.forEach((post, i) => {
      items.push({ kind: 'post', post });
      if (insertIdx < feedInserts.length && (i + 1) % 4 === 0) {
        items.push({ kind: 'insert', key: feedInserts[insertIdx].key, node: feedInserts[insertIdx].node });
        insertIdx++;
      }
    });
    return items;
  }, [filteredPosts, feedInserts]);

  const showMentalHealthBanner = useMemo(() => {
    if (!postContent.trim()) return false;
    const lower = postContent.toLowerCase();
    return MENTAL_HEALTH_KEYWORDS.some(kw => lower.includes(kw));
  }, [postContent]);

  useEffect(() => {
    // fetchPosts/fetchFollowingPosts/fetchFriendsPosts/fetchPatchesPosts/
    // fetchFollowingIds/fetchTrendingPosts are intentionally NOT called here —
    // the useFocusEffect below already fires on initial mount (React
    // Navigation runs a focus effect immediately if the screen is focused
    // when it mounts), so calling them here too used to double-fetch and
    // double-enrich all four feeds on cold start.
    fetchSavedPosts();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
        fetchUnreadCount(user.id);
        fetchUnreadNotifCount(user.id);
        fetchBlockedUsers(user.id);
        fetchMutedUsers(user.id);
        fetchPrivateFilter(user.id);
        fetchWordFilter(user.id);
        supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
          .then(({ data }) => { if ((data as any)?.display_name) setDisplayName((data as any).display_name); })
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  async function fetchBlockedUsers(uid: string) {
    const { data } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', uid);
    if (data) setBlockedUserIds(new Set(data.map((r: any) => r.blocked_id)));
  }

  async function fetchMutedUsers(uid: string) {
    const { data } = await supabase.from('user_mutes').select('muted_id').eq('muter_id', uid);
    if (data) setMutedUserIds(new Set(data.map((r: any) => r.muted_id)));
  }

  async function fetchPrivateFilter(uid: string) {
    const [followingRes, privateRes] = await Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', uid),
      supabase.from('profiles').select('id').eq('is_private', true).neq('id', uid),
    ]);
    const followingSet = new Set((followingRes.data ?? []).map((r: any) => r.following_id));
    const privateIds = (privateRes.data ?? []).map((r: any) => r.id);
    setPrivateUnfollowedIds(new Set(privateIds.filter((id: string) => !followingSet.has(id))));
  }

  async function fetchWordFilter(uid: string) {
    const { data } = await (supabase as any).from('user_word_filters').select('word').eq('user_id', uid);
    if (data) setWordFilter(data.map((r: any) => r.word));
  }

  async function fetchUnreadCount(uid: string) {
    const { data: convs } = await supabase
      .from('conversations')
      .select('id')
      .or(`participant_1.eq.${uid},participant_2.eq.${uid}`);
    if (!convs || convs.length === 0) return;
    const convIds = convs.map((c: any) => c.id);
    const { count } = await supabase
      .from('direct_messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', convIds)
      .neq('sender_id', uid)
      .is('read_at', null);
    setUnreadCount(count ?? 0);
  }

  async function fetchUnreadNotifCount(uid: string) {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('read', false);
    setUnreadNotifCount(count ?? 0);
  }

  async function fetchPosts() {
    setPostsLoadError(false);
    try {
    const { data: { user } } = await supabase.auth.getUser();

    // ── Phase 1: pool + user context in parallel ───────────────────────────────
    const [poolRes, villagesRes, myReactedRes, myCommentedRes] = await Promise.all([
      supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(80),
      user
        ? supabase.from('user_villages').select('village_id').eq('user_id', user.id)
        : Promise.resolve({ data: [] }),
      user
        ? supabase.from('post_reactions').select('post_id').eq('user_id', user.id)
        : Promise.resolve({ data: [] }),
      user
        ? supabase.from('comments').select('post_id').eq('user_id', user.id)
        : Promise.resolve({ data: [] }),
    ]);

    const pool: Post[] = await attachAuthorProfiles((poolRes.data as Post[]) ?? []);
    if (pool.length === 0) { setPosts([]); return; }

    const userVillageIds = new Set<string>((villagesRes.data ?? []).map((r: any) => r.village_id));
    const myEngagedPostIds = new Set<string>([
      ...(myReactedRes.data ?? []).map((r: any) => r.post_id),
      ...(myCommentedRes.data ?? []).map((r: any) => r.post_id),
    ]);

    // ── Phase 2: engagement counts for the pool ────────────────────────────────
    const poolIds = pool.map(p => p.id);
    const [allReactionsRes, allCommentsRes] = await Promise.all([
      supabase.from('post_reactions').select('post_id').in('post_id', poolIds),
      supabase.from('comments').select('post_id').in('post_id', poolIds),
    ]);

    const reactionsPerPost = new Map<string, number>();
    (allReactionsRes.data ?? []).forEach((r: any) =>
      reactionsPerPost.set(r.post_id, (reactionsPerPost.get(r.post_id) || 0) + 1));

    const commentsPerPost = new Map<string, number>();
    (allCommentsRes.data ?? []).forEach((r: any) =>
      commentsPerPost.set(r.post_id, (commentsPerPost.get(r.post_id) || 0) + 1));

    // ── Phase 3: build affinity signals ───────────────────────────────────────
    // Preferred tags + authors come from pool posts the user has already engaged with
    const preferredTags = new Set<string>();
    const preferredAuthorIds = new Set<string>();
    pool.filter(p => myEngagedPostIds.has(p.id)).forEach(p => {
      (p.tags ?? []).forEach(t => preferredTags.add(t));
      preferredAuthorIds.add(p.user_id);
    });

    // ── Phase 4: score every post ─────────────────────────────────────────────
    const now = Date.now();
    const scored = pool.map(post => {
      const hoursOld = (now - new Date(post.created_at).getTime()) / 3600000;

      // Decays ~1.5 pts/hr; a 24h-old post scores ~64, a 48h-old post ~28
      const recencyScore    = Math.max(0, 100 - hoursOld * 1.5);

      const reactions       = reactionsPerPost.get(post.id) || 0;
      const commentCount    = commentsPerPost.get(post.id) || 0;
      const engagementScore = (post.likes || 0) * 1 + reactions * 2 + commentCount * 4;

      // Personalisation bonuses
      const villageScore = post.village_id && userVillageIds.has(post.village_id) ? 35 : 0;
      const tagScore     = (post.tags ?? []).filter(t => preferredTags.has(t)).length * 20;
      const authorScore  = preferredAuthorIds.has(post.user_id) ? 25 : 0;

      // Slight boost for questions to surface discussion-worthy posts
      const typeBoost = post.post_type === 'question' ? 8 : 0;

      return { post, score: recencyScore + engagementScore + villageScore + tagScore + authorScore + typeBoost };
    });

    scored.sort((a, b) => b.score - a.score);

    // ── Phase 5: diversity — max 3 posts per author in the final 20 ───────────
    const authorCount = new Map<string, number>();
    const finalPosts: Post[] = [];
    for (const { post } of scored) {
      const c = authorCount.get(post.user_id) || 0;
      if (c >= 3) continue;
      authorCount.set(post.user_id, c + 1);
      finalPosts.push(post);
      if (finalPosts.length >= 20) break;
    }

    setPosts(finalPosts);
    if (finalPosts.length > 0) {
      fetchReactions(finalPosts);
      fetchPollData(finalPosts);
      fetchRepostData(finalPosts);
    }
    } catch (err: any) {
      console.warn('HomeTab fetchPosts error:', err.message);
      setPostsLoadError(true);
    }
  }

  async function fetchFollowingPosts() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: followRows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    const followingUserIds = (followRows ?? []).map((r: any) => r.following_id);

    if (followingUserIds.length === 0) {
      setFollowingPosts([]);
      return;
    }

    const { data } = await supabase
      .from('posts')
      .select('*')
      .in('user_id', followingUserIds)
      .order('created_at', { ascending: false })
      .limit(40);

    const result: Post[] = (data as Post[]) ?? [];
    setFollowingPosts(result);
    if (result.length > 0) {
      fetchReactions(result);
      fetchPollData(result);
      fetchRepostData(result);
    }
  }

  async function fetchFriendsPosts() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Friends = mutual follows: people you follow who also follow you back
    const [followingRes, followersRes] = await Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', user.id),
      supabase.from('follows').select('follower_id').eq('following_id', user.id),
    ]);

    const followingSet = new Set((followingRes.data ?? []).map((r: any) => r.following_id));
    const followerSet  = new Set((followersRes.data ?? []).map((r: any) => r.follower_id));
    const friendIds    = [...followingSet].filter(id => followerSet.has(id));

    if (friendIds.length === 0) {
      setFriendsPosts([]);
      return;
    }

    const { data } = await supabase
      .from('posts')
      .select('*')
      .in('user_id', friendIds)
      .order('created_at', { ascending: false })
      .limit(40);

    const result: Post[] = (data as Post[]) ?? [];
    setFriendsPosts(result);
    if (result.length > 0) {
      fetchReactions(result);
      fetchPollData(result);
      fetchRepostData(result);
    }
  }

  // Posts from Patches the user has joined — the Home "Patches" tab. Mirrors
  // fetchFollowingPosts' shape exactly (same Post type, same reaction/poll/
  // repost hydration) so renderPostCard needs no special-casing for it.
  async function fetchPatchesPosts() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPatchesPosts([]); setMyVillageIdsSet(new Set()); return; }

    const { data: villageRows } = await supabase.from('user_villages').select('village_id').eq('user_id', user.id);
    const villageIds = (villageRows ?? []).map((r: any) => r.village_id as string);
    setMyVillageIdsSet(new Set(villageIds));

    if (villageIds.length === 0) { setPatchesPosts([]); return; }

    const { data } = await supabase
      .from('posts')
      .select('*')
      .in('village_id', villageIds)
      .order('created_at', { ascending: false })
      .limit(40);

    const result: Post[] = await attachAuthorProfiles((data as Post[]) ?? []);
    setPatchesPosts(result);
    if (result.length > 0) {
      fetchReactions(result);
      fetchPollData(result);
      fetchRepostData(result);
    }
  }

  // Pull-to-refresh only reloads the feed tab actually on screen — not all
  // four — so one refresh gesture doesn't trigger three redundant fetches.
  async function onRefreshFeed() {
    setRefreshing(true);
    try {
      if (feedMode === 'for-you') await fetchPosts();
      else if (feedMode === 'following') await fetchFollowingPosts();
      else if (feedMode === 'friends') await fetchFriendsPosts();
      else await fetchPatchesPosts();
    } finally {
      setRefreshing(false);
    }
  }

  // Reuses the same Patch join/leave mutation Discover and Profile use, so
  // tapping a Patch tag from any Home feed behaves identically everywhere.
  async function toggleVillageMembership(villageId: string) {
    setJoiningVillageId(villageId);
    const wasJoined = myVillageIdsSet.has(villageId);
    const { error } = wasJoined ? await leavePatch(villageId) : await joinPatch(villageId);
    if (error) {
      Alert.alert('Something went wrong', wasJoined ? "Couldn't leave this patch. Please try again." : "Couldn't join this patch. Please try again.");
    } else {
      setMyVillageIdsSet(prev => {
        const n = new Set(prev);
        wasJoined ? n.delete(villageId) : n.add(villageId);
        return n;
      });
    }
    setJoiningVillageId(null);
  }

  async function fetchTrendingPosts() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('posts')
      .select('*')
      .gte('created_at', since)
      .order('likes', { ascending: false })
      .limit(10);
    if (!data) return;

    // Score = likes * 2 + recency bonus (posts in last 24h get +5)
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
    const scored = data.map((p: Post) => ({
      post: p,
      score: (p.likes || 0) * 2 + (new Date(p.created_at).getTime() > cutoff24h ? 5 : 0),
    }));
    scored.sort((a: any, b: any) => b.score - a.score);
    setTrendingPosts(scored.slice(0, 5).map((s: any) => s.post));
  }

  async function fetchReactions(loadedPosts: Post[]) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || loadedPosts.length === 0) return;
    const ids = loadedPosts.map(p => p.id);

    const [myRes, allRes] = await Promise.all([
      supabase.from('post_reactions').select('post_id, type').eq('user_id', user.id).in('post_id', ids),
      supabase.from('post_reactions').select('post_id, type').in('post_id', ids),
    ]);

    const myMap = new Map<string, string>();
    (myRes.data ?? []).forEach((r: any) => myMap.set(r.post_id, r.type));
    setMyReactions(myMap);

    const counts = new Map<string, Record<string, number>>();
    (allRes.data ?? []).forEach((r: any) => {
      if (!counts.has(r.post_id)) counts.set(r.post_id, {});
      const c = counts.get(r.post_id)!;
      c[r.type] = (c[r.type] || 0) + 1;
    });
    setReactionCounts(counts);
  }

  async function setReaction(postId: string, type: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const current = myReactions.get(postId);
    setReactionPickerPostId(null);

    if (current === type) {
      setMyReactions(prev => { const n = new Map(prev); n.delete(postId); return n; });
      setReactionCounts(prev => {
        const n = new Map(prev);
        const c = { ...(n.get(postId) || {}) };
        c[type] = Math.max(0, (c[type] || 1) - 1);
        if (!c[type]) delete c[type];
        n.set(postId, c);
        return n;
      });
      const { error } = await toggleReactionMutation(postId, user.id, null);
      if (error) fetchReactions([{ id: postId } as Post]);
    } else {
      setMyReactions(prev => new Map(prev).set(postId, type));
      setReactionCounts(prev => {
        const n = new Map(prev);
        const c = { ...(n.get(postId) || {}) };
        if (current) { c[current] = Math.max(0, (c[current] || 1) - 1); if (!c[current]) delete c[current]; }
        c[type] = (c[type] || 0) + 1;
        n.set(postId, c);
        return n;
      });
      const { error } = await toggleReactionMutation(postId, user.id, type);
      if (error) fetchReactions([{ id: postId } as Post]);
    }
  }

  async function fetchSavedPosts() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('saved_posts').select('post_id').eq('user_id', user.id);
    if (data) setSavedPostIds(new Set(data.map((r: any) => r.post_id)));
  }

  async function fetchRepostData(loadedPosts: Post[]) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || loadedPosts.length === 0) return;
    const ids = loadedPosts.map(p => p.id);
    const [allRes, myRes] = await Promise.all([
      (supabase as any).from('reposts').select('post_id').in('post_id', ids),
      (supabase as any).from('reposts').select('post_id').eq('user_id', user.id).in('post_id', ids),
    ]);
    const counts = new Map<string, number>();
    (allRes.data ?? []).forEach((r: any) => counts.set(r.post_id, (counts.get(r.post_id) || 0) + 1));
    setRepostCounts(counts);
    setMyRepostIds(new Set((myRes.data ?? []).map((r: any) => r.post_id)));
  }

  async function handleRepost(post: Post) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const isReposted = myRepostIds.has(post.id);
    await toggleRepostMutation(post.id, user.id, !isReposted);
    if (isReposted) {
      setMyRepostIds(prev => { const n = new Set(prev); n.delete(post.id); return n; });
      setRepostCounts(prev => { const n = new Map(prev); n.set(post.id, Math.max(0, (n.get(post.id) || 1) - 1)); return n; });
    } else {
      setMyRepostIds(prev => { const n = new Set(prev); n.add(post.id); return n; });
      setRepostCounts(prev => { const n = new Map(prev); n.set(post.id, (n.get(post.id) || 0) + 1); return n; });
    }
  }

  async function fetchFollowingIds() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
    if (data) setFollowingUserIds(new Set(data.map((r: any) => r.following_id)));
  }

  async function handleFollowToggle(userId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || userId === user.id) return;
    const isFollowing = followingUserIds.has(userId);

    if (isFollowing) {
      Alert.alert('Unfollow?', 'You will stop seeing their posts in your Following feed.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow', style: 'destructive',
          onPress: async () => {
            setFollowingUserIds(prev => { const n = new Set(prev); n.delete(userId); return n; });
            await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', userId);
            fetchFollowingPosts();
            fetchFriendsPosts();
          },
        },
      ]);
    } else {
      setFollowingUserIds(prev => new Set(prev).add(userId));
      await supabase.from('follows').insert({ follower_id: user.id, following_id: userId });
      fetchFollowingPosts();
      fetchFriendsPosts();
    }
  }

  async function toggleSave(postId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const isSaved = savedPostIds.has(postId);
    setSavedPostIds(prev => { const n = new Set(prev); isSaved ? n.delete(postId) : n.add(postId); return n; });
    const { error } = isSaved
      ? await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', user.id)
      : await supabase.from('saved_posts').insert({ post_id: postId, user_id: user.id });
    if (error) {
      // Revert — the write didn't actually go through, so don't leave the UI lying.
      setSavedPostIds(prev => { const n = new Set(prev); isSaved ? n.add(postId) : n.delete(postId); return n; });
    }
  }

  async function fetchPollData(loadedPosts: Post[]) {
    const pollPosts = loadedPosts.filter(p => p.post_type === 'poll');
    if (pollPosts.length === 0) return;
    const ids = pollPosts.map(p => p.id);
    const { data: { user } } = await supabase.auth.getUser();

    const [optionsRes, myVotesRes] = await Promise.all([
      supabase.from('poll_options').select('id,post_id,text,vote_count,position').in('post_id', ids).order('position'),
      user ? supabase.from('poll_votes').select('post_id,option_id').eq('user_id', user.id).in('post_id', ids) : Promise.resolve({ data: [] }),
    ]);

    const byPost = new Map<string, any[]>();
    (optionsRes.data ?? []).forEach((o: any) => {
      if (!byPost.has(o.post_id)) byPost.set(o.post_id, []);
      byPost.get(o.post_id)!.push(o);
    });
    const myVoteMap = new Map<string, string>();
    (myVotesRes.data ?? []).forEach((v: any) => myVoteMap.set(v.post_id, v.option_id));

    const next = new Map<string, any>();
    ids.forEach(id => next.set(id, { options: byPost.get(id) ?? [], myVoteId: myVoteMap.get(id) ?? null }));
    setPollData(next);
  }

  async function castVote(postId: string, optionId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const current = pollData.get(postId);
    if (!current) return;
    const prevId = current.myVoteId;

    setPollData(prev => {
      const n = new Map(prev);
      const pd = n.get(postId);
      if (!pd) return n;
      n.set(postId, {
        myVoteId: optionId,
        options: pd.options.map((o: any) => ({
          ...o,
          vote_count: o.id === prevId ? Math.max(0, o.vote_count - 1)
            : o.id === optionId ? o.vote_count + 1
            : o.vote_count,
        })),
      });
      return n;
    });

    const { error } = await castPollVoteMutation(postId, user.id, optionId);
    if (error) fetchPollData([{ id: postId, post_type: 'poll' } as Post]);
  }

  async function openComments(postId: string) {
    const found = [...posts, ...trendingPosts].find(p => p.id === postId) ?? null;
    setSelectedPost(found);
    setComments([]);
    setReplyingTo(null);
    setCommentPostId(postId);
    if (!found) {
      const { data: postData } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
      if (postData) setSelectedPost((await attachAuthorProfiles([postData as Post]))[0]);
    }
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (data) setComments(buildCommentTree(await attachAuthorProfiles(data)));
  }

  async function submitComment() {
    if (!commentText.trim() || !commentPostId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', user.id)
      .maybeSingle();
    const author = profileData?.username ?? profileData?.display_name ?? user.email?.split('@')[0] ?? 'Anonymous';
    const { error } = await supabase.from('comments').insert({
      post_id: commentPostId,
      user_id: user.id,
      author,
      content: commentText,
      parent_id: replyingTo?.id ?? null,
    });
    if (!error) {
      if (commentPostId && commentText.trim()) {
        sendMentionNotifications(commentText.trim(), commentPostId, user.id);
      }
      setCommentText('');
      setReplyingTo(null);
      const { data } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', commentPostId)
        .order('created_at', { ascending: true });
      if (data) setComments(buildCommentTree(await attachAuthorProfiles(data)));
    }
  }

  async function handleShare(post: Post) {
    await Share.share({ message: post.content });
  }

  async function openMentionedUser(username: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (data) setPublicProfileUserId((data as any).id);
  }

  async function doDeletePost(postId: string) {
    const { data, error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .select('id');
    if (error) { Alert.alert('Delete Failed', error.message); return; }
    if (!data || data.length === 0) { Alert.alert('Delete Failed', 'Post not deleted — check RLS policies.'); return; }
    setPosts(prev => prev.filter(p => p.id !== postId));
  }

  function handleDeletePost(post: Post) {
    const message = 'Delete this post? This cannot be undone.';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) doDeletePost(post.id);
      return;
    }
    Alert.alert('Delete Post', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => doDeletePost(post.id) },
    ]);
  }

  async function submitReport() {
    if (!reportPostId || !reportReason) return;
    setReportSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setReportSubmitting(false); return; }
    const { error } = await supabase.from('post_reports').insert({
      reporter_id: user.id,
      post_id: reportPostId,
      reason: reportReason,
    });
    setReportSubmitting(false);
    if (!error) {
      setReportedPostIds(prev => { const next = new Set(prev); next.add(reportPostId!); return next; });
      setReportDone(true);
    }
  }

  async function submitCommentReport() {
    if (!reportCommentId || !reportCommentReason) return;
    setReportCommentSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setReportCommentSubmitting(false); return; }
    const { error } = await supabase.from('comment_reports').insert({
      reporter_id: user.id,
      comment_id: reportCommentId,
      reason: reportCommentReason,
    });
    setReportCommentSubmitting(false);
    if (!error) {
      setReportedCommentIds(prev => { const next = new Set(prev); next.add(reportCommentId!); return next; });
      setReportCommentDone(true);
    }
  }

  async function pickPostImage() {
    const source = await showSourcePicker('Add Photo');
    if (!source) return;
    let uri: string | null = null;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets[0]) uri = result.assets[0].uri;
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.8 });
      if (!result.canceled && result.assets[0]) uri = result.assets[0].uri;
    }
    if (!uri) return;
    setModerating(true);
    const modResult = await moderateImage(uri);
    setModerating(false);
    if (modResult.blocked) {
      setBlockedContent({ severity: modResult.severity, reason: modResult.reason, contentType: 'post_image' });
      return;
    }
    setPendingPostImageUri(uri);
    setPendingPostVideoUri(null);
  }

  async function pickPostVideo() {
    const source = await showSourcePicker('Add Video');
    if (!source) return;
    // Video scanning requires Google Video Intelligence API (async, requires Edge Functions).
    // Videos are accepted here and flagged for manual review via content_flags if reported.
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, videoMaxDuration: 60 });
      if (!result.canceled && result.assets[0]) { setPendingPostVideoUri(result.assets[0].uri); setPendingPostImageUri(null); }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow media library access.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: true, videoMaxDuration: 60 });
      if (!result.canceled && result.assets[0]) { setPendingPostVideoUri(result.assets[0].uri); setPendingPostImageUri(null); }
    }
  }

  async function handleCreatePost() {
    if (!postContent.trim() && !pendingPostImageUri && !pendingPostVideoUri) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert('Not signed in'); return; }

    // Use username if set, otherwise display name, otherwise email prefix
    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', user.id)
      .maybeSingle();
    const author = profileData?.username ?? profileData?.display_name ?? user.email?.split('@')[0] ?? 'Someone';

    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    if (pendingPostImageUri) {
      setImageUploading(true);
      imageUrl = await uploadPostImage(pendingPostImageUri, user.id);
      setImageUploading(false);
    } else if (pendingPostVideoUri) {
      setImageUploading(true);
      videoUrl = await uploadPostVideo(pendingPostVideoUri, user.id);
      setImageUploading(false);
    }

    const payload: Record<string, any> = {
      user_id: user.id,
      author,
      content: postContent.trim(),
      post_type: postType,
      likes: 0,
      created_at: new Date().toISOString(),
    };
    if (imageUrl) payload.image_url = imageUrl;
    if (videoUrl) payload.video_url = videoUrl;
    if (selectedTags.length > 0) payload.tags = selectedTags;
    if (isSensitive) { payload.is_sensitive = true; if (sensitiveLabel) payload.sensitive_label = sensitiveLabel; }

    const { data: newPost, error } = await supabase.from('posts').insert(payload).select('id').single();
    if (error) {
      Alert.alert('Could not post', error.message);
      return;
    }
    if (postType === 'poll' && newPost) {
      const validOptions = pollOptions.map(o => o.trim()).filter(Boolean);
      if (validOptions.length >= 2) {
        await supabase.from('poll_options').insert(
          validOptions.map((text, i) => ({ post_id: newPost.id, text, position: i, vote_count: 0 }))
        );
      }
    }
    if (newPost && postContent.trim()) {
      sendMentionNotifications(postContent.trim(), newPost.id, user.id);
    }
    track('post_created', { post_type: postType, has_image: !!imageUrl || !!videoUrl });
    setPostContent('');
    setPendingPostImageUri(null);
    setPendingPostVideoUri(null);
    setSelectedTags([]);
    setPostType('text');
    setPollOptions(['', '']);
    setIsSensitive(false);
    setSensitiveLabel('');
    setDismissedHealthBanner(false);
    setShowCreatePost(false);
    fetchPosts();
  }

  async function pickStoryImage() {
    const source = await showSourcePicker('Add Photo Story');
    if (!source) return;
    let uri: string | null = null;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [9, 16], quality: 0.85 });
      if (!result.canceled && result.assets[0]) uri = result.assets[0].uri;
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [9, 16], quality: 0.85 });
      if (!result.canceled && result.assets[0]) uri = result.assets[0].uri;
    }
    if (!uri) return;
    setModerating(true);
    const modResult = await moderateImage(uri);
    setModerating(false);
    if (modResult.blocked) {
      setBlockedContent({ severity: modResult.severity, reason: modResult.reason, contentType: 'story_photo' });
      return;
    }
    setStoryImageUri(uri);
  }

  async function pickStoryVideo() {
    const source = await showSourcePicker('Add Video Story');
    if (!source) return;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, videoMaxDuration: 30 });
      if (!result.canceled && result.assets[0]) setStoryVideoUri(result.assets[0].uri);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow media library access.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: true, videoMaxDuration: 30 });
      if (!result.canceled && result.assets[0]) setStoryVideoUri(result.assets[0].uri);
    }
  }

  async function handleSubmitStory() {
    if (!currentUserId) return;
    if (storyMode === 'photo' && !storyImageUri) return;
    if (storyMode === 'video' && !storyVideoUri) return;
    if (storyMode === 'text' && !storyText.trim()) return;
    setStorySubmitting(true);
    const { data: profileData } = await supabase
      .from('profiles').select('username, display_name').eq('id', currentUserId).maybeSingle();
    const author = profileData?.username ?? profileData?.display_name ?? 'Someone';
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    if (storyMode === 'photo' && storyImageUri) {
      imageUrl = await uploadPostImage(storyImageUri, currentUserId);
    } else if (storyMode === 'video' && storyVideoUri) {
      videoUrl = await uploadPostVideo(storyVideoUri, currentUserId);
    }
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await supabase.from('stories').insert({
      user_id: currentUserId,
      author,
      image_url: imageUrl,
      video_url: videoUrl,
      text_content: storyMode === 'text' ? storyText.trim() : null,
      bg_color: storyMode === 'text' ? storyBgColor : null,
      expires_at: expiresAt,
    });
    setStorySubmitting(false);
    setShowAddStory(false);
    setStoryText('');
    setStoryImageUri(null);
    setStoryVideoUri(null);
    setStoryRefreshKey(k => k + 1);
  }

  // Re-fetch every time this tab comes into focus so numbers update
  // immediately after the user logs something on the Track tab.
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setStreakRefreshKey(k => k + 1);

      async function fetchStats() {
        setLoading(true);
        const today = new Date().toDateString();
        const statsCacheKey = `home_stats_${today}`;
        try {
          const { start, end } = todayRange();

          const [feedRes, diaperRes, pumpRes] = await Promise.all([
            supabase
              .from('feeds')
              .select('id', { count: 'exact', head: true })
              .gte('logged_at', start)
              .lte('logged_at', end),
            supabase
              .from('diaper_logs')
              .select('id', { count: 'exact', head: true })
              .gte('logged_at', start)
              .lte('logged_at', end),
            supabase
              .from('pumping_sessions')
              .select('total_ml')
              .gte('logged_at', start)
              .lte('logged_at', end),
          ]);

          const pumpedMl = (pumpRes.data ?? []).reduce(
            (sum, row) => sum + (row.total_ml ?? 0),
            0,
          );

          const newStats: Stats = {
            feeds: feedRes.count ?? 0,
            diapers: diaperRes.count ?? 0,
            pumpedMl,
          };
          await cacheSet(statsCacheKey, newStats);

          if (!isActive) return;
          setStats(newStats);
        } catch (err: any) {
          console.warn('HomeTab fetchStats error:', err.message);
          const cached = await cacheGetStale<Stats>(statsCacheKey);
          if (cached && isActive) setStats(cached);
        } finally {
          if (isActive) setLoading(false);
        }
      }

      async function fetchReminders() {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || !isActive) return;

          const items: Reminder[] = [];
          const now = Date.now();

          // ── Baby age & milestone ─────────────────────────────────────────────
          const { data: baby } = await supabase
            .from('babies')
            .select('name, birth_date, due_date, is_expecting, photo_url, gender')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

          if (baby && isActive) setBaby(baby);

          if (baby?.birth_date) {
            const { ageDays, ageWeeks, monthsOld, isBirthdayToday } = getBabyAge(baby.birth_date);
            const name = baby.name || 'Baby';
            const WEEK_MILESTONES  = [4, 8, 12];
            const MONTH_MILESTONES = [4, 5, 6, 9, 12, 15, 18, 24];

            const isWeekMilestone  = ageDays % 7 === 0 && WEEK_MILESTONES.includes(ageWeeks);
            const isMonthMilestone = isBirthdayToday && MONTH_MILESTONES.includes(monthsOld);

            if (isMonthMilestone) {
              items.push({ id: 'milestone', icon: 'gift-outline', text: `${name} is ${monthsOld} months old today!`, urgency: 'milestone' });
            } else if (isWeekMilestone) {
              items.push({ id: 'milestone', icon: 'gift-outline', text: `${name} is ${ageWeeks} weeks old today!`, urgency: 'milestone' });
            } else {
              const ageLabel = monthsOld >= 3
                ? `${monthsOld} month${monthsOld !== 1 ? 's' : ''}`
                : `${ageWeeks} week${ageWeeks !== 1 ? 's' : ''}`;
              items.push({ id: 'age', icon: 'body-outline', text: `${name} is ${ageLabel} old`, urgency: 'info' });
            }
          }

          // ── Feeding gap ──────────────────────────────────────────────────────
          const { data: lastFeed } = await supabase
            .from('feeds')
            .select('logged_at')
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastFeed) {
            const mins = (now - new Date(lastFeed.logged_at).getTime()) / 60000;
            const h = Math.floor(mins / 60);
            const m = Math.floor(mins % 60);
            const label = h > 0 ? `${h}h ${m}m ago` : `${m}m ago`;
            if (mins > 210) {
              items.push({ id: 'feed_gap', icon: 'nutrition-outline', text: `Baby last fed ${label} — might be hungry!`, urgency: 'alert' });
            } else if (mins > 150) {
              items.push({ id: 'feed_gap', icon: 'nutrition-outline', text: `Baby last fed ${label} — feed time coming up`, urgency: 'warning' });
            }
          }

          // ── Diaper gap ───────────────────────────────────────────────────────
          const { data: lastDiaper } = await supabase
            .from('diaper_logs')
            .select('logged_at')
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastDiaper) {
            const hrs = (now - new Date(lastDiaper.logged_at).getTime()) / 3600000;
            const h = Math.floor(hrs);
            const m = Math.floor((hrs - h) * 60);
            const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
            if (hrs > 4) {
              items.push({ id: 'diaper_gap', icon: 'shirt-outline', text: `No diaper change logged in ${label}`, urgency: 'warning' });
            }
          }

          // ── Supply alerts ────────────────────────────────────────────────────
          const { data: supplies } = await supabase
            .from('supply_items')
            .select('supply_type, quantity_remaining, unit, low_threshold')
            .eq('user_id', user.id);

          for (const s of supplies ?? []) {
            if (s.low_threshold > 0 && s.quantity_remaining <= s.low_threshold) {
              if (s.supply_type === 'formula') {
                items.push({ id: 'supply_formula', icon: 'flask-outline', text: `Low on formula — ${s.quantity_remaining.toFixed(1)} oz left`, urgency: 'warning' });
              } else if (s.supply_type === 'diapers') {
                items.push({ id: 'supply_diapers', icon: 'shirt-outline', text: `Running low on diapers — ${Math.round(s.quantity_remaining)} left`, urgency: 'warning' });
              } else if (s.supply_type === 'breastmilk') {
                items.push({ id: 'supply_milk', icon: 'water-outline', text: `Milk stash low — ${(s.quantity_remaining / 29.5735).toFixed(1)} oz left`, urgency: 'warning' });
              }
            }
          }

          // ── Milk stash expiration ────────────────────────────────────────────
          const { data: milkBatches } = await supabase
            .from('milk_stash')
            .select('id, amount_ml, stored_date, location')
            .eq('user_id', user.id);

          const MILK_FRIDGE_DAYS  = 4;
          const MILK_FREEZER_DAYS = 365;
          let fridgeExpiredOz = 0, fridgeTodayOz = 0, fridgeSoonOz = 0, freezerSoonOz = 0;

          for (const batch of milkBatches ?? []) {
            const limit     = batch.location === 'fridge' ? MILK_FRIDGE_DAYS : MILK_FREEZER_DAYS;
            const expiresMs = new Date(batch.stored_date).getTime() + limit * 86400000;
            const daysLeft  = Math.ceil((expiresMs - now) / 86400000);
            const oz        = batch.amount_ml / 29.5735;
            if (batch.location === 'fridge') {
              if (daysLeft <= 0)      fridgeExpiredOz += oz;
              else if (daysLeft <= 1) fridgeTodayOz   += oz;
              else if (daysLeft <= 2) fridgeSoonOz    += oz;
            } else if (daysLeft <= 30) {
              freezerSoonOz += oz;
            }
          }
          if (fridgeExpiredOz > 0)
            items.push({ id: 'milk_expired', icon: 'water-outline', urgency: 'alert',
              text: `${fridgeExpiredOz.toFixed(1)} oz of fridge milk has expired — use or discard` });
          if (fridgeTodayOz > 0)
            items.push({ id: 'milk_today', icon: 'water-outline', urgency: 'alert',
              text: `${fridgeTodayOz.toFixed(1)} oz of fridge milk expires today — use or move to freezer!` });
          if (fridgeSoonOz > 0)
            items.push({ id: 'milk_soon', icon: 'water-outline', urgency: 'warning',
              text: `${fridgeSoonOz.toFixed(1)} oz of fridge milk expires in 1–2 days — use or freeze soon` });
          if (freezerSoonOz > 0)
            items.push({ id: 'milk_freezer_soon', icon: 'snow-outline', urgency: 'warning',
              text: `${freezerSoonOz.toFixed(1)} oz of frozen milk expires within 30 days` });

          // ── Supplies snapshot for homepage card ──────────────────────────────
          if (isActive) {
            const formulaItem = (supplies ?? []).find(s => s.supply_type === 'formula');
            const diapersItem = (supplies ?? []).find(s => s.supply_type === 'diapers');
            const milkOz = (milkBatches ?? []).reduce((sum, b) => sum + b.amount_ml, 0) / 29.5735;
            setSuppliesSnap({
              formula: formulaItem?.quantity_remaining ?? null,
              formulaLow: !!formulaItem && formulaItem.low_threshold > 0 && formulaItem.quantity_remaining <= formulaItem.low_threshold,
              diapers: diapersItem?.quantity_remaining ?? null,
              diapersLow: !!diapersItem && diapersItem.low_threshold > 0 && diapersItem.quantity_remaining <= diapersItem.low_threshold,
              milkOz,
            });
          }

          // ── Pump parts overdue ───────────────────────────────────────────────
          const { data: parts } = await supabase
            .from('pump_parts')
            .select('part_name, sessions_since_replaced, last_replaced')
            .eq('user_id', user.id);

          for (const p of parts ?? []) {
            const limits = PART_LIMITS[p.part_name];
            if (!limits) continue;
            const daysSince = (now - new Date(p.last_replaced).getTime()) / 86400000;
            if (p.sessions_since_replaced >= limits.sessions || daysSince >= limits.days) {
              items.push({
                id: `part_${p.part_name}`,
                icon: 'build-outline',
                text: `${PART_LABELS[p.part_name] || p.part_name} overdue for replacement`,
                urgency: 'alert',
              });
            }
          }

          // ── Logging streak ───────────────────────────────────────────────────
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
          sevenDaysAgo.setHours(0, 0, 0, 0);
          const since = sevenDaysAgo.toISOString();

          const [sFeeds, sDiapers, sPumps] = await Promise.all([
            supabase.from('feeds').select('logged_at').gte('logged_at', since),
            supabase.from('diaper_logs').select('logged_at').gte('logged_at', since),
            supabase.from('pumping_sessions').select('logged_at').gte('logged_at', since).eq('user_id', user.id),
          ]);

          const loggedDays = new Set<string>();
          for (const r of [...(sFeeds.data ?? []), ...(sDiapers.data ?? []), ...(sPumps.data ?? [])]) {
            loggedDays.add(r.logged_at.split('T')[0]);
          }
          let streak = 0;
          for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            if (loggedDays.has(d.toISOString().split('T')[0])) streak++;
            else break;
          }
          if (streak >= 7) {
            items.push({ id: 'streak', icon: 'flame', text: `7-day logging streak! You're on a roll!`, urgency: 'streak' });
          } else if (streak >= 3) {
            items.push({ id: 'streak', icon: 'star', text: `${streak}-day logging streak — keep it up!`, urgency: 'streak' });
          }

          if (isActive) setReminders(items);
        } catch (err: any) {
          console.warn('HomeTab fetchReminders error:', err.message);
        }
      }

      async function fetchUpcomingEvents() {
        try {
          const db: any = supabase;
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || !isActive) return;

          const { data: memberCals } = await db.from('calendar_members').select('calendar_id').eq('user_id', user.id);
          const calIds = (memberCals ?? []).map((m: any) => m.calendar_id);
          if (calIds.length === 0) { if (isActive) setUpcomingEvents([]); return; }

          // Compare against the start of today, not this exact instant — an
          // all-day event is stored at midnight, so it would otherwise drop
          // off "Upcoming" the moment the clock passes 12:00am.
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);

          const [{ data: evs }, { data: cals }] = await Promise.all([
            db.from('calendar_events')
              .select('id, title, starts_at, all_day, calendar_id')
              .in('calendar_id', calIds)
              .gte('starts_at', startOfToday.toISOString())
              .order('starts_at', { ascending: true })
              .limit(3),
            db.from('calendars').select('id, calendar_type').in('id', calIds),
          ]);

          const typeMap = new Map((cals ?? []).map((cc: any) => [cc.id, cc.calendar_type]));
          const mapped = (evs ?? []).map((e: any) => ({
            id: e.id,
            title: e.title,
            starts_at: e.starts_at,
            all_day: e.all_day,
            calendar_type: (typeMap.get(e.calendar_id) as 'personal' | 'shared') ?? 'shared',
          }));
          if (isActive) setUpcomingEvents(mapped);
        } catch (err: any) {
          console.warn('HomeTab fetchUpcomingEvents error:', err.message);
        }
      }

      async function fetchFollowedQuestions() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !isActive) return;
        const { data: followRows } = await supabase
          .from('qa_follows')
          .select('question_id')
          .eq('user_id', user.id);
        if (!followRows || followRows.length === 0) { if (isActive) setFollowedQuestions([]); return; }
        const ids = followRows.map((r: any) => r.question_id);
        const { data: qRows } = await supabase
          .from('qa_questions')
          .select('id, author, content, topic, vote_score, answer_count, created_at')
          .in('id', ids)
          .order('created_at', { ascending: false });
        if (isActive) setFollowedQuestions((qRows as any[]) ?? []);
      }

      fetchStats();
      fetchReminders();
      fetchUpcomingEvents();
      fetchFollowedQuestions();
      if (!hasLoadedFeedOnce.current) {
        Promise.all([fetchPosts(), fetchFollowingPosts(), fetchFriendsPosts(), fetchPatchesPosts()]).finally(() => {
          if (isActive) { setFeedInitialLoading(false); hasLoadedFeedOnce.current = true; }
        });
      } else {
        fetchPosts();
        fetchFollowingPosts();
        fetchFriendsPosts();
        fetchPatchesPosts();
      }
      fetchFollowingIds();
      fetchTrendingPosts();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const tourSteps = useMemo<CoachMarkStep[]>(() => {
    return [
      { ref: iconRowRef, title: 'Stay connected', body: 'Notifications, messages, and search — all one tap away up here.' },
      { ref: storiesRef, title: 'Share the little moments', body: 'Post a quick photo or video story so your community can follow along in real time.' },
      { ref: fabRef, title: 'Share with your community', body: 'Tap the + button to post an update, ask a question, start a story, or ask your Patch for help.' },
    ];
  }, []);

  const tourSeenKey = useCallback((uid: string) => `app_tour_seen:${uid}`, []);

  // handleTourDismiss (both the initial auto-run and a "Take a Tour" replay from
  // Settings) marks the tour seen. Only persist that to the profile row when this
  // was the auto-run, not a deliberate replay — otherwise a replay would be
  // indistinguishable from first-time completion, which is already recorded.
  const handleTourDismiss = useCallback(() => {
    setTourVisible(false);
    if (!currentUserId) return;
    AsyncStorage.setItem(tourSeenKey(currentUserId), 'true').catch(() => {});
    (supabase.from('profiles') as any).update({ tour_seen: true }).eq('id', currentUserId).then(() => {});
  }, [currentUserId, tourSeenKey]);

  // Replay requested from Settings ("Take a Tour").
  useEffect(() => {
    if (tourRequestId > 0 && tourRequestId !== lastHandledTourRequestId.current) {
      lastHandledTourRequestId.current = tourRequestId;
      setTourVisible(true);
    }
  }, [tourRequestId]);

  // The global create-options sheet (owned at the app root — see App.tsx) asks
  // Home to run one of its existing creation flows via this request. Home owns
  // all the actual state/handlers for these; the sheet itself just dispatches.
  useEffect(() => {
    if (!createAction || createAction.requestId === lastHandledCreateActionId.current) return;
    lastHandledCreateActionId.current = createAction.requestId;
    switch (createAction.action) {
      case 'post':
        setPostType('text');
        setShowCreatePost(true);
        break;
      case 'question':
        setPostType('question');
        setShowCreatePost(true);
        break;
      case 'media':
        setPostType('text');
        setShowCreatePost(true);
        pickPostImage();
        break;
      case 'story':
        setStoryMode('photo');
        setStoryImageUri(null);
        setStoryVideoUri(null);
        setStoryText('');
        setShowAddStory(true);
        break;
    }
  }, [createAction]);

  // Auto-show once, ever, per account — mirrors the onboarding_complete pattern in
  // App.tsx: check the local cache first, then fall back to the profile row so a
  // user who already completed the tour on another device/browser (where this
  // device's AsyncStorage has no record of it) isn't shown it again.
  useEffect(() => {
    if (!currentUserId || loading) return;
    let cancelled = false;
    (async () => {
      const seen = await AsyncStorage.getItem(tourSeenKey(currentUserId));
      if (seen === 'true') return;
      const { data } = await (supabase.from('profiles') as any)
        .select('tour_seen')
        .eq('id', currentUserId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.tour_seen) {
        AsyncStorage.setItem(tourSeenKey(currentUserId), 'true').catch(() => {});
        return;
      }
      setTimeout(() => { if (!cancelled) setTourVisible(true); }, 600);
    })();
    return () => { cancelled = true; };
  }, [currentUserId, loading, tourSeenKey]);

  // Feed actions (react/comment/repost/save/poll) stay inline so the feed
  // never forces a navigation just to interact with a post — but tapping the
  // post's own content, media, or timestamp opens the same full PostDetail
  // screen Discover/Profile already link into, for a consistent "view post"
  // destination app-wide.
  function goToPostDetail(post: Post) {
    navigation.navigate('PostDetail', { postId: post.id, origin: 'Home' });
  }

  // Neutral, content-first post card — the one place in the social feed that
  // deliberately avoids the branded/colorful treatment (that's reserved for
  // FeedInsert). Extracted out of the main JSX purely so it can be interleaved
  // with feed inserts via feedItems.map above without duplicating this ~230
  // lines of markup; still a plain closure over the same component state.
  function renderPostCard(post: Post): React.ReactNode {
    return (
      <View style={styles.postCard}>
        {post.is_sensitive && !revealedSensitiveIds.has(post.id) ? (
          <View style={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <UserAvatar userId={post.user_id} name={resolveAuthorName(post)} size={28} />
              <Text style={styles.postAuthorName}>{resolveAuthorName(post)}</Text>
              <Text style={styles.postTimestamp}>{getTimeAgo(post.created_at)}</Text>
            </View>
            <View style={{ backgroundColor: c.reminderWarning.bg, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: c.reminderWarning.border }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: c.reminderWarning.text }}>⚠️ Sensitive Content</Text>
              {post.sensitive_label ? (
                <Text style={{ fontSize: 13, color: c.reminderWarning.text, lineHeight: 18 }}>
                  This post is marked as: <Text style={{ fontWeight: '700' }}>{post.sensitive_label}</Text>
                </Text>
              ) : (
                <Text style={{ fontSize: 13, color: c.reminderWarning.text, lineHeight: 18 }}>
                  The author has marked this post as sensitive.
                </Text>
              )}
              <TouchableOpacity
                onPress={() => setRevealedSensitiveIds(prev => { const s = new Set(prev); s.add(post.id); return s; })}
                style={{ alignSelf: 'flex-start', marginTop: 4, backgroundColor: c.reminderWarning.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 }}
                accessibilityRole="button" accessibilityLabel="Show sensitive post"
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Show post</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {(!post.is_sensitive || revealedSensitiveIds.has(post.id)) && (<>
        <View style={styles.postHeader}>
          <View style={styles.postAuthorRow}>
            <TouchableOpacity
              onPress={() => setPublicProfileUserId(post.user_id)}
              activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={`View ${resolveAuthorName(post)}'s profile`}
            >
              <UserAvatar userId={post.user_id} name={resolveAuthorName(post)} size={36} />
            </TouchableOpacity>
            <View>
              <Text
                style={styles.postAuthorName}
                onPress={() => setPublicProfileUserId(post.user_id)}
                accessibilityRole="button" accessibilityLabel={`View ${resolveAuthorName(post)}'s profile`}
              >
                {resolveAuthorName(post)}
              </Text>
              <Text
                style={styles.postTimestamp}
                onPress={() => goToPostDetail(post)}
                accessibilityRole="button" accessibilityLabel="View post"
              >
                {getTimeAgo(post.created_at)}
              </Text>
            </View>
          </View>
          <View style={styles.postHeaderRight}>
            <PostTypeBadge postType={post.post_type} />
            {currentUserId && post.user_id !== currentUserId && (
              <TouchableOpacity
                onPress={() => handleFollowToggle(post.user_id)}
                style={[styles.followBtn, followingUserIds.has(post.user_id) && styles.followBtnActive]}
                activeOpacity={0.75}
                accessibilityRole="button" accessibilityLabel={followingUserIds.has(post.user_id) ? `Unfollow ${resolveAuthorName(post)}` : `Follow ${resolveAuthorName(post)}`}
              >
                <Text style={[styles.followBtnText, followingUserIds.has(post.user_id) && styles.followBtnTextActive]}>
                  {followingUserIds.has(post.user_id) ? '✓ Following' : '+ Follow'}
                </Text>
              </TouchableOpacity>
            )}
            {post.user_id === currentUserId && (
              <PostOptionsButton
                actions={[
                  {
                    key: 'delete',
                    label: 'Delete post',
                    icon: 'trash-outline',
                    destructive: true,
                    accessibilityHint: 'This cannot be undone',
                    onPress: () => handleDeletePost(post),
                  },
                ]}
              />
            )}
          </View>
        </View>
        {post.village_id && VILLAGE_MAP[post.village_id] && (
          <PatchLabel
            emoji={VILLAGE_MAP[post.village_id].emoji}
            name={VILLAGE_MAP[post.village_id].name}
            onPress={() => {
              const [v] = villagesByIds([post.village_id!]);
              if (v) setFeedVillage(v);
            }}
          />
        )}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => goToPostDetail(post)}
          accessibilityRole="button" accessibilityLabel="View post"
        >
          {post.content
            ? renderTextWithMentions(post.content, styles.postContent, c.primary, openMentionedUser, tag => setActiveHashtag(tag))
            : null}
          {post.image_url ? (
            <Image
              source={{ uri: post.image_url }}
              style={styles.postImage}
              resizeMode="cover"
            />
          ) : null}
          {post.video_url ? <VideoPostPlayer uri={post.video_url} /> : null}
        </TouchableOpacity>
        {post.tags && post.tags.length > 0 && (
          <View style={styles.postTagsRow}>
            {post.tags.map(tag => (
              <TouchableOpacity key={tag} onPress={() => setActiveTag(tag)} style={styles.postTagChip}
                accessibilityRole="button" accessibilityLabel={`Filter by ${tag}`}>
                <Text style={styles.postTagChipText}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {post.post_type === 'poll' && (() => {
          const pd = pollData.get(post.id);
          if (!pd) return null;
          const totalVotes = pd.options.reduce((s: number, o: any) => s + o.vote_count, 0);
          const hasVoted = !!pd.myVoteId;
          return (
            <View style={{ marginHorizontal: 2, marginBottom: 10, gap: 8 }}>
              {pd.options.map((opt: any) => {
                const pct = totalVotes > 0 ? Math.round((opt.vote_count / totalVotes) * 100) : 0;
                const isMyVote = pd.myVoteId === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => castVote(post.id, opt.id)}
                    activeOpacity={0.8}
                    style={{
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: isMyVote ? c.primary : c.separator,
                      overflow: 'hidden',
                    }}
                    accessibilityRole="button" accessibilityLabel={`Vote for ${opt.text}`}
                  >
                    {hasVoted && (
                      <View style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${pct}%` as any,
                        backgroundColor: isMyVote ? c.cardLavender : c.cardBlush,
                      }} />
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, zIndex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {isMyVote && <Ionicons name="checkmark" size={15} color={c.textPrimary} />}
                        <Text style={{ fontSize: 14, fontWeight: isMyVote ? '700' : '500', color: c.textPrimary }}>
                          {opt.text}
                        </Text>
                      </View>
                      {hasVoted && (
                        <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted }}>{pct}%</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                {totalVotes} vote{totalVotes !== 1 ? 's' : ''}{hasVoted ? ' · tap to change' : ' · tap to vote'}
              </Text>
            </View>
          );
        })()}
        <View style={styles.postFooter}>
          <View>
            {reactionPickerPostId === post.id && (
              <View style={{
                flexDirection: 'row', gap: 4, marginBottom: 6,
                backgroundColor: c.card, borderRadius: 24,
                paddingHorizontal: 10, paddingVertical: 6,
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
                alignSelf: 'flex-start',
              }}>
                {['❤️','😂','😢','💪','🙌','👶'].map(emoji => (
                  <TouchableOpacity key={emoji} onPress={() => setReaction(post.id, emoji)} style={{ padding: 4 }}
                    accessibilityRole="button" accessibilityLabel={`React with ${emoji}`}>
                    <Text style={{
                      fontSize: myReactions.get(post.id) === emoji ? 26 : 22,
                      opacity: myReactions.get(post.id) && myReactions.get(post.id) !== emoji ? 0.5 : 1,
                    }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity
              style={styles.postAction}
              onPress={() => setReactionPickerPostId(prev => prev === post.id ? null : post.id)}
              hitSlop={hitSlopFor(24)}
              accessibilityRole="button" accessibilityLabel="React to post"
              accessibilityState={{ selected: !!myReactions.get(post.id) }}
            >
              {(() => {
                const myR = myReactions.get(post.id);
                const counts = reactionCounts.get(post.id) || {};
                const total = Object.values(counts).reduce((a, b) => a + b, 0);
                const topEmojis = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e);
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {myR || topEmojis.length ? (
                      <Text style={{ fontSize: 15 }}>{myR || topEmojis.join('')}</Text>
                    ) : (
                      <Ionicons name="heart-outline" size={18} color={c.textMuted} />
                    )}
                    <Text style={[styles.postActionText, myR ? styles.likedText : null]}>
                      {total > 0 ? total : ''}
                    </Text>
                  </View>
                );
              })()}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.postAction, { gap: 4 }]} onPress={() => openComments(post.id)}
            hitSlop={hitSlopFor(24)}
            accessibilityRole="button" accessibilityLabel="Reply to post">
            <Ionicons name="chatbubble-outline" size={17} color={c.textMuted} />
          </TouchableOpacity>
          {currentUserId && post.user_id !== currentUserId && (
            <TouchableOpacity
              style={[styles.postAction, { gap: 4 }]}
              onPress={() => handleRepost(post)}
              hitSlop={hitSlopFor(24)}
              accessibilityRole="button" accessibilityLabel="Repost"
              accessibilityState={{ selected: myRepostIds.has(post.id) }}
            >
              <Ionicons name="repeat" size={19} color={myRepostIds.has(post.id) ? c.sage : c.textMuted} />
              {repostCounts.get(post.id) ? (
                <Text style={[styles.postActionText, myRepostIds.has(post.id) && { color: c.sage, fontWeight: '700' }]}>
                  {repostCounts.get(post.id)}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.postAction} onPress={() => handleShare(post)}
            hitSlop={hitSlopFor(24)}
            accessibilityRole="button" accessibilityLabel="Share post">
            <Ionicons name="arrow-redo-outline" size={17} color={c.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.postAction, { marginLeft: 'auto' as any }]}
            onPress={() => toggleSave(post.id)}
            hitSlop={hitSlopFor(24)}
            accessibilityRole="button" accessibilityLabel={savedPostIds.has(post.id) ? 'Unsave post' : 'Save post'}
            accessibilityState={{ selected: savedPostIds.has(post.id) }}
          >
            <Ionicons
              name={savedPostIds.has(post.id) ? 'bookmark' : 'bookmark-outline'}
              size={17}
              color={savedPostIds.has(post.id) ? c.primary : c.textMuted}
            />
          </TouchableOpacity>
          {currentUserId && post.user_id !== currentUserId && (
            reportedPostIds.has(post.id) ? (
              <Text style={[styles.postActionText, { fontSize: 11, fontStyle: 'italic' }]}>Reported</Text>
            ) : (
              <TouchableOpacity
                style={styles.postAction}
                onPress={() => { setReportPostId(post.id); setReportReason(''); setReportDone(false); }}
                hitSlop={hitSlopFor(24)}
                accessibilityRole="button" accessibilityLabel="Report post"
              >
                <Ionicons name="flag-outline" size={16} color={c.textMuted} />
              </TouchableOpacity>
            )
          )}
        </View>
        </>)}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={isDesktop ? styles.desktopRow : styles.mobileRow}>
      <View style={isDesktop ? { width: feedMaxWidth } : { flex: 1, width: '100%', maxWidth: feedMaxWidth, alignSelf: 'center' }}>
      <ScrollView
        ref={mainScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        {...(Platform.OS === 'web' ? { tabIndex: 0, dataSet: { scrollRoot: 'true' } } : {})}
        onScroll={e => { mainScrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefreshFeed} tintColor={c.primary} colors={[c.primary]} />
        }
      >
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <Image source={require('../assets/icons/icon-foreground.png')} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="Parent Patch" />
            <Text style={styles.brandText}>Parent Patch</Text>
          </View>
          <HomeIconRow
            containerRef={iconRowRef}
            unreadNotifCount={unreadNotifCount}
            unreadMessageCount={unreadCount}
            onPressNotifications={() => setShowNotifications(true)}
            onPressMessages={() => { setMessageTargetUserId(null); setShowMessages(true); }}
            onPressSearch={() => setShowSearch(true)}
          />
        </View>

        {/* Feed mode toggle — directly under the header, per the social-feed layout */}
        <View style={styles.feedToggleRow}>
          {(['for-you', 'following', 'friends', 'patches'] as const).map(mode => (
            <TouchableOpacity
              key={mode}
              style={styles.feedToggleBtn}
              onPress={() => setFeedMode(mode)}
              activeOpacity={0.75}
              accessibilityRole="button" accessibilityState={{ selected: feedMode === mode }}
              accessibilityLabel={mode === 'for-you' ? 'For You feed'
                  : mode === 'following' ? 'Following feed'
                  : mode === 'friends' ? 'Friends feed'
                  : 'Patches feed'}
            >
              <Text style={[styles.feedToggleText, feedMode === mode && styles.feedToggleTextActive]} numberOfLines={1}>
                {mode === 'for-you' ? 'For You'
                  : mode === 'following' ? 'Following'
                  : mode === 'friends' ? 'Friends'
                  : 'Patches'}
              </Text>
              {feedMode === mode && <View style={styles.feedToggleUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Stories — directly below the feed tabs */}
        <View ref={storiesRef} style={{ paddingTop: 6 }}>
          <StoriesBar
            currentUserId={currentUserId}
            myName={displayName}
            onAddStory={() => { setStoryMode('photo'); setStoryImageUri(null); setStoryVideoUri(null); setStoryText(''); setShowAddStory(true); }}
            onViewStories={(groups, idx) => { setStoryViewGroups(groups); setStoryViewGroupIndex(idx); setShowStoryViewer(true); }}
            refreshKey={storyRefreshKey}
          />
        </View>

        {/* Active topic filter — set by tapping a Trending Topic in Discover;
            the chip row that used to sit here permanently has moved there. */}
        {activeTag && (
          <TouchableOpacity
            onPress={() => setActiveTag(null)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: c.cardLavender, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start' }}
            accessibilityRole="button" accessibilityLabel={`Clear topic filter ${activeTag}`}
            hitSlop={hitSlopFor(32)}
          >
            <Text style={{ color: c.primary, fontWeight: '700', fontSize: 14 }}>{activeTag}</Text>
            <Ionicons name="close" size={14} color={c.primary} />
          </TouchableOpacity>
        )}

        {/* Active hashtag banner */}
        {activeHashtag && (
          <TouchableOpacity
            onPress={() => setActiveHashtag(null)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: c.cardBlue, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start' }}
            accessibilityRole="button" accessibilityLabel={`Clear hashtag filter #${activeHashtag}`}
            hitSlop={hitSlopFor(32)}
          >
            <Text style={{ color: c.blue, fontWeight: '700', fontSize: 14 }}>#{activeHashtag}</Text>
            <Ionicons name="close" size={14} color={c.blue} />
          </TouchableOpacity>
        )}

        {/* Active post-type filter — set by "See more <Type>s" in a
            PostTypeBadge popover, on Home or handed off from elsewhere. */}
        {activePostType && (() => {
          const label = activePostType === 'milestone' ? 'Celebration' : activePostType === 'question' ? 'Question' : activePostType === 'poll' ? 'Poll' : 'Update';
          const tint = activePostType === 'milestone' ? c.postMilestone : activePostType === 'question' ? c.postQuestion : activePostType === 'poll' ? c.postPoll : c.postText;
          return (
            <TouchableOpacity
              onPress={() => setActivePostType(null)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: tint + '1A', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start' }}
              accessibilityRole="button" accessibilityLabel={`Clear ${label} filter`}
              hitSlop={hitSlopFor(32)}
            >
              <Text style={{ color: tint, fontWeight: '700', fontSize: 14 }}>{label} posts</Text>
              <Ionicons name="close" size={14} color={tint} />
            </TouchableOpacity>
          );
        })()}

        {/* Followed Q+A questions */}
        {feedMode !== 'patches' && followedQuestions.length > 0 && (
          <View style={styles.followedQSection}>
            <Text style={styles.sectionTitle}>Questions You're Following</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.followedQScroll}>
              {followedQuestions.map(q => (
                <TouchableOpacity
                  key={q.id}
                  style={styles.followedQCard}
                  onPress={() => setQaDetailId(q.id)}
                  activeOpacity={0.8}
                  accessibilityRole="button" accessibilityLabel={`Open question: ${q.content}`}
                >
                  <Text style={styles.followedQContent} numberOfLines={3}>{q.content}</Text>
                  <View style={styles.followedQMeta}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="chatbubble-outline" size={12} color={c.textMuted} />
                      <Text style={styles.followedQMetaText}>{q.answer_count}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="arrow-up-outline" size={12} color={c.textMuted} />
                      <Text style={styles.followedQMetaText}>{q.vote_score}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Trending posts */}
        {feedMode !== 'patches' && trendingPosts.length >= 2 && (
          <View style={{ marginBottom: 16 }}>
            <View style={styles.forYouHeader}>
              <Ionicons name="flame" size={18} color={c.blush} />
              <Text style={styles.forYouTitle}>Trending</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {trendingPosts.map(post => { const authorName = resolveAuthorName(post); return (
                <TouchableOpacity
                  key={post.id}
                  style={styles.trendingCard}
                  onPress={() => openComments(post.id)}
                  activeOpacity={0.85}
                  accessibilityRole="button" accessibilityLabel={`Open post by ${authorName}`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <UserAvatar userId={post.user_id} name={authorName} size={24} />
                    <Text style={styles.trendingCardAuthor} numberOfLines={1}>{authorName}</Text>
                    <PostTypeBadge postType={post.post_type} size={12} />
                  </View>
                  {post.content ? (
                    <Text style={styles.trendingCardContent} numberOfLines={3}>{post.content}</Text>
                  ) : post.image_url ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="image-outline" size={13} color={c.textMuted} />
                      <Text style={styles.trendingCardContent}>Photo</Text>
                    </View>
                  ) : post.video_url ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="videocam-outline" size={13} color={c.textMuted} />
                      <Text style={styles.trendingCardContent}>Video</Text>
                    </View>
                  ) : null}
                  {post.tags && post.tags.length > 0 && (
                    <Text style={styles.trendingCardTag}>{post.tags[0]}</Text>
                  )}
                  <View style={styles.trendingCardFooter}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="heart" size={12} color={c.blush} />
                      <Text style={styles.trendingCardStat}>{post.likes || 0}</Text>
                    </View>
                    <Text style={styles.trendingCardTime}>{getTimeAgo(post.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              );})}
            </ScrollView>
          </View>
        )}

        {/* ── Post feeds (For You / Following / Friends) ───────────────────────── */}
        {feedInitialLoading && filteredPosts.length === 0 && (
          <View style={styles.emptyFeed}>
            <ActivityIndicator color={c.primary} />
          </View>
        )}
        {feedMode === 'for-you' && postsLoadError && posts.length === 0 && (
          <LoadErrorBanner message="Couldn't load your feed." onRetry={fetchPosts} />
        )}
        {!feedInitialLoading && feedMode === 'patches' && filteredPosts.length === 0 && (
          <View style={styles.emptyFeed}>
            {myVillageIdsSet.size === 0 ? (
              <>
                <Text style={styles.emptyFeedText}>Your Patches will show up here</Text>
                <Text style={[styles.emptyFeedText, { fontWeight: '500', marginTop: 4 }]}>
                  Join communities for your parenting stage, interests, or experiences.
                </Text>
                <TouchableOpacity
                  style={{ marginTop: 14, backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12 }}
                  onPress={() => navigation.navigate('Discover')}
                  accessibilityRole="button" accessibilityLabel="Discover Patches"
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Discover Patches</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.emptyFeedText}>
                It's quiet in your Patches{'\n'}Visit a community or share something to get the conversation going.
              </Text>
            )}
          </View>
        )}

        {!feedInitialLoading && feedMode !== 'patches' && filteredPosts.length === 0 && (
          <View style={styles.emptyFeed}>
            <Text style={styles.emptyFeedText}>
              {feedMode === 'friends'
                ? (friendsPosts.length === 0
                  ? 'No friends yet.\nFollow someone and when they follow you back, their posts appear here!'
                  : 'No posts match this filter.')
                : feedMode === 'following'
                ? (followingPosts.length === 0
                  ? 'You\'re not following anyone yet.\nTap a username to visit their profile and follow them!'
                  : 'No posts match this filter.')
                : (posts.length === 0 ? 'No posts yet. Be the first to share!' : 'No posts match this filter.')}
            </Text>
          </View>
        )}

        {feedItems.map((item) => (
          item.kind === 'insert'
            ? <React.Fragment key={item.key}>{item.node}</React.Fragment>
            : <React.Fragment key={item.post.id}>{renderPostCard(item.post)}</React.Fragment>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
      </View>

      {/* Desktop-only contextual right rail — never rendered on phone/tablet */}
      {isDesktop && (
        <HomeRightRail
          joinedVillages={railJoinedVillages}
          trendingTags={railTrendingTags}
          upcomingEvents={upcomingEvents}
          activeTag={activeTag}
          onSelectTag={(tag) => setActiveTag(prev => (prev === tag ? null : tag))}
          onOpenPatch={(v) => setFeedVillage(v)}
          onDiscoverPatches={() => navigation.navigate('Discover')}
          onOpenCalendar={() => navigation.navigate('Calendar')}
        />
      )}
      </View>

      {/* Search sheet */}
      <SearchSheet visible={showSearch} onClose={() => { setShowSearch(false); restoreScrollFocus(); }} />

      <HandoffNotesSheet
        visible={showHandoffNotes}
        onClose={() => {
          setShowHandoffNotes(false);
          if (activeBaby?.id) fetchLatestHandoffNote(activeBaby.id).then(setLatestHandoffNote);
        }}
      />

      {/* Baby profile sheet */}
      <BabyProfileSheet
        visible={showProfileSheet}
        onClose={() => setShowProfileSheet(false)}
      />

      {/* Public profile sheet */}
      <PublicProfileSheet
        userId={publicProfileUserId}
        visible={publicProfileUserId !== null}
        onClose={() => setPublicProfileUserId(null)}
        onMessage={(uid) => { setPublicProfileUserId(null); setMessageTargetUserId(uid); setShowMessages(true); }}
      />

      {/* Patch feed sheet — opened by tapping a post's Patch tag */}
      <VillageFeedSheet
        village={feedVillage}
        visible={feedVillage !== null}
        onClose={() => setFeedVillage(null)}
        joined={feedVillage !== null && myVillageIdsSet.has(feedVillage.id)}
        onToggleJoin={() => feedVillage && toggleVillageMembership(feedVillage.id)}
      />

      {/* Messages */}
      <Modal visible={showMessages} animationType="slide" presentationStyle="fullScreen">
        <MessagesInbox
          onBack={() => { setShowMessages(false); setMessageTargetUserId(null); if (currentUserId) fetchUnreadCount(currentUserId); restoreScrollFocus(); }}
          openWithUserId={messageTargetUserId}
        />
      </Modal>

      {/* Notifications */}
      <Modal visible={showNotifications} animationType="slide" presentationStyle="fullScreen">
        <NotificationsScreen
          onBack={() => { setShowNotifications(false); if (currentUserId) fetchUnreadNotifCount(currentUserId); restoreScrollFocus(); }}
        />
      </Modal>

      {/* Comments modal */}
      <Modal
        visible={commentPostId !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setCommentPostId(null); setSelectedPost(null); }}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Post</Text>
            <TouchableOpacity onPress={() => { setCommentPostId(null); setSelectedPost(null); }}
              accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={c.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.commentsList} contentContainerStyle={styles.commentsContent}>
            {/* Full post content */}
            {selectedPost && (
              <View style={{ marginBottom: 4 }}>
                <View style={styles.postHeader}>
                  <TouchableOpacity
                    style={styles.postAuthorRow}
                    onPress={() => { setCommentPostId(null); setSelectedPost(null); setPublicProfileUserId(selectedPost.user_id); }}
                    activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel={`View ${resolveAuthorName(selectedPost)}'s profile`}
                  >
                    <UserAvatar userId={selectedPost.user_id} name={resolveAuthorName(selectedPost)} size={36} />
                    <View>
                      <Text style={styles.postAuthorName}>{resolveAuthorName(selectedPost)}</Text>
                      <Text style={styles.postTimestamp}>{getTimeAgo(selectedPost.created_at)}</Text>
                    </View>
                  </TouchableOpacity>
                  {currentUserId && selectedPost.user_id !== currentUserId && (
                    <TouchableOpacity
                      onPress={() => handleFollowToggle(selectedPost.user_id)}
                      style={[styles.followBtn, followingUserIds.has(selectedPost.user_id) && styles.followBtnActive]}
                      activeOpacity={0.75}
                      accessibilityRole="button" accessibilityLabel={followingUserIds.has(selectedPost.user_id) ? `Unfollow ${resolveAuthorName(selectedPost)}` : `Follow ${resolveAuthorName(selectedPost)}`}
                    >
                      <Text style={[styles.followBtnText, followingUserIds.has(selectedPost.user_id) && styles.followBtnTextActive]}>
                        {followingUserIds.has(selectedPost.user_id) ? '✓ Following' : '+ Follow'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {selectedPost.content
                  ? renderTextWithMentions(selectedPost.content, styles.postContent, c.primary, openMentionedUser, tag => { setCommentPostId(null); setSelectedPost(null); setActiveHashtag(tag); })
                  : null}
                {selectedPost.image_url ? (
                  <Image source={{ uri: selectedPost.image_url }} style={styles.postImage} resizeMode="cover" />
                ) : null}
                {selectedPost.video_url ? <VideoPostPlayer uri={selectedPost.video_url} /> : null}
                {selectedPost.tags && selectedPost.tags.length > 0 && (
                  <View style={styles.postTagsRow}>
                    {selectedPost.tags.map(tag => (
                      <TouchableOpacity key={tag} onPress={() => { setCommentPostId(null); setSelectedPost(null); setActiveTag(tag); }} style={styles.postTagChip}
                        accessibilityRole="button" accessibilityLabel={`Filter by ${tag}`}>
                        <Text style={styles.postTagChipText}>{tag}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={styles.postFooter}>
                  <View>
                    {reactionPickerPostId === selectedPost.id && (
                      <View style={{
                        flexDirection: 'row', gap: 4, marginBottom: 6,
                        backgroundColor: c.card, borderRadius: 24,
                        paddingHorizontal: 10, paddingVertical: 6,
                        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
                        alignSelf: 'flex-start',
                      }}>
                        {['❤️','😂','😢','💪','🙌','👶'].map(emoji => (
                          <TouchableOpacity key={emoji} onPress={() => setReaction(selectedPost.id, emoji)} style={{ padding: 4 }}
                            accessibilityRole="button" accessibilityLabel={`React with ${emoji}`}>
                            <Text style={{
                              fontSize: myReactions.get(selectedPost.id) === emoji ? 26 : 22,
                              opacity: myReactions.get(selectedPost.id) && myReactions.get(selectedPost.id) !== emoji ? 0.5 : 1,
                            }}>{emoji}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.postAction}
                      onPress={() => setReactionPickerPostId(prev => prev === selectedPost.id ? null : selectedPost.id)}
                      hitSlop={hitSlopFor(24)}
                      accessibilityRole="button" accessibilityLabel="React to post"
                      accessibilityState={{ selected: !!myReactions.get(selectedPost.id) }}
                    >
                      {(() => {
                        const myR = myReactions.get(selectedPost.id);
                        const counts = reactionCounts.get(selectedPost.id) || {};
                        const total = Object.values(counts).reduce((a, b) => a + b, 0);
                        const topEmojis = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e);
                        return (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {myR || topEmojis.length ? (
                              <Text style={{ fontSize: 15 }}>{myR || topEmojis.join('')}</Text>
                            ) : (
                              <Ionicons name="heart-outline" size={18} color={c.textMuted} />
                            )}
                            <Text style={[styles.postActionText, myR ? styles.likedText : null]}>
                              {total > 0 ? total : ''}
                            </Text>
                          </View>
                        );
                      })()}
                    </TouchableOpacity>
                  </View>
                  {currentUserId && selectedPost.user_id !== currentUserId && (
                    <TouchableOpacity style={[styles.postAction, { gap: 4 }]} onPress={() => handleRepost(selectedPost)}
                      hitSlop={hitSlopFor(24)}
                      accessibilityRole="button" accessibilityLabel="Repost"
                      accessibilityState={{ selected: myRepostIds.has(selectedPost.id) }}>
                      <Ionicons name="repeat" size={19} color={myRepostIds.has(selectedPost.id) ? c.sage : c.textMuted} />
                      {repostCounts.get(selectedPost.id) ? (
                        <Text style={[styles.postActionText, myRepostIds.has(selectedPost.id) && { color: c.sage, fontWeight: '700' }]}>
                          {repostCounts.get(selectedPost.id)}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.postAction} onPress={() => handleShare(selectedPost)}
                    hitSlop={hitSlopFor(24)}
                    accessibilityRole="button" accessibilityLabel="Share post">
                    <Ionicons name="arrow-redo-outline" size={17} color={c.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.postAction, { marginLeft: 'auto' as any }]}
                    onPress={() => toggleSave(selectedPost.id)}
                    hitSlop={hitSlopFor(24)}
                    accessibilityRole="button" accessibilityLabel={savedPostIds.has(selectedPost.id) ? 'Unsave post' : 'Save post'}
                    accessibilityState={{ selected: savedPostIds.has(selectedPost.id) }}
                  >
                    <Ionicons
                      name={savedPostIds.has(selectedPost.id) ? 'bookmark' : 'bookmark-outline'}
                      size={17}
                      color={savedPostIds.has(selectedPost.id) ? c.primary : c.textMuted}
                    />
                  </TouchableOpacity>
                </View>
                <View style={{ height: 1, backgroundColor: c.separator, marginTop: 8, marginBottom: 12 }} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textMuted, marginBottom: 8 }}>
                  {comments.length > 0 ? `${comments.length} Comment${comments.length !== 1 ? 's' : ''}` : 'Comments'}
                </Text>
              </View>
            )}

            {comments.length === 0 ? (
              <Text style={styles.noComments}>No comments yet. Start the conversation!</Text>
            ) : (
              comments.map(cm => (
                <View key={cm.id}>
                  <View style={styles.commentItem}>
                    <UserAvatar userId={cm.user_id} name={resolveAuthorName(cm)} size={32} />
                    <View style={styles.commentBody}>
                      <Text style={styles.commentAuthor}>{resolveAuthorName(cm)}</Text>
                      {renderTextWithMentions(cm.content, styles.commentContent, c.primary)}
                      <View style={styles.commentMeta}>
                        <Text style={styles.commentTime}>{getTimeAgo(cm.created_at)}</Text>
                        <TouchableOpacity onPress={() => { setReplyingTo(cm); setCommentText(''); }}
                          accessibilityRole="button" accessibilityLabel={`Reply to ${resolveAuthorName(cm)}`}>
                          <Text style={styles.replyBtn}>Reply</Text>
                        </TouchableOpacity>
                        {currentUserId && cm.user_id !== currentUserId && (
                          reportedCommentIds.has(cm.id) ? (
                            <Text style={{ fontSize: 11, color: c.textMuted, fontStyle: 'italic' }}>Reported</Text>
                          ) : (
                            <TouchableOpacity onPress={() => { setReportCommentId(cm.id); setReportCommentReason(''); setReportCommentDone(false); }}
                              accessibilityRole="button" accessibilityLabel="Report comment">
                              <Ionicons name="flag-outline" size={13} color={c.textMuted} />
                            </TouchableOpacity>
                          )
                        )}
                      </View>
                    </View>
                  </View>
                  {cm.replies && cm.replies.length > 0 && (
                    <View style={styles.repliesContainer}>
                      {cm.replies.map(reply => (
                        <View key={reply.id} style={styles.commentItem}>
                          <UserAvatar userId={reply.user_id} name={resolveAuthorName(reply)} size={26} />
                          <View style={styles.commentBody}>
                            <Text style={styles.commentAuthor}>{resolveAuthorName(reply)}</Text>
                            {renderTextWithMentions(reply.content, styles.commentContent, c.primary)}
                            <Text style={styles.commentTime}>{getTimeAgo(reply.created_at)}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {replyingTo && (
              <View style={styles.replyingToBanner}>
                <Text style={styles.replyingToText}>Replying to <Text style={{ fontWeight: '700' }}>@{resolveAuthorName(replyingTo)}</Text></Text>
                <TouchableOpacity onPress={() => { setReplyingTo(null); setCommentText(''); }}
                  accessibilityRole="button" accessibilityLabel="Cancel reply">
                  <Ionicons name="close" size={16} color={styles.replyingToCancel.color} />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.commentInputRow}>
              <View style={{ flex: 1 }}>
                <MentionTextInput
                  suggestionsAbove
                  style={styles.commentInput}
                  placeholder={replyingTo ? `Reply to @${resolveAuthorName(replyingTo)}...` : 'Add a comment... (type @ to mention)'}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  accessibilityLabel={replyingTo ? `Reply to ${resolveAuthorName(replyingTo)}` : 'Add a comment'}
                />
              </View>
              <TouchableOpacity
                style={[styles.commentSubmit, !commentText.trim() && styles.submitButtonDisabled]}
                onPress={submitComment}
                disabled={!commentText.trim()}
                accessibilityRole="button" accessibilityLabel="Post comment"
              >
                <Text style={styles.commentSubmitText}>Post</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      {/* Report post modal */}
      <Modal
        visible={reportPostId !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setReportPostId(null); setReportDone(false); }}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Report Post</Text>
            <TouchableOpacity onPress={() => { setReportPostId(null); setReportDone(false); }}
              accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={c.textMuted} />
            </TouchableOpacity>
          </View>
          {reportDone ? (
            <View style={styles.reportDoneContainer}>
              <Ionicons name="checkmark-circle" size={44} color={c.sage} style={styles.reportDoneEmoji} />
              <Text style={styles.reportDoneTitle}>Report Submitted</Text>
              <Text style={styles.reportDoneBody}>Thank you for helping keep the community safe. We'll review this post.</Text>
              <TouchableOpacity
                style={styles.reportCloseBtn}
                onPress={() => { setReportPostId(null); setReportDone(false); }}
                accessibilityRole="button" accessibilityLabel="Close"
              >
                <Text style={styles.reportCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text style={styles.reportPrompt}>Why are you reporting this post?</Text>
              {['Spam', 'Inappropriate content', 'Harassment', 'Misinformation', 'Other'].map(reason => (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reportReasonBtn, reportReason === reason && styles.reportReasonBtnActive]}
                  onPress={() => setReportReason(reason)}
                  accessibilityRole="button" accessibilityLabel={reason}
                >
                  <Text style={[styles.reportReasonText, reportReason === reason && styles.reportReasonTextActive]}>
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.reportSubmitBtn, (!reportReason || reportSubmitting) && styles.submitButtonDisabled]}
                onPress={submitReport}
                disabled={!reportReason || reportSubmitting}
                accessibilityRole="button" accessibilityLabel="Submit report"
              >
                {reportSubmitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.reportSubmitBtnText}>Submit Report</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Report comment modal */}
      <Modal
        visible={reportCommentId !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setReportCommentId(null); setReportCommentDone(false); }}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Report Comment</Text>
            <TouchableOpacity onPress={() => { setReportCommentId(null); setReportCommentDone(false); }}
              accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={c.textMuted} />
            </TouchableOpacity>
          </View>
          {reportCommentDone ? (
            <View style={styles.reportDoneContainer}>
              <Ionicons name="checkmark-circle" size={44} color={c.sage} style={styles.reportDoneEmoji} />
              <Text style={styles.reportDoneTitle}>Report Submitted</Text>
              <Text style={styles.reportDoneBody}>Thank you for helping keep the community safe. We'll review this comment.</Text>
              <TouchableOpacity
                style={styles.reportCloseBtn}
                onPress={() => { setReportCommentId(null); setReportCommentDone(false); }}
                accessibilityRole="button" accessibilityLabel="Close"
              >
                <Text style={styles.reportCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text style={styles.reportPrompt}>Why are you reporting this comment?</Text>
              {['Spam', 'Inappropriate content', 'Harassment', 'Misinformation', 'Other'].map(reason => (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reportReasonBtn, reportCommentReason === reason && styles.reportReasonBtnActive]}
                  onPress={() => setReportCommentReason(reason)}
                  accessibilityRole="button" accessibilityLabel={reason}
                >
                  <Text style={[styles.reportReasonText, reportCommentReason === reason && styles.reportReasonTextActive]}>
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.reportSubmitBtn, (!reportCommentReason || reportCommentSubmitting) && styles.submitButtonDisabled]}
                onPress={submitCommentReport}
                disabled={!reportCommentReason || reportCommentSubmitting}
                accessibilityRole="button" accessibilityLabel="Submit report"
              >
                {reportCommentSubmitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.reportSubmitBtnText}>Submit Report</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Floating action button — opens the same global create-options sheet as
          the bottom-nav Create tab (owned at the app root, see App.tsx), so
          there's one consistent entry point regardless of where it's tapped from. */}
      <TouchableOpacity
        ref={fabRef}
        style={styles.fab}
        onPress={requestCreate}
        activeOpacity={0.85}
        accessibilityRole="button" accessibilityLabel="Create"
      >
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>

      <CoachMarkTour
        steps={tourSteps}
        visible={tourVisible}
        onDismiss={handleTourDismiss}
        c={c}
        scrollRef={mainScrollRef}
        scrollOffsetRef={mainScrollYRef}
      />

      {/* Q+A detail modal */}
      <Modal
        visible={qaDetailId !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setQaDetailId(null)}
      >
        {qaDetailId && (
          <QAScreen
            initialQuestionId={qaDetailId}
            onBack={() => setQaDetailId(null)}
          />
        )}
      </Modal>

      {/* Create post modal */}
      <Modal
        visible={showCreatePost}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowCreatePost(false); setPendingPostImageUri(null); setDismissedHealthBanner(false); }}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setShowCreatePost(false); setPendingPostImageUri(null); setDismissedHealthBanner(false); }}
              accessibilityRole="button" accessibilityLabel="Cancel new post">
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Post</Text>
            {isOneHanded
              ? <View style={{ width: 60 }} />
              : (
                <TouchableOpacity
                  style={[
                    styles.postModalSubmitBtn,
                    (!postContent.trim() && !pendingPostImageUri && !pendingPostVideoUri) && styles.submitButtonDisabled,
                  ]}
                  onPress={handleCreatePost}
                  disabled={(!postContent.trim() && !pendingPostImageUri && !pendingPostVideoUri) || imageUploading}
                  accessibilityRole="button" accessibilityLabel="Submit post"
                >
                  {imageUploading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.postModalSubmitText}>Post</Text>
                  }
                </TouchableOpacity>
              )
            }
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              contentContainerStyle={{ padding: 20, paddingBottom: isOneHanded ? 100 + insets.bottom : 20 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.postTypeSelector}>
                {(['text', 'milestone', 'question', 'poll'] as Post['post_type'][]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.postTypeButton, postType === t && styles.postTypeButtonActive, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                    onPress={() => setPostType(t)}
                    accessibilityRole="button" accessibilityLabel={`${t} post type`}
                  >
                    <Ionicons
                      name={t === 'text' ? 'chatbubble-outline' : t === 'milestone' ? 'trophy-outline' : t === 'question' ? 'help-circle-outline' : 'bar-chart-outline'}
                      size={14}
                      color={postType === t ? styles.postTypeTextActive.color : styles.postTypeText.color}
                    />
                    <Text style={[styles.postTypeText, postType === t && styles.postTypeTextActive]}>
                      {t === 'text' ? 'Update' : t === 'milestone' ? 'Milestone' : t === 'question' ? 'Question' : 'Poll'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <MentionTextInput
                style={styles.postInput}
                placeholder={
                  postType === 'milestone' ? 'Share a milestone...' :
                  postType === 'question' ? 'Ask the community...' :
                  postType === 'poll' ? 'Ask a poll question...' :
                  "What's on your mind?"
                }
                value={postContent}
                onChangeText={setPostContent}
                multiline
                numberOfLines={postType === 'poll' ? 3 : 6}
                autoFocus
                textAlignVertical="top"
                accessibilityLabel="Post content"
              />

              {showMentalHealthBanner && !dismissedHealthBanner && (
                <View style={{
                  backgroundColor: c.reminderWarning.bg, borderRadius: 12, padding: 14, marginTop: 8,
                  borderLeftWidth: 4, borderLeftColor: c.reminderWarning.border,
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.reminderWarning.text, flex: 1, marginRight: 8 }}>
                      You're not alone 💛
                    </Text>
                    <TouchableOpacity onPress={() => setDismissedHealthBanner(true)}
                      hitSlop={hitSlopFor(22)}
                      accessibilityRole="button" accessibilityLabel="Dismiss support banner">
                      <Ionicons name="close" size={16} color={c.reminderWarning.text} style={{ opacity: 0.6 }} />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 13, color: c.reminderWarning.text, marginTop: 4, lineHeight: 18 }}>
                    It sounds like you might be going through a tough time. Free, confidential support is available.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      onPress={() => Linking.openURL('https://www.postpartum.net')}
                      style={{ backgroundColor: c.reminderWarning.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                      accessibilityRole="link" accessibilityLabel="Open Postpartum Support website"
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: c.textOnColored }}>Postpartum Support</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => Linking.openURL('tel:988')}
                      style={{ backgroundColor: c.reminderWarning.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                      accessibilityRole="button" accessibilityLabel="Call or text 988"
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: c.textOnColored }}>Call/Text 988</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {postType === 'poll' && (
                <View style={{ marginTop: 12, gap: 8 }}>
                  {pollOptions.map((opt, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        style={[styles.postInput, { flex: 1, minHeight: 44, marginTop: 0, paddingVertical: 10 }]}
                        placeholder={`Option ${i + 1}${i < 2 ? ' (required)' : ''}`}
                        value={opt}
                        onChangeText={text => setPollOptions(prev => prev.map((o, j) => j === i ? text : o))}
                        accessibilityLabel={`Poll option ${i + 1}`}
                      />
                      {i >= 2 && (
                        <TouchableOpacity onPress={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}
                          accessibilityRole="button" accessibilityLabel={`Remove option ${i + 1}`}>
                          <Ionicons name="close" size={18} color={c.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  {pollOptions.length < 4 && (
                    <TouchableOpacity
                      onPress={() => setPollOptions(prev => [...prev, ''])}
                      style={{ paddingVertical: 8 }}
                      accessibilityRole="button" accessibilityLabel="Add poll option"
                    >
                      <Text style={{ fontSize: 14, color: c.primary, fontWeight: '600' }}>+ Add option</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Topic tag selector */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted, marginTop: 12, marginBottom: 8 }}>
                Add topic tags
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {POST_TAGS.map(tag => {
                    const active = selectedTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        onPress={() => setSelectedTags(prev => active ? prev.filter(t => t !== tag) : [...prev, tag])}
                        style={[styles.tagChip, active && styles.tagChipActive]}
                        accessibilityRole="button" accessibilityLabel={`${active ? 'Remove' : 'Add'} ${tag} tag`}
                      >
                        <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>{tag}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Sensitive content toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.textPrimary }}>Mark as sensitive</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }}>A warning is shown before your post</Text>
                </View>
                <TouchableOpacity
                  onPress={() => { setIsSensitive(v => !v); setSensitiveLabel(''); }}
                  style={{
                    width: 44, height: 26, borderRadius: 13,
                    backgroundColor: isSensitive ? c.primary : c.separator,
                    justifyContent: 'center', paddingHorizontal: 3,
                    alignItems: isSensitive ? 'flex-end' : 'flex-start',
                  }}
                  accessibilityRole="switch" accessibilityLabel="Mark as sensitive" accessibilityState={{ checked: isSensitive }}
                >
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' }} />
                </TouchableOpacity>
              </View>
              {isSensitive && (
                <View style={{ gap: 6, marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600' }}>Select a label (optional)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {['Pregnancy Loss', 'NICU / Premature Birth', 'Birth Trauma', 'Postpartum Mental Health', 'Medical / Graphic'].map(label => (
                      <TouchableOpacity
                        key={label}
                        onPress={() => setSensitiveLabel(prev => prev === label ? '' : label)}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: sensitiveLabel === label ? c.primary : c.separator,
                          backgroundColor: sensitiveLabel === label ? c.cardLavender : c.card,
                        }}
                        accessibilityRole="button" accessibilityLabel={label}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: sensitiveLabel === label ? c.primary : c.textMuted }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {pendingPostImageUri && (
                <View style={styles.postImagePreviewWrap}>
                  <Image
                    source={{ uri: pendingPostImageUri }}
                    style={styles.postImagePreview}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={styles.removePostImageBtn}
                    onPress={() => setPendingPostImageUri(null)}
                    accessibilityRole="button" accessibilityLabel="Remove photo"
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

              {pendingPostVideoUri && (
                <View style={styles.postImagePreviewWrap}>
                  <VideoPostPlayer uri={pendingPostVideoUri} />
                  <TouchableOpacity
                    style={styles.removePostImageBtn}
                    onPress={() => setPendingPostVideoUri(null)}
                    accessibilityRole="button" accessibilityLabel="Remove video"
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[styles.addPhotoBtn, { flexDirection: 'row', alignItems: 'center', gap: 6 }]} onPress={pickPostImage}
                  accessibilityRole="button" accessibilityLabel="Add photo">
                  <Ionicons name="image-outline" size={16} color={c.primary} />
                  <Text style={styles.addPhotoBtnText}>Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.addPhotoBtn, { backgroundColor: c.cardLavender, flexDirection: 'row', alignItems: 'center', gap: 6 }]} onPress={pickPostVideo}
                  accessibilityRole="button" accessibilityLabel="Add video">
                  <Ionicons name="videocam-outline" size={16} color={c.primary} />
                  <Text style={styles.addPhotoBtnText}>Video</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>

          {isOneHanded && (
            <View style={[styles.oneHandedPostTray, { paddingBottom: insets.bottom + 8 }]}>
              <TouchableOpacity
                style={[
                  styles.oneHandedPostBtn,
                  (!postContent.trim() && !pendingPostImageUri && !pendingPostVideoUri) && styles.submitButtonDisabled,
                ]}
                onPress={handleCreatePost}
                disabled={(!postContent.trim() && !pendingPostImageUri && !pendingPostVideoUri) || imageUploading}
                accessibilityRole="button" accessibilityLabel="Submit post"
              >
                {imageUploading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.oneHandedPostBtnText}>Post</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Story viewer */}
      <StoryViewer
        visible={showStoryViewer}
        groups={storyViewGroups}
        startGroupIndex={storyViewGroupIndex}
        onClose={() => setShowStoryViewer(false)}
      />

      {/* Add Story modal */}
      <Modal
        visible={showAddStory}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddStory(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddStory(false)}
              accessibilityRole="button" accessibilityLabel="Cancel new story">
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Story</Text>
            <TouchableOpacity
              style={[styles.postModalSubmitBtn,
                ((storyMode === 'photo' && !storyImageUri) || (storyMode === 'video' && !storyVideoUri) || (storyMode === 'text' && !storyText.trim()) || storySubmitting)
                  && styles.submitButtonDisabled]}
              onPress={handleSubmitStory}
              disabled={(storyMode === 'photo' && !storyImageUri) || (storyMode === 'video' && !storyVideoUri) || (storyMode === 'text' && !storyText.trim()) || storySubmitting}
              accessibilityRole="button" accessibilityLabel="Share story"
            >
              {storySubmitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.postModalSubmitText}>Share</Text>
              }
            </TouchableOpacity>
          </View>

          {/* Mode toggle */}
          <View style={{ flexDirection: 'row', margin: 20, marginBottom: 0, gap: 8 }}>
            {(['photo', 'video', 'text'] as const).map(mode => (
              <TouchableOpacity
                key={mode}
                style={[styles.postTypeButton, storyMode === mode && styles.postTypeButtonActive, { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }]}
                onPress={() => setStoryMode(mode)}
                accessibilityRole="button" accessibilityLabel={`${mode} story`}
              >
                <Ionicons
                  name={mode === 'photo' ? 'image-outline' : mode === 'video' ? 'videocam-outline' : 'create-outline'}
                  size={14}
                  color={storyMode === mode ? styles.postTypeTextActive.color : styles.postTypeText.color}
                />
                <Text style={[styles.postTypeText, storyMode === mode && styles.postTypeTextActive, { textAlign: 'center' }]}>
                  {mode === 'photo' ? 'Photo' : mode === 'video' ? 'Video' : 'Text'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              {storyMode === 'photo' ? (
                <>
                  {storyImageUri ? (
                    <View style={styles.postImagePreviewWrap}>
                      <Image source={{ uri: storyImageUri }} style={[styles.postImagePreview, { height: 360 }]} resizeMode="cover" />
                      <TouchableOpacity style={styles.removePostImageBtn} onPress={() => setStoryImageUri(null)}
                        accessibilityRole="button" accessibilityLabel="Remove photo">
                        <Ionicons name="close" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={[styles.addPhotoBtn, { paddingVertical: 48, alignItems: 'center' }]} onPress={pickStoryImage}
                      accessibilityRole="button" accessibilityLabel="Pick a photo for story">
                      <Ionicons name="image-outline" size={36} color={c.primary} style={{ marginBottom: 12 }} />
                      <Text style={[styles.addPhotoBtnText, { textAlign: 'center' }]}>Tap to pick a photo</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : storyMode === 'video' ? (
                <>
                  {storyVideoUri ? (
                    <View style={styles.postImagePreviewWrap}>
                      <VideoPostPlayer uri={storyVideoUri} />
                      <TouchableOpacity style={styles.removePostImageBtn} onPress={() => setStoryVideoUri(null)}
                        accessibilityRole="button" accessibilityLabel="Remove video">
                        <Ionicons name="close" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={[styles.addPhotoBtn, { paddingVertical: 48, backgroundColor: c.cardLavender, alignItems: 'center' }]} onPress={pickStoryVideo}
                      accessibilityRole="button" accessibilityLabel="Pick a video for story">
                      <Ionicons name="videocam-outline" size={36} color={c.primary} style={{ marginBottom: 12 }} />
                      <Text style={[styles.addPhotoBtnText, { textAlign: 'center' }]}>Tap to pick a video</Text>
                      <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 6 }}>Max 30 seconds</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <>
                  {/* Live preview */}
                  <View style={[styles.storyTextPreview, { backgroundColor: storyBgColor }]}>
                    <Text style={styles.storyTextPreviewText}>{storyText || 'Your text here…'}</Text>
                  </View>

                  <TextInput
                    style={[styles.postInput, { marginTop: 16, minHeight: 80 }]}
                    placeholder="What's on your mind?"
                    value={storyText}
                    onChangeText={setStoryText}
                    multiline
                    autoFocus
                    textAlignVertical="top"
                    accessibilityLabel="Story text"
                  />

                  {/* Color palette */}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 10 }}>
                    Background color
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {['#B1A7F0', '#FA92B1', '#94B58C', '#F9DE87', '#57B2E8', '#FF7043', '#26C6DA', '#AB47BC'].map(col => (
                      <TouchableOpacity
                        key={col}
                        onPress={() => setStoryBgColor(col)}
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: col },
                          storyBgColor === col && styles.colorSwatchSelected,
                        ]}
                        accessibilityRole="button" accessibilityLabel="Background color option"
                      />
                    ))}
                  </View>
                </>
              )}
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 20, textAlign: 'center' }}>
                Stories disappear after 24 hours
              </Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Content moderation blocked modal */}
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

      {/* Scanning indicator overlay */}
      {moderating && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center',
        }}>
          <View style={{ backgroundColor: c.card, borderRadius: 16, padding: 24, alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={c.primary} size="large" />
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.textPrimary }}>Scanning content…</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.bg,
    },
    desktopRow: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 28,
    },
    mobileRow: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingTop: 14,
      paddingBottom: 40,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    brandLogo: { width: 28, height: 28, borderRadius: 8 },
    brandText: {
      fontSize: 20,
      fontWeight: '800',
      color: c.textPrimary,
      letterSpacing: 0.2,
    },
    sectionTitle: {
      ...typography.sectionTitle,
      color: c.textSecondary,
      marginBottom: 14,
    },
    feedHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 14,
    },
    createPostButton: {
      backgroundColor: c.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
    },
    createPostButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
    createPostContainer: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    postTypeSelector: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    postTypeButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: c.inputBg,
    },
    postTypeButtonActive: {
      backgroundColor: c.cardBlush,
    },
    postTypeText: {
      fontSize: 12,
      color: c.textMuted,
      fontWeight: '500',
    },
    postTypeTextActive: {
      color: c.primary,
    },
    postInput: {
      backgroundColor: c.inputBg,
      borderRadius: 12,
      padding: 12,
      fontSize: 15,
      minHeight: 80,
      textAlignVertical: 'top',
      marginBottom: 12,
    },
    postActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
    },
    cancelText: {
      fontSize: 14,
      color: c.textMuted,
    },
    submitButton: {
      backgroundColor: c.primary,
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 20,
    },
    submitButtonDisabled: {
      backgroundColor: c.primaryDisabled,
    },
    submitButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
    postCard: {
      backgroundColor: c.bg,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    postHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    postAuthorRow: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    postAuthorName: {
      ...typography.postAuthor,
      color: c.textPrimary,
    },
    postTimestamp: {
      ...typography.postMeta,
      color: c.textMuted,
      marginTop: 1,
    },
    postHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    postBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    followBtn: {
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    followBtnActive: {
      backgroundColor: c.cardLavender,
    },
    followBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.primary,
    },
    followBtnTextActive: {
      color: c.primary,
    },
    postContent: {
      fontSize: 15,
      lineHeight: 22,
      color: c.textSecondary,
      marginBottom: 12,
    },
    postFooter: {
      flexDirection: 'row',
      gap: 20,
      paddingTop: 10,
    },
    postAction: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    postActionText: {
      fontSize: 13,
      color: c.textMuted,
    },
    likedText: {
      color: c.blush,
      fontWeight: '600',
    },
    // ── Comments modal ──────────────────────────────────────────────────────────
    modalSafeArea: {
      flex: 1,
      backgroundColor: c.bg,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.inputBg,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textSecondary,
    },
    modalClose: {
      fontSize: 18,
      color: c.textMuted,
      paddingHorizontal: 4,
    },
    commentsList: {
      flex: 1,
    },
    commentsContent: {
      padding: 20,
      paddingBottom: 12,
    },
    noComments: {
      textAlign: 'center',
      color: c.textMuted,
      fontSize: 15,
      marginTop: 40,
    },
    commentItem: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 18,
    },
    commentAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.boyBg,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    commentAvatarText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.primary,
    },
    commentBody: {
      flex: 1,
    },
    commentAuthor: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 2,
    },
    commentContent: {
      fontSize: 14,
      color: c.textSecondary,
      lineHeight: 20,
      marginBottom: 4,
    },
    commentTime: {
      fontSize: 11,
      color: c.textMuted,
    },
    commentMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 2,
    },
    replyBtn: {
      fontSize: 12,
      fontWeight: '600',
      color: c.primary,
    },
    repliesContainer: {
      marginLeft: 44,
      paddingLeft: 12,
      borderLeftWidth: 2,
      borderLeftColor: c.inputBorder,
      marginBottom: 8,
    },
    replyingToBanner: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: c.inputBg,
      borderTopWidth: 1,
      borderTopColor: c.inputBorder,
    },
    replyingToText: {
      fontSize: 13,
      color: c.textMuted,
    },
    replyingToCancel: {
      fontSize: 15,
      color: c.textMuted,
      paddingHorizontal: 4,
    },
    commentInputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: c.inputBg,
      backgroundColor: c.bg,
    },
    commentInput: {
      flex: 1,
      backgroundColor: c.inputBg,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      maxHeight: 100,
    },
    commentSubmit: {
      backgroundColor: c.primary,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    commentSubmitText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    emptyFeed: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 32,
      alignItems: 'center',
      marginBottom: 10,
    },
    emptyFeedText: {
      fontSize: 15,
      color: c.textMuted,
      textAlign: 'center',
    },
    // ── Feed toggle (For You / Following) ──────────────────────────────────────
    feedToggleRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
      marginBottom: 4,
    },
    feedToggleBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      position: 'relative',
    },
    feedToggleText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textMuted,
    },
    feedToggleTextActive: {
      color: c.textPrimary,
      fontWeight: '700',
    },
    feedToggleUnderline: {
      position: 'absolute',
      bottom: 0,
      left: '20%' as any,
      right: '20%' as any,
      height: 2.5,
      borderRadius: 2,
      backgroundColor: c.primary,
    },
    // ── For You header (kept for Trending section)
    forYouHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 14,
      gap: 8,
    },
    forYouDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.blush,
    },
    forYouTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textSecondary,
    },
    // ── Report modal ────────────────────────────────────────────────────────────
    reportPrompt: {
      fontSize: 16,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 16,
    },
    reportReasonBtn: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: c.cardHoney,
      marginBottom: 8,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    reportReasonBtnActive: {
      borderColor: c.primary,
      backgroundColor: c.cardBlush,
    },
    reportReasonText: {
      fontSize: 15,
      color: c.textSecondary,
      fontWeight: '500',
    },
    reportReasonTextActive: {
      color: c.primary,
      fontWeight: '700',
    },
    reportSubmitBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 12,
    },
    reportSubmitBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 15,
    },
    reportDoneContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    reportDoneEmoji: {
      fontSize: 48,
      marginBottom: 16,
    },
    reportDoneTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: c.textSecondary,
      marginBottom: 8,
    },
    reportDoneBody: {
      fontSize: 15,
      color: c.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 24,
    },
    reportCloseBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 32,
    },
    reportCloseBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 15,
    },
    // ── Followed Q+A questions ─────────────────────────────────────────────────
    followedQSection: { marginBottom: 16 },
    followedQScroll: { paddingHorizontal: 4, gap: 10 },
    followedQCard: {
      width: 200,
      backgroundColor: c.cardLavender,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1.5,
      borderColor: c.lavender,
      gap: 8,
      justifyContent: 'space-between',
    },
    followedQContent: {
      fontSize: 13,
      fontWeight: '500',
      color: c.textPrimary,
      lineHeight: 19,
    },
    followedQMeta: { flexDirection: 'row', gap: 10 },
    followedQMetaText: { fontSize: 12, color: c.textMuted, fontWeight: '600' },

    // ── Post image (in feed cards) ──────────────────────────────────────────────
    postImage: {
      width: '100%',
      aspectRatio: 4 / 3,
      borderRadius: 12,
      marginBottom: 12,
      backgroundColor: '#F0EBE4',
    },
    // ── FAB ────────────────────────────────────────────────────────────────────
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 8,
    },
    fabIcon: {
      color: '#fff',
      fontSize: 30,
      fontWeight: '300',
      lineHeight: 34,
      marginTop: -2,
    },
    // ── Create post modal ───────────────────────────────────────────────────────
    postModalSubmitBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: 18,
      paddingVertical: 7,
      borderRadius: 20,
    },
    postModalSubmitText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },
    oneHandedPostTray: {
      borderTopWidth: 1.5,
      borderTopColor: c.separator,
      backgroundColor: c.bg,
      paddingHorizontal: 20,
      paddingTop: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.07,
      shadowRadius: 8,
      elevation: 10,
    },
    oneHandedPostBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center' as const,
    },
    oneHandedPostBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
      letterSpacing: 0.3,
    },
    postImagePreviewWrap: {
      marginBottom: 12,
      borderRadius: 12,
      overflow: 'hidden',
      position: 'relative',
    },
    postImagePreview: {
      width: '100%',
      height: 220,
      borderRadius: 12,
      backgroundColor: '#F0EBE4',
    },
    removePostImageBtn: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    removePostImageText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
    },
    addPhotoBtn: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: c.cardBlush,
      alignSelf: 'flex-start',
    },
    addPhotoBtnText: {
      fontSize: 14,
      color: c.primary,
      fontWeight: '600',
    },
    // ── Trending cards ────────────────────────────────────────────────────────────
    trendingCard: {
      width: 210,
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 6,
      elevation: 3,
      borderWidth: 1,
      borderColor: c.separator,
    },
    trendingCardAuthor: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textPrimary,
      flex: 1,
    },
    trendingCardContent: {
      fontSize: 13,
      color: c.textSecondary,
      lineHeight: 19,
      marginBottom: 8,
      flex: 1,
    },
    trendingCardTag: {
      fontSize: 11,
      fontWeight: '600',
      color: c.blue,
      backgroundColor: c.cardBlue,
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      marginBottom: 8,
    },
    trendingCardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 'auto' as any,
    },
    trendingCardStat: {
      fontSize: 12,
      color: c.textMuted,
      fontWeight: '600',
    },
    trendingCardTime: {
      fontSize: 11,
      color: c.textMuted,
    },
    // ── Tags ──────────────────────────────────────────────────────────────────────
    tagChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.separator,
    },
    tagChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    tagChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textMuted,
    },
    tagChipTextActive: {
      color: c.primaryText,
    },
    postTagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10,
    },
    postTagChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: c.cardBlue,
    },
    postTagChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: c.blue,
    },
    // ── Story styles ────────────────────────────────────────────────────────────
    storyTextPreview: {
      height: 260,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
      marginBottom: 4,
    },
    storyTextPreviewText: {
      fontSize: 24,
      fontWeight: '700',
      color: '#fff',
      textAlign: 'center',
      lineHeight: 34,
    },
    colorSwatch: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    colorSwatchSelected: {
      borderWidth: 3,
      borderColor: c.textPrimary,
    },
  });
}
