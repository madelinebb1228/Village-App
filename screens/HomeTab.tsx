import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import UserAvatar from '../components/UserAvatar';
import BabyProfileSheet from './BabyProfileSheet';
import PublicProfileSheet from './PublicProfileSheet';
import SearchSheet from './SearchSheet';
import QAScreen from './QAScreen';
import { VILLAGE_MAP } from '../lib/villageData';
import { useColors, Colors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Post {
  id: string;
  user_id: string;
  author: string;
  content: string;
  post_type: 'text' | 'milestone' | 'question';
  likes: number;
  created_at: string;
  image_url?: string | null;
  village_id?: string | null;
}

interface Comment {
  id: string;
  user_id: string;
  author: string;
  content: string;
  created_at: string;
}

type Stats = {
  feeds: number;
  diapers: number;
  pumpedMl: number;
};

type ReminderUrgency = 'info' | 'warning' | 'alert' | 'milestone' | 'streak';
interface Reminder {
  id: string;
  emoji: string;
  text: string;
  urgency: ReminderUrgency;
}

function getReminderColors(c: Colors): Record<ReminderUrgency, { bg: string; border: string; text: string }> {
  return {
    info:      { bg: c.reminderInfo.bg,      border: c.reminderInfo.border,      text: c.reminderInfo.text },
    warning:   { bg: c.reminderWarning.bg,   border: c.reminderWarning.border,   text: c.reminderWarning.text },
    alert:     { bg: c.reminderAlert.bg,     border: c.reminderAlert.border,     text: c.reminderAlert.text },
    milestone: { bg: c.reminderMilestone.bg, border: c.reminderMilestone.border, text: c.reminderMilestone.text },
    streak:    { bg: c.reminderStreak.bg,    border: c.reminderStreak.border,    text: c.reminderStreak.text },
  };
}

const PART_LIMITS: Record<string, { sessions: number; days: number }> = {
  membranes:      { sessions: 30,  days: 60  },
  valves:         { sessions: 15,  days: 28  },
  breast_shields: { sessions: 100, days: 180 },
  tubing:         { sessions: 100, days: 180 },
};
const PART_LABELS: Record<string, string> = {
  membranes:      'Pump membranes',
  valves:         'Pump valves',
  breast_shields: 'Breast shields',
  tubing:         'Pump tubing',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning 🌸';
  if (hour < 17) return 'Good afternoon ☀️';
  return 'Good evening 🌙';
}

function mlToOz(ml: number): string {
  return (ml / 29.5735).toFixed(1);
}

function babyAgeLabel(dob: string): string {
  const now = Date.now();
  const ageDays = Math.floor((now - new Date(dob).getTime()) / 86400000);
  const ageWeeks = Math.floor(ageDays / 7);
  const d = new Date(dob);
  const today = new Date();
  const monthsOld = (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
  return monthsOld >= 3
    ? `${monthsOld} month${monthsOld !== 1 ? 's' : ''} old`
    : `${ageWeeks} week${ageWeeks !== 1 ? 's' : ''} old`;
}

function getTimeAgo(dateString: string): string {
  // Ensure the string is parsed as UTC (Supabase stores UTC; without Z JS may treat as local)
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(dateString) ? dateString : dateString + 'Z';
  const seconds = Math.floor((Date.now() - new Date(normalized).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

async function uploadPostImage(uri: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/post-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('baby-photos')
      .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (err: any) {
    console.warn('Post image upload failed:', err.message);
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeTab() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const REMINDER_COLORS = useMemo(() => getReminderColors(c), [c]);

  const [stats, setStats] = useState<Stats>({ feeds: 0, diapers: 0, pumpedMl: 0 });
  const [loading, setLoading] = useState(true);

  const [posts, setPosts] = useState<Post[]>([]);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postType, setPostType] = useState<Post['post_type']>('text');

  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [reportedPostIds, setReportedPostIds] = useState<Set<string>>(new Set());
  const [pendingPostImageUri, setPendingPostImageUri] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [baby, setBaby] = useState<{ name: string; birth_date: string; photo_url: string | null; gender: string | null } | null>(null);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [publicProfileUserId, setPublicProfileUserId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
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

  useEffect(() => {
    fetchPosts();
    fetchLikedPosts();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  async function fetchPosts() {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error && data) setPosts(data);
  }

  async function fetchLikedPosts() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('user_likes')
      .select('post_id')
      .eq('user_id', user.id);
    if (data) setLikedPostIds(new Set(data.map((r: any) => r.post_id)));
  }

  async function toggleLike(post: Post) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const isLiked = likedPostIds.has(post.id);

    // Optimistic update
    setLikedPostIds(prev => {
      const next = new Set(prev);
      if (isLiked) next.delete(post.id); else next.add(post.id);
      return next;
    });
    setPosts(prev => prev.map(p =>
      p.id === post.id ? { ...p, likes: p.likes + (isLiked ? -1 : 1) } : p
    ));

    if (isLiked) {
      await supabase.from('user_likes').delete().eq('post_id', post.id).eq('user_id', user.id);
      await supabase.from('posts').update({ likes: Math.max(0, post.likes - 1) }).eq('id', post.id);
    } else {
      await supabase.from('user_likes').insert({ post_id: post.id, user_id: user.id });
      await supabase.from('posts').update({ likes: post.likes + 1 }).eq('id', post.id);
    }
  }

  async function openComments(postId: string) {
    setComments([]);
    setCommentPostId(postId);
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (data) setComments(data);
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
    });
    if (!error) {
      setCommentText('');
      const { data } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', commentPostId)
        .order('created_at', { ascending: true });
      if (data) setComments(data);
    }
  }

  async function handleShare(post: Post) {
    await Share.share({ message: post.content });
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

  async function pickPostImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to add a photo to your post.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingPostImageUri(result.assets[0].uri);
    }
  }

  async function handleCreatePost() {
    if (!postContent.trim() && !pendingPostImageUri) return;
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
    if (pendingPostImageUri) {
      setImageUploading(true);
      imageUrl = await uploadPostImage(pendingPostImageUri, user.id);
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

    const { error } = await supabase.from('posts').insert(payload);
    if (error) {
      Alert.alert('Could not post', error.message);
      return;
    }
    setPostContent('');
    setPendingPostImageUri(null);
    setPostType('text');
    setShowCreatePost(false);
    fetchPosts();
  }

  // Re-fetch every time this tab comes into focus so numbers update
  // immediately after the user logs something on the Track tab.
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function fetchStats() {
        setLoading(true);
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

          if (!isActive) return;
          setStats({
            feeds: feedRes.count ?? 0,
            diapers: diaperRes.count ?? 0,
            pumpedMl,
          });
        } catch (err: any) {
          console.warn('HomeTab fetchStats error:', err.message);
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
      fetchLikedPosts();

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
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={() => setShowSearch(true)}
            activeOpacity={0.75}
          >
            <Text style={styles.searchBtnIcon}>🔍</Text>
          </TouchableOpacity>
        </View>

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
        <View style={styles.statRow}>
          {statCards.map((card) => (
            <View
              key={card.label}
              style={[styles.statCard, { borderTopColor: card.accent, backgroundColor: card.bg }]}
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

        {/* For You feed */}
        <View style={styles.forYouHeader}>
          <View style={styles.forYouDot} />
          <Text style={styles.forYouTitle}>For You</Text>
        </View>

        {posts.length === 0 && (
          <View style={styles.emptyFeed}>
            <Text style={styles.emptyFeedText}>No posts yet. Be the first to share!</Text>
          </View>
        )}

        {posts.map((post) => (
          <View key={post.id} style={[styles.postCard, {
            borderLeftWidth: 4,
            borderLeftColor: post.post_type === 'milestone' ? c.postMilestone
              : post.post_type === 'question' ? c.postQuestion
              : c.postText,
          }]}>
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
                    post.post_type === 'milestone' ? { backgroundColor: c.cardHoney } : { backgroundColor: c.cardBlue },
                  ]}>
                    <Text>{post.post_type === 'milestone' ? '🎉' : '❓'}</Text>
                  </View>
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
            {post.content ? <Text style={styles.postContent}>{post.content}</Text> : null}
            {post.image_url ? (
              <Image
                source={{ uri: post.image_url }}
                style={styles.postImage}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.postFooter}>
              <TouchableOpacity style={styles.postAction} onPress={() => toggleLike(post)}>
                <Text style={[styles.postActionText, likedPostIds.has(post.id) && styles.likedText]}>
                  {likedPostIds.has(post.id) ? '❤️' : '🤍'} {post.likes}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.postAction} onPress={() => openComments(post.id)}>
                <Text style={styles.postActionText}>💬 Reply</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.postAction} onPress={() => handleShare(post)}>
                <Text style={styles.postActionText}>↗️ Share</Text>
              </TouchableOpacity>
              {currentUserId && post.user_id !== currentUserId && (
                reportedPostIds.has(post.id) ? (
                  <Text style={[styles.postActionText, { marginLeft: 'auto' as any, fontSize: 11, fontStyle: 'italic' }]}>Reported</Text>
                ) : (
                  <TouchableOpacity
                    style={[styles.postAction, { marginLeft: 'auto' as any }]}
                    onPress={() => { setReportPostId(post.id); setReportReason(''); setReportDone(false); }}
                  >
                    <Text style={styles.postActionText}>🚩</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
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
      />

      {/* Comments modal */}
      <Modal
        visible={commentPostId !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCommentPostId(null)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Comments</Text>
            <TouchableOpacity onPress={() => setCommentPostId(null)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.commentsList} contentContainerStyle={styles.commentsContent}>
            {comments.length === 0 ? (
              <Text style={styles.noComments}>No comments yet. Start the conversation!</Text>
            ) : (
              comments.map(cm => (
                <View key={cm.id} style={styles.commentItem}>
                  <UserAvatar userId={cm.user_id} name={cm.author} size={32} />
                  <View style={styles.commentBody}>
                    <Text style={styles.commentAuthor}>{cm.author}</Text>
                    <Text style={styles.commentContent}>{cm.content}</Text>
                    <Text style={styles.commentTime}>{getTimeAgo(cm.created_at)}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment..."
                value={commentText}
                onChangeText={setCommentText}
                multiline
              />
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
              <Text style={styles.reportDoneBody}>Thank you for helping keep the village safe. We'll review this post.</Text>
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
        onRequestClose={() => { setShowCreatePost(false); setPendingPostImageUri(null); }}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setShowCreatePost(false); setPendingPostImageUri(null); }}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Post</Text>
            <TouchableOpacity
              style={[
                styles.postModalSubmitBtn,
                (!postContent.trim() && !pendingPostImageUri) && styles.submitButtonDisabled,
              ]}
              onPress={handleCreatePost}
              disabled={(!postContent.trim() && !pendingPostImageUri) || imageUploading}
            >
              {imageUploading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.postModalSubmitText}>Post</Text>
              }
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <View style={styles.postTypeSelector}>
                {(['text', 'milestone', 'question'] as Post['post_type'][]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.postTypeButton, postType === t && styles.postTypeButtonActive]}
                    onPress={() => setPostType(t)}
                  >
                    <Text style={[styles.postTypeText, postType === t && styles.postTypeTextActive]}>
                      {t === 'text' ? '💬 Update' : t === 'milestone' ? '🎉 Milestone' : '❓ Question'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.postInput}
                placeholder={
                  postType === 'milestone' ? 'Share a milestone...' :
                  postType === 'question' ? 'Ask the village...' :
                  "What's on your mind?"
                }
                value={postContent}
                onChangeText={setPostContent}
                multiline
                numberOfLines={6}
                autoFocus
                textAlignVertical="top"
              />

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

              <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPostImage}>
                <Text style={styles.addPhotoBtnText}>📷  Add Photo</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
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
    // ── For You header
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
  });
}
