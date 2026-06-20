import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import MentionTextInput from '../components/MentionTextInput';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import UserAvatar from '../components/UserAvatar';
import BabyProfileSheet from './BabyProfileSheet';
import PublicProfileSheet from './PublicProfileSheet';
import SearchSheet from './SearchSheet';
import QAScreen from './QAScreen';
import MessagesInbox from './MessagesInbox';
import NotificationsScreen from './NotificationsScreen';
import EventsScreen from './EventsScreen';
import { VILLAGE_MAP } from '../lib/villageData';
import { useColors, Colors } from '../lib/theme';
import StoriesBar, { StoryGroup } from '../components/StoriesBar';
import StreakCard from '../components/StreakCard';
import StoryViewer from '../components/StoryViewer';
import { moderateImage } from '../lib/contentModeration';
import ContentBlockedModal, { ContentType } from '../components/ContentBlockedModal';
import PatchyPeek from '../components/PatchyPeek';
import { usePatchyCards } from '../lib/usePatchyCards';

import {
  Post, Comment, Stats, ReminderUrgency, Reminder,
  POST_TAGS, MENTAL_HEALTH_KEYWORDS, PART_LIMITS, PART_LABELS,
  getReminderColors,
} from '../types/feed';
import {
  todayRange, greetingFor, mlToOz, babyAgeLabel, getTimeAgo,
  showSourcePicker, uploadPostImage, uploadPostVideo,
  extractMentions, sendMentionNotifications, renderTextWithMentions,
} from '../lib/feedUtils.tsx';
import { VideoPostPlayer } from '../components/feed/VideoPostPlayer';
import PaywallGate from '../components/PaywallGate';
import { safeQuery, cacheSet, cacheGetStale } from '../lib/syncService';
import { useOneHanded } from '../lib/OneHandedContext';

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeTab() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { isOneHanded } = useOneHanded();
  const insets = useSafeAreaInsets();
  const REMINDER_COLORS = useMemo(() => getReminderColors(c), [c]);

  const { cards: patchyCards, onContainerLayout: patchyContainer, onCardLayout: patchyCard } = usePatchyCards();

  const [stats, setStats] = useState<Stats>({ feeds: 0, diapers: 0, pumpedMl: 0 });
  const [loading, setLoading] = useState(true);

  const [posts, setPosts] = useState<Post[]>([]);
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
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [baby, setBaby] = useState<{ name: string; birth_date: string; photo_url: string | null; gender: string | null } | null>(null);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [publicProfileUserId, setPublicProfileUserId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [messageTargetUserId, setMessageTargetUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
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
  const [qaDetailId, setQaDetailId] = useState<string | null>(null);

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
  const [followingPosts, setFollowingPosts] = useState<Post[]>([]);
  const [friendsPosts, setFriendsPosts] = useState<Post[]>([]);
  const [patchTasks, setPatchTasks] = useState<any[]>([]);
  const [myPatchVolunteered, setMyPatchVolunteered] = useState<Set<string>>(new Set());
  const [patchVolCounts, setPatchVolCounts] = useState<Record<string, number>>({});
  const [patchCategoryFilter, setPatchCategoryFilter] = useState<string | null>(null);

  const filteredPosts = useMemo(() => {
    const source = feedMode === 'following' ? followingPosts
      : feedMode === 'friends' ? friendsPosts
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
    return result;
  }, [posts, followingPosts, friendsPosts, feedMode, activeHashtag, activeTag, blockedUserIds, mutedUserIds, privateUnfollowedIds, currentUserId, wordFilter]);

  const showMentalHealthBanner = useMemo(() => {
    if (!postContent.trim()) return false;
    const lower = postContent.toLowerCase();
    return MENTAL_HEALTH_KEYWORDS.some(kw => lower.includes(kw));
  }, [postContent]);

  useEffect(() => {
    fetchPosts();
    fetchFollowingPosts();
    fetchFriendsPosts();
    fetchPatchFeed();
    fetchFollowingIds();
    fetchTrendingPosts();
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
      }
    });
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

    const pool: Post[] = (poolRes.data as Post[]) ?? [];
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

  async function fetchPatchFeed() {
    const { data: { user } } = await supabase.auth.getUser();
    const [tasksRes, myVolRes, allVolRes] = await Promise.all([
      (supabase.from('patch_tasks') as any)
        .select('id,creator_id,category,title,description,urgency,needed_by,status,created_at,profiles!creator_id(display_name,username)')
        .in('status', ['open', 'completed'])
        .order('urgency', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(40),
      user
        ? (supabase.from('patch_task_volunteers') as any).select('task_id').eq('user_id', user.id)
        : Promise.resolve({ data: [] }),
      (supabase.from('patch_task_volunteers') as any).select('task_id'),
    ]);
    if (tasksRes.data) {
      // Sort: emergency open first, then other open, then completed
      const open  = (tasksRes.data as any[]).filter((t: any) => t.status === 'open');
      const done  = (tasksRes.data as any[]).filter((t: any) => t.status === 'completed');
      const emerg = open.filter((t: any) => t.urgency === 'emergency');
      const rest  = open.filter((t: any) => t.urgency !== 'emergency');
      setPatchTasks([...emerg, ...rest, ...done]);
    }
    setMyPatchVolunteered(new Set((myVolRes.data ?? []).map((r: any) => r.task_id as string)));
    const counts: Record<string, number> = {};
    for (const r of (allVolRes.data ?? [])) counts[r.task_id] = (counts[r.task_id] ?? 0) + 1;
    setPatchVolCounts(counts);
  }

  async function handlePatchVolunteer(taskId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase.from('patch_task_volunteers') as any).insert({ task_id: taskId, user_id: user.id });
    setMyPatchVolunteered(prev => new Set([...prev, taskId]));
    setPatchVolCounts(prev => ({ ...prev, [taskId]: (prev[taskId] ?? 0) + 1 }));
  }

  async function handlePatchWithdraw(taskId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase.from('patch_task_volunteers') as any).delete().eq('task_id', taskId).eq('user_id', user.id);
    setMyPatchVolunteered(prev => { const n = new Set(prev); n.delete(taskId); return n; });
    setPatchVolCounts(prev => ({ ...prev, [taskId]: Math.max(0, (prev[taskId] ?? 1) - 1) }));
  }

  function handlePatchComplete(taskId: string) {
    Alert.alert('Mark as done?', 'This will close the request.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark Done', onPress: async () => {
        await (supabase.from('patch_tasks') as any).update({ status: 'completed' }).eq('id', taskId);
        setPatchTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed' } : t));
      }},
    ]);
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
      await supabase.from('post_reactions').delete().eq('post_id', postId).eq('user_id', user.id);
      setMyReactions(prev => { const n = new Map(prev); n.delete(postId); return n; });
      setReactionCounts(prev => {
        const n = new Map(prev);
        const c = { ...(n.get(postId) || {}) };
        c[type] = Math.max(0, (c[type] || 1) - 1);
        if (!c[type]) delete c[type];
        n.set(postId, c);
        return n;
      });
    } else {
      await supabase.from('post_reactions').upsert({ post_id: postId, user_id: user.id, type }, { onConflict: 'post_id,user_id' });
      setMyReactions(prev => new Map(prev).set(postId, type));
      setReactionCounts(prev => {
        const n = new Map(prev);
        const c = { ...(n.get(postId) || {}) };
        if (current) { c[current] = Math.max(0, (c[current] || 1) - 1); if (!c[current]) delete c[current]; }
        c[type] = (c[type] || 0) + 1;
        n.set(postId, c);
        return n;
      });
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
    if (isReposted) {
      await (supabase as any).from('reposts').delete().eq('user_id', user.id).eq('post_id', post.id);
      setMyRepostIds(prev => { const n = new Set(prev); n.delete(post.id); return n; });
      setRepostCounts(prev => { const n = new Map(prev); n.set(post.id, Math.max(0, (n.get(post.id) || 1) - 1)); return n; });
    } else {
      await (supabase as any).from('reposts').insert({ user_id: user.id, post_id: post.id });
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
    if (isSaved) {
      await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', user.id);
    } else {
      await supabase.from('saved_posts').insert({ post_id: postId, user_id: user.id });
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

    await supabase.from('poll_votes').upsert(
      { post_id: postId, user_id: user.id, option_id: optionId },
      { onConflict: 'post_id,user_id' }
    );
  }

  async function openComments(postId: string) {
    const found = [...posts, ...trendingPosts].find(p => p.id === postId) ?? null;
    setSelectedPost(found);
    setComments([]);
    setReplyingTo(null);
    setCommentPostId(postId);
    if (!found) {
      const { data: postData } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
      if (postData) setSelectedPost(postData as Post);
    }
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (data) setComments(buildCommentTree(data));
  }

  function buildCommentTree(flat: Comment[]): Comment[] {
    const map = new Map<string, Comment>();
    flat.forEach(c => map.set(c.id, { ...c, replies: [] }));
    const roots: Comment[] = [];
    map.forEach(c => {
      if (c.parent_id && map.has(c.parent_id)) {
        map.get(c.parent_id)!.replies!.push(c);
      } else {
        roots.push(c);
      }
    });
    return roots;
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
      if (data) setComments(buildCommentTree(data));
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
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [9, 16], quality: 0.85 });
      if (!result.canceled && result.assets[0]) setStoryImageUri(result.assets[0].uri);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [9, 16], quality: 0.85 });
      if (!result.canceled && result.assets[0]) setStoryImageUri(result.assets[0].uri);
    }
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
            .select('name, birth_date, photo_url, gender')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

          if (baby && isActive) setBaby(baby);

          if (baby?.birth_date) {
            const ageDays = Math.floor((now - new Date(baby.birth_date).getTime()) / 86400000);
            const ageWeeks = Math.floor(ageDays / 7);
            const birthDate = new Date(baby.birth_date);
            const today = new Date();
            const sameDay = today.getDate() === birthDate.getDate();
            const monthsOld = (today.getFullYear() - birthDate.getFullYear()) * 12
              + (today.getMonth() - birthDate.getMonth());
            const name = baby.name || 'Baby';
            const WEEK_MILESTONES  = [4, 8, 12];
            const MONTH_MILESTONES = [4, 5, 6, 9, 12, 15, 18, 24];

            const isWeekMilestone  = ageDays % 7 === 0 && WEEK_MILESTONES.includes(ageWeeks);
            const isMonthMilestone = sameDay && MONTH_MILESTONES.includes(monthsOld);

            if (isMonthMilestone) {
              items.push({ id: 'milestone', emoji: '🎉', text: `${name} is ${monthsOld} months old today!`, urgency: 'milestone' });
            } else if (isWeekMilestone) {
              items.push({ id: 'milestone', emoji: '🎉', text: `${name} is ${ageWeeks} weeks old today!`, urgency: 'milestone' });
            } else {
              const ageLabel = monthsOld >= 3
                ? `${monthsOld} month${monthsOld !== 1 ? 's' : ''}`
                : `${ageWeeks} week${ageWeeks !== 1 ? 's' : ''}`;
              items.push({ id: 'age', emoji: '👶', text: `${name} is ${ageLabel} old`, urgency: 'info' });
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
              items.push({ id: 'feed_gap', emoji: '🍼', text: `Baby last fed ${label} — might be hungry!`, urgency: 'alert' });
            } else if (mins > 150) {
              items.push({ id: 'feed_gap', emoji: '🍼', text: `Baby last fed ${label} — feed time coming up`, urgency: 'warning' });
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
              items.push({ id: 'diaper_gap', emoji: '💩', text: `No diaper change logged in ${label}`, urgency: 'warning' });
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
                items.push({ id: 'supply_formula', emoji: '🍶', text: `Low on formula — ${s.quantity_remaining.toFixed(1)} oz left`, urgency: 'warning' });
              } else if (s.supply_type === 'diapers') {
                items.push({ id: 'supply_diapers', emoji: '🩺', text: `Running low on diapers — ${Math.round(s.quantity_remaining)} left`, urgency: 'warning' });
              } else if (s.supply_type === 'breastmilk') {
                items.push({ id: 'supply_milk', emoji: '🤱', text: `Milk stash low — ${(s.quantity_remaining / 29.5735).toFixed(1)} oz left`, urgency: 'warning' });
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
            items.push({ id: 'milk_expired', emoji: '🍼', urgency: 'alert',
              text: `${fridgeExpiredOz.toFixed(1)} oz of fridge milk has expired — use or discard` });
          if (fridgeTodayOz > 0)
            items.push({ id: 'milk_today', emoji: '🍼', urgency: 'alert',
              text: `${fridgeTodayOz.toFixed(1)} oz of fridge milk expires today — use or move to freezer!` });
          if (fridgeSoonOz > 0)
            items.push({ id: 'milk_soon', emoji: '🍼', urgency: 'warning',
              text: `${fridgeSoonOz.toFixed(1)} oz of fridge milk expires in 1–2 days — use or freeze soon` });
          if (freezerSoonOz > 0)
            items.push({ id: 'milk_freezer_soon', emoji: '❄️', urgency: 'warning',
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
                emoji: '🔧',
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
            items.push({ id: 'streak', emoji: '🔥', text: `7-day logging streak! You're on a roll!`, urgency: 'streak' });
          } else if (streak >= 3) {
            items.push({ id: 'streak', emoji: '⭐', text: `${streak}-day logging streak — keep it up!`, urgency: 'streak' });
          }

          if (isActive) setReminders(items);
        } catch (err: any) {
          console.warn('HomeTab fetchReminders error:', err.message);
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
      fetchFollowedQuestions();
      fetchPosts();
      fetchFollowingPosts();
      fetchFriendsPosts();
      fetchPatchFeed();
      fetchFollowingIds();
      fetchTrendingPosts();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const statCards = [
    { label: 'Feeds\nToday',   value: String(stats.feeds),           accent: c.statFeeds.accent,   bg: c.statFeeds.bg },
    { label: 'Diapers\nToday', value: String(stats.diapers),          accent: c.statDiapers.accent, bg: c.statDiapers.bg },
    { label: 'Pumped\nToday',  value: `${mlToOz(stats.pumpedMl)} oz`, accent: c.statPumped.accent,  bg: c.statPumped.bg },
  ];

  const coloredReminders = (() => {
    const allKeys: ReminderUrgency[] = ['info', 'warning', 'alert', 'milestone', 'streak'];
    const result: ReminderUrgency[] = [];
    for (let i = 0; i < reminders.length; i++) {
      const preferred = reminders[i].urgency;
      if (i === 0 || REMINDER_COLORS[preferred].bg !== REMINDER_COLORS[result[i - 1]].bg) {
        result.push(preferred);
      } else {
        const alt = allKeys.find(k => REMINDER_COLORS[k].bg !== REMINDER_COLORS[result[i - 1]].bg) ?? preferred;
        result.push(alt);
      }
    }
    return result;
  })();

  const greeting = greetingFor(new Date().getHours());

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingRow}>
          <Text style={styles.heading}>{greeting}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setShowNotifications(true)}
              activeOpacity={0.75}
              style={styles.searchBtn}
            >
              <Text style={styles.searchBtnIcon}>🔔</Text>
              {unreadNotifCount > 0 && (
                <View style={{
                  position: 'absolute', top: 2, right: 2,
                  backgroundColor: c.blush, borderRadius: 6,
                  minWidth: 14, height: 14, justifyContent: 'center', alignItems: 'center',
                  paddingHorizontal: 2,
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>
                    {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setMessageTargetUserId(null); setShowMessages(true); }}
              activeOpacity={0.75}
              style={styles.searchBtn}
            >
              <Text style={styles.searchBtnIcon}>💬</Text>
              {unreadCount > 0 && (
                <View style={{
                  position: 'absolute', top: 2, right: 2,
                  backgroundColor: c.primary, borderRadius: 6,
                  minWidth: 14, height: 14, justifyContent: 'center', alignItems: 'center',
                  paddingHorizontal: 2,
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={() => setShowEvents(true)}
              activeOpacity={0.75}
            >
              <Text style={styles.searchBtnIcon}>📅</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={() => setShowSearch(true)}
              activeOpacity={0.75}
            >
              <Text style={styles.searchBtnIcon}>🔍</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stories */}
        <StoriesBar
          currentUserId={currentUserId}
          onAddStory={() => { setStoryMode('photo'); setStoryImageUri(null); setStoryVideoUri(null); setStoryText(''); setShowAddStory(true); }}
          onViewStories={(groups, idx) => { setStoryViewGroups(groups); setStoryViewGroupIndex(idx); setShowStoryViewer(true); }}
          refreshKey={storyRefreshKey}
        />

        {/* Patchy streak card */}
        <StreakCard userId={currentUserId} refreshKey={streakRefreshKey} />

        {/* Baby profile card */}
        {baby && (
          <TouchableOpacity
            style={[
              styles.babyCard,
              {
                backgroundColor: baby.gender?.toLowerCase() === 'girl' ? c.girlBg
                  : baby.gender?.toLowerCase() === 'boy' ? c.boyBg
                  : c.cardBlush,
                borderLeftColor: baby.gender?.toLowerCase() === 'girl' ? c.girlBorder
                  : baby.gender?.toLowerCase() === 'boy' ? c.boyBorder
                  : c.girlBorder,
              },
            ]}
            onPress={() => setShowProfileSheet(true)}
            activeOpacity={0.8}
          >
            <View style={[
              styles.babyAvatar,
              {
                backgroundColor: baby.gender?.toLowerCase() === 'girl' ? c.girlBorder
                  : baby.gender?.toLowerCase() === 'boy' ? c.boyBorder
                  : c.girlBg,
              },
            ]}>
              {baby.photo_url ? (
                <Image source={{ uri: baby.photo_url }} style={styles.babyAvatarPhoto} />
              ) : (
                <Text style={styles.babyAvatarText}>
                  {baby.name ? baby.name.charAt(0).toUpperCase() : '👶'}
                </Text>
              )}
            </View>
            <View style={styles.babyInfo}>
              <Text style={styles.babyName}>{baby.name || 'Your Baby'}</Text>
              <Text style={styles.babyAge}>{babyAgeLabel(baby.birth_date)}</Text>
            </View>
            <Text style={styles.babyCardChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* Stat cards */}
        <View style={styles.statRow} onLayout={patchyContainer}>
          <PatchyPeek cards={patchyCards} dir="right" offsetX={-19} offsetY={-5} />
          {statCards.map((card, idx) => (
            <View
              key={card.label}
              style={[styles.statCard, { borderTopColor: card.accent, backgroundColor: card.bg }]}
              onLayout={idx < 3 ? patchyCard : undefined}
            >
              {loading ? (
                <ActivityIndicator
                  color={card.accent}
                  style={styles.statSpinner}
                />
              ) : (
                <Text style={[styles.statValue, { color: card.accent }]}>
                  {card.value}
                </Text>
              )}
              <Text style={styles.statLabel}>{card.label}</Text>
            </View>
          ))}
        </View>

        {/* Reminders */}
        {reminders.length > 0 && (
          <View style={styles.remindersSection}>
            <Text style={styles.sectionTitle}>Reminders</Text>
            {reminders.map((r, idx) => {
              const rc = REMINDER_COLORS[coloredReminders[idx]];
              return (
                <View key={r.id} style={[styles.reminderCard, { backgroundColor: rc.bg, borderLeftColor: rc.border }]}>
                  <Text style={styles.reminderEmoji}>{r.emoji}</Text>
                  <Text style={[styles.reminderText, { color: rc.text }]}>{r.text}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Supplies overview card */}
        <PaywallGate feature="supplies" title="Supplies Overview" description="Track formula, diapers, and milk stash with low-stock alerts." emoji="🧴">
        {suppliesSnap && (
          <View style={styles.suppliesCard}>
            <Text style={styles.sectionTitle}>Supplies</Text>
            <View style={styles.suppliesGrid}>
              <View style={[styles.supplyChip, { backgroundColor: suppliesSnap.formulaLow ? c.supplyLowBg : c.cardHoney }]}>
                <Text style={styles.supplyChipEmoji}>🍼</Text>
                <Text style={[styles.supplyChipValue, suppliesSnap.formulaLow && styles.supplyChipValueLow]}>
                  {suppliesSnap.formula !== null ? `${suppliesSnap.formula.toFixed(1)} oz` : '–'}
                </Text>
                <Text style={styles.supplyChipLabel}>Formula</Text>
              </View>
              <View style={[styles.supplyChip, { backgroundColor: suppliesSnap.diapersLow ? c.supplyLowBg : c.cardSage }]}>
                <Text style={styles.supplyChipEmoji}>👶</Text>
                <Text style={[styles.supplyChipValue, suppliesSnap.diapersLow && styles.supplyChipValueLow]}>
                  {suppliesSnap.diapers !== null ? String(Math.round(suppliesSnap.diapers)) : '–'}
                </Text>
                <Text style={styles.supplyChipLabel}>Diapers</Text>
              </View>
              <View style={[styles.supplyChip, { backgroundColor: c.cardBlush }]}>
                <Text style={styles.supplyChipEmoji}>🤱</Text>
                <Text style={styles.supplyChipValue}>
                  {suppliesSnap.milkOz > 0 ? `${suppliesSnap.milkOz.toFixed(1)} oz` : '–'}
                </Text>
                <Text style={styles.supplyChipLabel}>Milk Stash</Text>
              </View>
            </View>
            {suppliesSnap.formula === null && suppliesSnap.diapers === null && suppliesSnap.milkOz === 0 && (
              <Text style={styles.suppliesEmptyHint}>Track formula, diapers & milk in the Supplies tab</Text>
            )}
          </View>
        )}
        </PaywallGate>

        {/* Followed Q+A questions */}
        {followedQuestions.length > 0 && (
          <View style={styles.followedQSection}>
            <Text style={styles.sectionTitle}>Questions You're Following</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.followedQScroll}>
              {followedQuestions.map(q => (
                <TouchableOpacity
                  key={q.id}
                  style={styles.followedQCard}
                  onPress={() => setQaDetailId(q.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.followedQContent} numberOfLines={3}>{q.content}</Text>
                  <View style={styles.followedQMeta}>
                    <Text style={styles.followedQMetaText}>💬 {q.answer_count}</Text>
                    <Text style={styles.followedQMetaText}>⬆ {q.vote_score}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Trending posts */}
        {trendingPosts.length >= 2 && (
          <View style={{ marginBottom: 16 }}>
            <View style={styles.forYouHeader}>
              <Text style={{ fontSize: 18 }}>🔥</Text>
              <Text style={styles.forYouTitle}>Trending</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {trendingPosts.map(post => (
                <TouchableOpacity
                  key={post.id}
                  style={styles.trendingCard}
                  onPress={() => openComments(post.id)}
                  activeOpacity={0.85}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <UserAvatar userId={post.user_id} name={post.author} size={24} />
                    <Text style={styles.trendingCardAuthor} numberOfLines={1}>{post.author}</Text>
                    {post.post_type !== 'text' && (
                      <Text style={{ fontSize: 13 }}>
                        {post.post_type === 'milestone' ? '🎉' : post.post_type === 'poll' ? '📊' : '❓'}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.trendingCardContent} numberOfLines={3}>
                    {post.content || (post.image_url ? '📷 Photo' : post.video_url ? '🎬 Video' : '')}
                  </Text>
                  {post.tags && post.tags.length > 0 && (
                    <Text style={styles.trendingCardTag}>{post.tags[0]}</Text>
                  )}
                  <View style={styles.trendingCardFooter}>
                    <Text style={styles.trendingCardStat}>❤️ {post.likes || 0}</Text>
                    <Text style={styles.trendingCardTime}>{getTimeAgo(post.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Feed mode toggle */}
        <View style={styles.feedToggleRow}>
          {(['for-you', 'following', 'friends', 'patches'] as const).map(mode => (
            <TouchableOpacity
              key={mode}
              style={styles.feedToggleBtn}
              onPress={() => setFeedMode(mode)}
              activeOpacity={0.75}
            >
              <Text style={[styles.feedToggleText, feedMode === mode && styles.feedToggleTextActive]}>
                {mode === 'for-you' ? 'For You'
                  : mode === 'following' ? 'Following'
                  : mode === 'friends' ? 'Friends'
                  : '🤝 Patches'}
              </Text>
              {feedMode === mode && <View style={styles.feedToggleUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Topic filter chips — hidden on Patches tab */}
        {feedMode !== 'patches' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 4 }}>
            {POST_TAGS.map(tag => (
              <TouchableOpacity
                key={tag}
                onPress={() => setActiveTag(activeTag === tag ? null : tag)}
                style={[styles.tagChip, activeTag === tag && styles.tagChipActive]}
              >
                <Text style={[styles.tagChipText, activeTag === tag && styles.tagChipTextActive]}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Active hashtag banner */}
        {feedMode !== 'patches' && activeHashtag && (
          <TouchableOpacity
            onPress={() => setActiveHashtag(null)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: '#E8F4FB', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start' }}
          >
            <Text style={{ color: '#57B2E8', fontWeight: '700', fontSize: 14 }}>#{activeHashtag}</Text>
            <Text style={{ color: '#57B2E8', fontSize: 13 }}>✕</Text>
          </TouchableOpacity>
        )}

        {/* ── Patches feed ─────────────────────────────────────────────────────── */}
        {feedMode === 'patches' && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.separator }}>
              <Text style={{ fontSize: 13, color: c.textMuted, flex: 1, lineHeight: 18 }}>
                Neighbors helping neighbors — ask for anything, offer when you can 💛
              </Text>
              {patchTasks.filter(t => t.status === 'open').length > 0 && (
                <View style={{ backgroundColor: c.cardSage, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.sage }}>
                    {patchTasks.filter(t => t.status === 'open').length} open
                  </Text>
                </View>
              )}
            </View>
            {/* Safety banner */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16, marginTop: 10, marginBottom: 2, backgroundColor: '#FEF9C3', borderRadius: 12, borderWidth: 1, borderColor: '#FDE047', padding: 12 }}>
              <Text style={{ fontSize: 18, lineHeight: 22 }}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#854D0E', marginBottom: 2 }}>Safety Reminder</Text>
                <Text style={{ fontSize: 12, color: '#713F12', lineHeight: 17 }}>
                  Always verify who you're speaking with before meeting up. Never meet someone for the first time alone or in a private place — bring a friend or meet in a public location.
                </Text>
              </View>
            </View>
            {/* Category filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.separator }} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 8, gap: 8 }}>
              {[
                { key: null,             label: 'All',         emoji: '🏘️' },
                { key: 'meal_train',     label: 'Meal Train',  emoji: '🍲' },
                { key: 'errand',         label: 'Errand',      emoji: '🛒' },
                { key: 'recommendation', label: 'Recommend',   emoji: '📋' },
                { key: 'playdate',       label: 'Playdate',    emoji: '🛝' },
                { key: 'emergency',      label: 'Emergency',   emoji: '🚨' },
                { key: 'general',        label: 'General Help', emoji: '💬' },
              ].map(({ key, label, emoji }) => {
                const active = patchCategoryFilter === key;
                return (
                  <TouchableOpacity
                    key={String(key)}
                    onPress={() => setPatchCategoryFilter(key)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                      borderWidth: 1.5,
                      borderColor: active ? c.primary : c.separator,
                      backgroundColor: active ? c.cardLavender : c.background,
                    }}
                  >
                    <Text style={{ fontSize: 12 }}>{emoji}</Text>
                    <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? c.primary : c.textMuted }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {(() => {
              const visibleTasks = patchCategoryFilter ? patchTasks.filter(t => t.category === patchCategoryFilter) : patchTasks;
              return visibleTasks.length === 0 ? (
              <View style={styles.emptyFeed}>
                <Text style={[styles.emptyFeedText, { fontSize: 32, marginBottom: 8 }]}>🏘️</Text>
                <Text style={styles.emptyFeedText}>{patchTasks.length === 0 ? 'No patch requests yet.\nBe the first to ask for help!' : 'No requests in this category yet.'}</Text>
              </View>
            ) : (
              visibleTasks.map(task => {
                const PATCH_COLORS: Record<string, { bg: string; border: string }> = {
                  meal_train:     { bg: c.cardHoney,   border: c.honey },
                  errand:         { bg: c.cardBlush,   border: c.blush },
                  recommendation: { bg: c.cardBlue,    border: c.blue },
                  playdate:       { bg: c.cardSage,    border: c.sage },
                  emergency:      { bg: '#FEE2E2',     border: '#DC2626' },
                  general:        { bg: c.cardLavender, border: c.lavender },
                };
                const PATCH_EMOJI: Record<string, string> = {
                  meal_train: '🍲', errand: '🛒', recommendation: '📋',
                  playdate: '🛝', emergency: '🚨', general: '💬',
                };
                const PATCH_LABEL: Record<string, string> = {
                  meal_train: 'Meal Train', errand: 'Errand Run', recommendation: 'Recommend',
                  playdate: 'Playdate', emergency: 'Emergency', general: 'General Help',
                };
                const pc = PATCH_COLORS[task.category] ?? PATCH_COLORS.general;
                const isOwn = task.creator_id === currentUserId;
                const volunteered = myPatchVolunteered.has(task.id);
                const volCount = patchVolCounts[task.id] ?? 0;
                const authorName = task.profiles?.display_name || task.profiles?.username || 'A parent';
                return (
                  <View key={task.id} style={[styles.postCard, { borderLeftWidth: 5, borderLeftColor: pc.border, backgroundColor: pc.bg }]}>
                    {/* Top row: category + urgency + time */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      <View style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, backgroundColor: pc.border + '22', borderColor: pc.border }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: pc.border }}>
                          {PATCH_EMOJI[task.category] ?? '💬'} {PATCH_LABEL[task.category] ?? 'General Help'}
                        </Text>
                      </View>
                      {task.urgency === 'emergency' && (
                        <View style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#DC2626' }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>🚨 ASAP</Text>
                        </View>
                      )}
                      {task.urgency === 'urgent' && (
                        <View style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#D97706' }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>⚡ Urgent</Text>
                        </View>
                      )}
                      <Text style={{ fontSize: 11, color: c.textMuted, marginLeft: 'auto' as any }}>
                        {getTimeAgo(task.created_at)}
                      </Text>
                    </View>
                    {/* Title */}
                    <Text style={{ fontSize: 15, fontWeight: '800', color: c.textPrimary, marginBottom: 4, lineHeight: 21 }}>{task.title}</Text>
                    {/* Description */}
                    {task.description ? (
                      <Text style={{ fontSize: 13, color: c.textSecondary, lineHeight: 19, marginBottom: 10 }} numberOfLines={3}>{task.description}</Text>
                    ) : null}
                    {/* Footer */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: c.textMuted }}>from {authorName}</Text>
                        {volCount > 0 && (
                          <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                            💛 {volCount} {volCount === 1 ? 'parent' : 'parents'} helping
                          </Text>
                        )}
                      </View>
                      {task.status === 'completed' ? (
                        <View style={{ backgroundColor: c.cardSage, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: c.sage }}>✓ Done</Text>
                        </View>
                      ) : isOwn ? (
                        <TouchableOpacity
                          onPress={() => handlePatchComplete(task.id)}
                          style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: pc.border }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: pc.border }}>Mark Done</Text>
                        </TouchableOpacity>
                      ) : volunteered ? (
                        <TouchableOpacity
                          onPress={() => handlePatchWithdraw(task.id)}
                          style={{ borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.cardHoney, borderWidth: 1.5, borderColor: c.honey }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: c.honey }}>💛 Helping</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handlePatchVolunteer(task.id)}
                          style={{ borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: pc.border }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>🙋 I Can Help!</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            );
          })()}
          </>
        )}

        {/* ── Post feeds (For You / Following / Friends) ───────────────────────── */}
        {feedMode !== 'patches' && filteredPosts.length === 0 && (
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

        {feedMode !== 'patches' && filteredPosts.map((post) => (
          <View key={post.id} style={[styles.postCard, {
            borderLeftWidth: 4,
            borderLeftColor: post.post_type === 'milestone' ? c.postMilestone
              : post.post_type === 'question' ? c.postQuestion
              : c.postText,
          }]}>
            {post.is_sensitive && !revealedSensitiveIds.has(post.id) ? (
              <View style={{ padding: 16, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <UserAvatar userId={post.user_id} name={post.author} size={28} />
                  <Text style={styles.postAuthorName}>{post.author}</Text>
                  <Text style={styles.postTimestamp}>{getTimeAgo(post.created_at)}</Text>
                </View>
                <View style={{ backgroundColor: c.cardHoney, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: c.honey }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400E' }}>⚠️ Sensitive Content</Text>
                  {post.sensitive_label ? (
                    <Text style={{ fontSize: 13, color: '#78350F', lineHeight: 18 }}>
                      This post is marked as: <Text style={{ fontWeight: '700' }}>{post.sensitive_label}</Text>
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 13, color: '#78350F', lineHeight: 18 }}>
                      The author has marked this post as sensitive.
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => setRevealedSensitiveIds(prev => { const s = new Set(prev); s.add(post.id); return s; })}
                    style={{ alignSelf: 'flex-start', marginTop: 4, backgroundColor: '#92400E', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Show post</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            {(!post.is_sensitive || revealedSensitiveIds.has(post.id)) && (<>
            <View style={styles.postHeader}>
              <TouchableOpacity
                style={styles.postAuthorRow}
                onPress={() => setPublicProfileUserId(post.user_id)}
                activeOpacity={0.7}
              >
                <UserAvatar userId={post.user_id} name={post.author} size={36} />
                <View>
                  <Text style={styles.postAuthorName}>{post.author}</Text>
                  <Text style={styles.postTimestamp}>{getTimeAgo(post.created_at)}</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.postHeaderRight}>
                {post.post_type !== 'text' && (
                  <View style={[
                    styles.postBadge,
                    post.post_type === 'milestone' ? { backgroundColor: c.cardHoney }
                      : post.post_type === 'poll' ? { backgroundColor: c.cardSage }
                      : { backgroundColor: c.cardBlue },
                  ]}>
                    <Text>{post.post_type === 'milestone' ? '🎉' : post.post_type === 'poll' ? '📊' : '❓'}</Text>
                  </View>
                )}
                {currentUserId && post.user_id !== currentUserId && (
                  <TouchableOpacity
                    onPress={() => handleFollowToggle(post.user_id)}
                    style={[styles.followBtn, followingUserIds.has(post.user_id) && styles.followBtnActive]}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.followBtnText, followingUserIds.has(post.user_id) && styles.followBtnTextActive]}>
                      {followingUserIds.has(post.user_id) ? '✓ Following' : '+ Follow'}
                    </Text>
                  </TouchableOpacity>
                )}
                {post.user_id === currentUserId && (
                  <TouchableOpacity onPress={() => handleDeletePost(post)} style={styles.postDeleteBtn}>
                    <Text style={styles.postDeleteText}>🗑</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {post.village_id && VILLAGE_MAP[post.village_id] && (
              <View style={styles.villageTag}>
                <Text style={styles.villageTagText}>
                  {VILLAGE_MAP[post.village_id].emoji} {VILLAGE_MAP[post.village_id].name}
                </Text>
              </View>
            )}
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
            {post.tags && post.tags.length > 0 && (
              <View style={styles.postTagsRow}>
                {post.tags.map(tag => (
                  <TouchableOpacity key={tag} onPress={() => setActiveTag(tag)} style={styles.postTagChip}>
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
                      >
                        {hasVoted && (
                          <View style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0,
                            width: `${pct}%` as any,
                            backgroundColor: isMyVote ? c.cardLavender : c.cardBlush,
                          }} />
                        )}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, zIndex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: isMyVote ? '700' : '500', color: c.textPrimary }}>
                            {isMyVote ? '✓ ' : ''}{opt.text}
                          </Text>
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
                      <TouchableOpacity key={emoji} onPress={() => setReaction(post.id, emoji)} style={{ padding: 4 }}>
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
                >
                  {(() => {
                    const myR = myReactions.get(post.id);
                    const counts = reactionCounts.get(post.id) || {};
                    const total = Object.values(counts).reduce((a, b) => a + b, 0);
                    const topEmojis = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e);
                    return (
                      <Text style={[styles.postActionText, myR ? styles.likedText : null]}>
                        {myR || (topEmojis.length ? topEmojis.join('') : '🤍')} {total > 0 ? total : ''}
                      </Text>
                    );
                  })()}
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.postAction} onPress={() => openComments(post.id)}>
                <Text style={styles.postActionText}>💬 Reply</Text>
              </TouchableOpacity>
              {currentUserId && post.user_id !== currentUserId && (
                <TouchableOpacity
                  style={styles.postAction}
                  onPress={() => handleRepost(post)}
                >
                  <Text style={[styles.postActionText, myRepostIds.has(post.id) && { color: c.primary, fontWeight: '700' }]}>
                    🔁{repostCounts.get(post.id) ? ` ${repostCounts.get(post.id)}` : ''}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.postAction} onPress={() => handleShare(post)}>
                <Text style={styles.postActionText}>↗️ Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.postAction, { marginLeft: 'auto' as any }]}
                onPress={() => toggleSave(post.id)}
              >
                <Text style={styles.postActionText}>{savedPostIds.has(post.id) ? '🔖' : '🏷️'}</Text>
              </TouchableOpacity>
              {currentUserId && post.user_id !== currentUserId && (
                reportedPostIds.has(post.id) ? (
                  <Text style={[styles.postActionText, { fontSize: 11, fontStyle: 'italic' }]}>Reported</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.postAction}
                    onPress={() => { setReportPostId(post.id); setReportReason(''); setReportDone(false); }}
                  >
                    <Text style={styles.postActionText}>🚩</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
            </>)}
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Search sheet */}
      <SearchSheet visible={showSearch} onClose={() => setShowSearch(false)} />

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

      {/* Messages */}
      <Modal visible={showMessages} animationType="slide" presentationStyle="fullScreen">
        <MessagesInbox
          onBack={() => { setShowMessages(false); setMessageTargetUserId(null); if (currentUserId) fetchUnreadCount(currentUserId); }}
          openWithUserId={messageTargetUserId}
        />
      </Modal>

      {/* Notifications */}
      <Modal visible={showNotifications} animationType="slide" presentationStyle="fullScreen">
        <NotificationsScreen
          onBack={() => { setShowNotifications(false); if (currentUserId) fetchUnreadNotifCount(currentUserId); }}
        />
      </Modal>

      {/* Events */}
      <Modal visible={showEvents} animationType="slide" presentationStyle="fullScreen">
        <EventsScreen onBack={() => setShowEvents(false)} />
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
            <TouchableOpacity onPress={() => { setCommentPostId(null); setSelectedPost(null); }}>
              <Text style={styles.modalClose}>✕</Text>
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
                  >
                    <UserAvatar userId={selectedPost.user_id} name={selectedPost.author} size={36} />
                    <View>
                      <Text style={styles.postAuthorName}>{selectedPost.author}</Text>
                      <Text style={styles.postTimestamp}>{getTimeAgo(selectedPost.created_at)}</Text>
                    </View>
                  </TouchableOpacity>
                  {currentUserId && selectedPost.user_id !== currentUserId && (
                    <TouchableOpacity
                      onPress={() => handleFollowToggle(selectedPost.user_id)}
                      style={[styles.followBtn, followingUserIds.has(selectedPost.user_id) && styles.followBtnActive]}
                      activeOpacity={0.75}
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
                      <TouchableOpacity key={tag} onPress={() => { setCommentPostId(null); setSelectedPost(null); setActiveTag(tag); }} style={styles.postTagChip}>
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
                          <TouchableOpacity key={emoji} onPress={() => setReaction(selectedPost.id, emoji)} style={{ padding: 4 }}>
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
                    >
                      {(() => {
                        const myR = myReactions.get(selectedPost.id);
                        const counts = reactionCounts.get(selectedPost.id) || {};
                        const total = Object.values(counts).reduce((a, b) => a + b, 0);
                        const topEmojis = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e);
                        return (
                          <Text style={[styles.postActionText, myR ? styles.likedText : null]}>
                            {myR || (topEmojis.length ? topEmojis.join('') : '🤍')} {total > 0 ? total : ''}
                          </Text>
                        );
                      })()}
                    </TouchableOpacity>
                  </View>
                  {currentUserId && selectedPost.user_id !== currentUserId && (
                    <TouchableOpacity style={styles.postAction} onPress={() => handleRepost(selectedPost)}>
                      <Text style={[styles.postActionText, myRepostIds.has(selectedPost.id) && { color: c.primary, fontWeight: '700' }]}>
                        🔁{repostCounts.get(selectedPost.id) ? ` ${repostCounts.get(selectedPost.id)}` : ''}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.postAction} onPress={() => handleShare(selectedPost)}>
                    <Text style={styles.postActionText}>↗️ Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.postAction, { marginLeft: 'auto' as any }]}
                    onPress={() => toggleSave(selectedPost.id)}
                  >
                    <Text style={styles.postActionText}>{savedPostIds.has(selectedPost.id) ? '🔖' : '🏷️'}</Text>
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
                    <UserAvatar userId={cm.user_id} name={cm.author} size={32} />
                    <View style={styles.commentBody}>
                      <Text style={styles.commentAuthor}>{cm.author}</Text>
                      {renderTextWithMentions(cm.content, styles.commentContent, c.primary)}
                      <View style={styles.commentMeta}>
                        <Text style={styles.commentTime}>{getTimeAgo(cm.created_at)}</Text>
                        <TouchableOpacity onPress={() => { setReplyingTo(cm); setCommentText(''); }}>
                          <Text style={styles.replyBtn}>Reply</Text>
                        </TouchableOpacity>
                        {currentUserId && cm.user_id !== currentUserId && (
                          reportedCommentIds.has(cm.id) ? (
                            <Text style={{ fontSize: 11, color: c.textMuted, fontStyle: 'italic' }}>Reported</Text>
                          ) : (
                            <TouchableOpacity onPress={() => { setReportCommentId(cm.id); setReportCommentReason(''); setReportCommentDone(false); }}>
                              <Text style={{ fontSize: 12, color: c.textMuted }}>🚩</Text>
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
                          <UserAvatar userId={reply.user_id} name={reply.author} size={26} />
                          <View style={styles.commentBody}>
                            <Text style={styles.commentAuthor}>{reply.author}</Text>
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
                <Text style={styles.replyingToText}>Replying to <Text style={{ fontWeight: '700' }}>@{replyingTo.author}</Text></Text>
                <TouchableOpacity onPress={() => { setReplyingTo(null); setCommentText(''); }}>
                  <Text style={styles.replyingToCancel}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.commentInputRow}>
              <View style={{ flex: 1 }}>
                <MentionTextInput
                  suggestionsAbove
                  style={styles.commentInput}
                  placeholder={replyingTo ? `Reply to @${replyingTo.author}...` : 'Add a comment... (type @ to mention)'}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                />
              </View>
              <TouchableOpacity
                style={[styles.commentSubmit, !commentText.trim() && styles.submitButtonDisabled]}
                onPress={submitComment}
                disabled={!commentText.trim()}
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
            <TouchableOpacity onPress={() => { setReportPostId(null); setReportDone(false); }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          {reportDone ? (
            <View style={styles.reportDoneContainer}>
              <Text style={styles.reportDoneEmoji}>✅</Text>
              <Text style={styles.reportDoneTitle}>Report Submitted</Text>
              <Text style={styles.reportDoneBody}>Thank you for helping keep the community safe. We'll review this post.</Text>
              <TouchableOpacity
                style={styles.reportCloseBtn}
                onPress={() => { setReportPostId(null); setReportDone(false); }}
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
            <TouchableOpacity onPress={() => { setReportCommentId(null); setReportCommentDone(false); }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          {reportCommentDone ? (
            <View style={styles.reportDoneContainer}>
              <Text style={styles.reportDoneEmoji}>✅</Text>
              <Text style={styles.reportDoneTitle}>Report Submitted</Text>
              <Text style={styles.reportDoneBody}>Thank you for helping keep the community safe. We'll review this comment.</Text>
              <TouchableOpacity
                style={styles.reportCloseBtn}
                onPress={() => { setReportCommentId(null); setReportCommentDone(false); }}
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

      {/* Floating action button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreatePost(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>

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
            <TouchableOpacity onPress={() => { setShowCreatePost(false); setPendingPostImageUri(null); setDismissedHealthBanner(false); }}>
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
                    style={[styles.postTypeButton, postType === t && styles.postTypeButtonActive]}
                    onPress={() => setPostType(t)}
                  >
                    <Text style={[styles.postTypeText, postType === t && styles.postTypeTextActive]}>
                      {t === 'text' ? '💬 Update' : t === 'milestone' ? '🎉 Milestone' : t === 'question' ? '❓ Question' : '📊 Poll'}
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
              />

              {showMentalHealthBanner && !dismissedHealthBanner && (
                <View style={{
                  backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, marginTop: 8,
                  borderLeftWidth: 4, borderLeftColor: '#F59E0B',
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E', flex: 1, marginRight: 8 }}>
                      You're not alone 💛
                    </Text>
                    <TouchableOpacity onPress={() => setDismissedHealthBanner(true)}>
                      <Text style={{ fontSize: 16, color: '#92400E', opacity: 0.6 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 13, color: '#78350F', marginTop: 4, lineHeight: 18 }}>
                    It sounds like you might be going through a tough time. Free, confidential support is available.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      onPress={() => Linking.openURL('https://www.postpartum.net')}
                      style={{ backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Postpartum Support</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => Linking.openURL('tel:988')}
                      style={{ backgroundColor: '#92400E', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Call/Text 988</Text>
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
                      />
                      {i >= 2 && (
                        <TouchableOpacity onPress={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}>
                          <Text style={{ fontSize: 18, color: c.textMuted }}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  {pollOptions.length < 4 && (
                    <TouchableOpacity
                      onPress={() => setPollOptions(prev => [...prev, ''])}
                      style={{ paddingVertical: 8 }}
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
                  >
                    <Text style={styles.removePostImageText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              {pendingPostVideoUri && (
                <View style={styles.postImagePreviewWrap}>
                  <VideoPostPlayer uri={pendingPostVideoUri} />
                  <TouchableOpacity
                    style={styles.removePostImageBtn}
                    onPress={() => setPendingPostVideoUri(null)}
                  >
                    <Text style={styles.removePostImageText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPostImage}>
                  <Text style={styles.addPhotoBtnText}>📷  Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.addPhotoBtn, { backgroundColor: '#E8E4F7' }]} onPress={pickPostVideo}>
                  <Text style={styles.addPhotoBtnText}>🎬  Video</Text>
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
            <TouchableOpacity onPress={() => setShowAddStory(false)}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Story</Text>
            <TouchableOpacity
              style={[styles.postModalSubmitBtn,
                ((storyMode === 'photo' && !storyImageUri) || (storyMode === 'video' && !storyVideoUri) || (storyMode === 'text' && !storyText.trim()) || storySubmitting)
                  && styles.submitButtonDisabled]}
              onPress={handleSubmitStory}
              disabled={(storyMode === 'photo' && !storyImageUri) || (storyMode === 'video' && !storyVideoUri) || (storyMode === 'text' && !storyText.trim()) || storySubmitting}
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
                style={[styles.postTypeButton, storyMode === mode && styles.postTypeButtonActive, { flex: 1 }]}
                onPress={() => setStoryMode(mode)}
              >
                <Text style={[styles.postTypeText, storyMode === mode && styles.postTypeTextActive, { textAlign: 'center' }]}>
                  {mode === 'photo' ? '📷 Photo' : mode === 'video' ? '🎬 Video' : '✏️ Text'}
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
                      <TouchableOpacity style={styles.removePostImageBtn} onPress={() => setStoryImageUri(null)}>
                        <Text style={styles.removePostImageText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={[styles.addPhotoBtn, { paddingVertical: 48 }]} onPress={pickStoryImage}>
                      <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>📷</Text>
                      <Text style={[styles.addPhotoBtnText, { textAlign: 'center' }]}>Tap to pick a photo</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : storyMode === 'video' ? (
                <>
                  {storyVideoUri ? (
                    <View style={styles.postImagePreviewWrap}>
                      <VideoPostPlayer uri={storyVideoUri} />
                      <TouchableOpacity style={styles.removePostImageBtn} onPress={() => setStoryVideoUri(null)}>
                        <Text style={styles.removePostImageText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={[styles.addPhotoBtn, { paddingVertical: 48, backgroundColor: '#E8E4F7' }]} onPress={pickStoryVideo}>
                      <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>🎬</Text>
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
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 24,
      paddingBottom: 40,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    heading: {
      fontSize: 26,
      fontWeight: '800',
      color: c.textSecondary,
    },
    searchBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.card,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    searchBtnIcon: { fontSize: 18 },
    statRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 36,
    },
    statCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      borderTopWidth: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
      minHeight: 80,
      justifyContent: 'center',
    },
    statSpinner: {
      marginBottom: 6,
    },
    statValue: {
      fontSize: 24,
      fontWeight: '800',
      marginBottom: 6,
      color: c.textPrimary,
    },
    statLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 14,
    },
    remindersSection: {
      marginBottom: 28,
    },
    reminderCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderLeftWidth: 4,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 8,
      gap: 10,
    },
    reminderEmoji: {
      fontSize: 18,
    },
    reminderText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
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
      backgroundColor: '#d1d5db',
    },
    submitButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
    postCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
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
    postAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.boyBg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    postAvatarText: {
      fontSize: 14,
      fontWeight: '700',
      color: c.primary,
    },
    postAuthorName: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSecondary,
    },
    postTimestamp: {
      fontSize: 12,
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
    postDeleteBtn: {
      padding: 4,
    },
    postDeleteText: {
      fontSize: 15,
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
    villageTag: {
      alignSelf: 'flex-start',
      backgroundColor: c.cardLavender,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.lavender,
    },
    villageTagText: {
      fontSize: 11,
      fontWeight: '700',
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
      borderTopWidth: 1,
      borderTopColor: c.inputBg,
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
      color: '#e11d48',
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
      paddingVertical: 12,
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
    // ── Baby profile card ───────────────────────────────────────────────────────
    babyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.cardBlush,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      gap: 14,
      borderLeftWidth: 5,
      borderLeftColor: c.girlBorder,
    },
    babyAvatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.girlBg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    babyAvatarText: {
      fontSize: 22,
      fontWeight: '800',
      color: '#fff',
    },
    babyInfo: {
      flex: 1,
    },
    babyName: {
      fontSize: 20,
      fontWeight: '800',
      color: c.textPrimary,
    },
    babyAge: {
      fontSize: 13,
      color: '#fff',
      marginTop: 2,
      fontWeight: '600',
      textShadowColor: 'rgba(0,0,0,0.75)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 5,
    },
    babyAvatarPhoto: {
      width: 52,
      height: 52,
      borderRadius: 26,
    },
    babyCardChevron: {
      fontSize: 22,
      color: '#AEBCB1',
      fontWeight: '300',
      marginLeft: 4,
    },
    // ── Supplies overview card ──────────────────────────────────────────────────
    suppliesCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 28,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    suppliesGrid: {
      flexDirection: 'row',
      gap: 10,
    },
    supplyChip: {
      flex: 1,
      backgroundColor: c.bgAlt,
      borderRadius: 12,
      padding: 12,
      alignItems: 'center',
    },
    supplyChipLow: {
      backgroundColor: c.supplyLowBg,
    },
    supplyChipEmoji: {
      fontSize: 22,
      marginBottom: 6,
    },
    supplyChipValue: {
      fontSize: 15,
      fontWeight: '800',
      color: c.textSecondary,
      marginBottom: 3,
    },
    supplyChipValueLow: {
      color: c.supplyLowText,
    },
    supplyChipLabel: {
      fontSize: 9,
      fontWeight: '600',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      textAlign: 'center',
    },
    suppliesEmptyHint: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: 10,
      fontStyle: 'italic',
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
      width: 160,
      height: 210,
      alignSelf: 'center',
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
      color: '#57B2E8',
      backgroundColor: '#EEF6FC',
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
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: c.cardBlush,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    tagChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    tagChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
    },
    tagChipTextActive: {
      color: '#fff',
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
      backgroundColor: '#EEF6FC',
    },
    postTagChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#57B2E8',
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
