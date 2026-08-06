import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Modal, Image, SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { moderateImage } from '../lib/contentModeration';
import { useColors, Colors } from '../lib/theme';
import ContentBlockedModal from './ContentBlockedModal';
import ReportModal from './ReportModal';

// ─── Types ────────────────────────────────────────────────────────────────

type DifficultyAccuracy = 'easier' | 'as_described' | 'harder';
type BabyEngagement = 'loved' | 'liked' | 'neutral' | 'disliked';

interface CommunityRating {
  id: string;
  user_id: string;
  author: string;
  difficulty_accuracy: DifficultyAccuracy;
  baby_engagement: BabyEngagement;
  would_recommend: boolean;
  photo_url: string | null;
  video_url: string | null;
  created_at: string;
}

interface ActivityTip {
  id: string;
  user_id: string;
  author: string;
  body: string;
  created_at: string;
}

interface Props {
  activityId: string;
}

const DIFFICULTY_OPTIONS: { value: DifficultyAccuracy; label: string; emoji: string }[] = [
  { value: 'easier', label: 'Easier than described', emoji: '😌' },
  { value: 'as_described', label: 'As described', emoji: '👍' },
  { value: 'harder', label: 'Harder than described', emoji: '😅' },
];

const ENGAGEMENT_OPTIONS: { value: BabyEngagement; label: string; emoji: string }[] = [
  { value: 'loved', label: 'Loved it', emoji: '😍' },
  { value: 'liked', label: 'Liked it', emoji: '🙂' },
  { value: 'neutral', label: 'Neutral', emoji: '😐' },
  { value: 'disliked', label: 'Disliked it', emoji: '😕' },
];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ActivityCommunitySection({ activityId }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [userId, setUserId] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState('Parent');
  const [ratings, setRatings] = useState<CommunityRating[]>([]);
  const [tips, setTips] = useState<ActivityTip[]>([]);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [likedByMe, setLikedByMe] = useState<Set<string>>(new Set());
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showRatingModal, setShowRatingModal] = useState(false);
  const [difficultyAccuracy, setDifficultyAccuracy] = useState<DifficultyAccuracy | null>(null);
  const [babyEngagement, setBabyEngagement] = useState<BabyEngagement | null>(null);
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [blockedContent, setBlockedContent] = useState<{ severity: 'high' | 'extreme'; reason: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [newTip, setNewTip] = useState('');
  const [postingTip, setPostingTip] = useState(false);
  const [reportingTipId, setReportingTipId] = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, [activityId]);

  async function fetchAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      const { data: profile } = await supabase.from('profiles').select('display_name, username').eq('id', user.id).maybeSingle();
      setAuthorName((profile as any)?.display_name || (profile as any)?.username || 'Parent');
    }

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const [{ data: ratingRows }, { count }, { data: tipRows }] = await Promise.all([
      supabase.from('activity_community_ratings').select('*').eq('activity_id', activityId).order('created_at', { ascending: false }).limit(20),
      supabase.from('activity_community_ratings').select('id', { count: 'exact', head: true }).eq('activity_id', activityId).gte('created_at', weekAgo),
      supabase.from('activity_tips').select('*').eq('activity_id', activityId).order('created_at', { ascending: false }).limit(30),
    ]);

    setRatings((ratingRows ?? []) as unknown as CommunityRating[]);
    setWeeklyCount(count ?? 0);
    setTips((tipRows ?? []) as unknown as ActivityTip[]);

    const tipIds = (tipRows ?? []).map((t: any) => t.id);
    if (tipIds.length > 0) {
      const { data: likeRows } = await supabase.from('activity_tip_likes').select('tip_id, user_id').in('tip_id', tipIds);
      const counts: Record<string, number> = {};
      const mine = new Set<string>();
      (likeRows ?? []).forEach((l: any) => {
        counts[l.tip_id] = (counts[l.tip_id] ?? 0) + 1;
        if (user && l.user_id === user.id) mine.add(l.tip_id);
      });
      setLikeCounts(counts);
      setLikedByMe(mine);
    } else {
      setLikeCounts({});
      setLikedByMe(new Set());
    }

    setLoading(false);
  }

  const myRating = ratings.find(r => r.user_id === userId) ?? null;
  const recommendPct = ratings.length > 0
    ? Math.round((ratings.filter(r => r.would_recommend).length / ratings.length) * 100)
    : null;
  const mediaRatings = ratings.filter(r => r.photo_url || r.video_url);

  // ─── Rating modal ─────────────────────────────────────────────────────

  function openRatingModal() {
    setDifficultyAccuracy(myRating?.difficulty_accuracy ?? null);
    setBabyEngagement(myRating?.baby_engagement ?? null);
    setWouldRecommend(myRating?.would_recommend ?? null);
    setMediaUri(null);
    setMediaUrl(myRating?.photo_url ?? null);
    setIsVideo(!!myRating?.video_url);
    setShowRatingModal(true);
  }

  async function pickMedia(type: 'photo' | 'video') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo/video access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'photo' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
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

  async function uploadMedia(uri: string): Promise<string | null> {
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      const mimeType = blob.type || (isVideo ? 'video/mp4' : 'image/jpeg');
      const extRaw = mimeType.split('/')[1] ?? 'jpg';
      const ext = extRaw === 'jpeg' ? 'jpg' : extRaw;
      const path = `${userId}/activity-tip-${activityId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('baby-photos').upload(path, blob, { contentType: mimeType, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
      return data.publicUrl;
    } catch (err: any) {
      console.warn('Activity media upload failed:', err.message);
      return null;
    }
  }

  async function submitRating() {
    if (!userId || !difficultyAccuracy || !babyEngagement || wouldRecommend === null) {
      Alert.alert('Almost there', 'Please answer all three questions before saving.');
      return;
    }
    setSaving(true);
    let finalUrl = mediaUrl;
    if (mediaUri) finalUrl = await uploadMedia(mediaUri);

    const { error } = await supabase.from('activity_community_ratings').upsert({
      activity_id: activityId,
      user_id: userId,
      author: authorName,
      difficulty_accuracy: difficultyAccuracy,
      baby_engagement: babyEngagement,
      would_recommend: wouldRecommend,
      photo_url: isVideo ? null : finalUrl,
      video_url: isVideo ? finalUrl : null,
    }, { onConflict: 'activity_id,user_id' });

    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    setShowRatingModal(false);
    fetchAll();
  }

  // ─── Tips ─────────────────────────────────────────────────────────────

  async function postTip() {
    if (!userId || !newTip.trim()) return;
    setPostingTip(true);
    const { error } = await supabase.from('activity_tips').insert({
      activity_id: activityId, user_id: userId, author: authorName, body: newTip.trim(),
    });
    setPostingTip(false);
    if (error) { Alert.alert('Could not post tip', error.message); return; }
    setNewTip('');
    fetchAll();
  }

  async function toggleLike(tip: ActivityTip) {
    if (!userId) return;
    const liked = likedByMe.has(tip.id);
    setLikedByMe(prev => { const next = new Set(prev); liked ? next.delete(tip.id) : next.add(tip.id); return next; });
    setLikeCounts(prev => ({ ...prev, [tip.id]: (prev[tip.id] ?? 0) + (liked ? -1 : 1) }));
    if (liked) {
      await supabase.from('activity_tip_likes').delete().eq('tip_id', tip.id).eq('user_id', userId);
    } else {
      await supabase.from('activity_tip_likes').insert({ tip_id: tip.id, user_id: userId });
    }
  }

  async function submitTipReport(reason: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !reportingTipId) return;
    await supabase.from('community_reports').insert({
      reporter_id: user.id, content_type: 'activity_tip', content_id: reportingTipId, reason,
    });
    setReportingTipId(null);
  }

  // ─── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return <ActivityIndicator color={c.primary} style={{ marginVertical: 20 }} />;
  }

  return (
    <View style={s.container}>
      <Text style={s.sectionTitle}>👨‍👩‍👧 Community</Text>

      <View style={s.statsRow}>
        <Text style={s.statsText}>
          {ratings.length === 0
            ? 'Be the first to try this!'
            : `${ratings.length} parent${ratings.length !== 1 ? 's' : ''} tried this${recommendPct != null ? ` · ${recommendPct}% would recommend` : ''}`}
        </Text>
        {weeklyCount > 0 && <Text style={s.statsSub}>🔥 {weeklyCount} tried it this week</Text>}
      </View>

      <TouchableOpacity style={s.tryBtn} onPress={openRatingModal} activeOpacity={0.85}
        accessibilityRole="button" accessibilityLabel={myRating ? 'Edit your rating' : 'We tried it'}>
        <Text style={s.tryBtnText}>{myRating ? `✏️ Edit your rating (${ENGAGEMENT_OPTIONS.find(o => o.value === myRating.baby_engagement)?.emoji})` : '✨ We tried it!'}</Text>
      </TouchableOpacity>

      {mediaRatings.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ gap: 8 }}>
          {mediaRatings.map(r => (
            <View key={r.id} style={s.mediaThumbWrap}>
              {r.photo_url ? (
                <Image source={{ uri: r.photo_url }} style={s.mediaThumb} />
              ) : (
                <View style={[s.mediaThumb, s.videoThumb]}>
                  <Text style={s.videoPlayIcon}>▶</Text>
                </View>
              )}
              <Text style={s.mediaThumbAuthor} numberOfLines={1}>{r.author}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={s.tipsHeader}>
        <Text style={s.groupLabel}>💬 Tips from other parents</Text>
      </View>

      {userId && (
        <View style={s.tipInputRow}>
          <TextInput
            style={s.tipInput}
            value={newTip}
            onChangeText={setNewTip}
            placeholder="Share a tip for other parents…"
            placeholderTextColor={c.textMuted}
            multiline
            accessibilityLabel="Share a tip for other parents"
          />
          <TouchableOpacity
            style={[s.tipPostBtn, (!newTip.trim() || postingTip) && s.tipPostBtnDisabled]}
            onPress={postTip}
            disabled={!newTip.trim() || postingTip}
            accessibilityRole="button" accessibilityLabel="Post tip"
          >
            {postingTip ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.tipPostBtnText}>Post</Text>}
          </TouchableOpacity>
        </View>
      )}

      {tips.length === 0 ? (
        <Text style={s.emptyText}>No tips yet — share what worked for you.</Text>
      ) : (
        tips.map(tip => (
          <View key={tip.id} style={s.tipCard}>
            <View style={s.tipHeader}>
              <Text style={s.tipAuthor}>{tip.author}</Text>
              <Text style={s.tipTime}>{timeAgo(tip.created_at)}</Text>
            </View>
            <Text style={s.tipBody}>{tip.body}</Text>
            <View style={s.tipFooter}>
              <TouchableOpacity onPress={() => toggleLike(tip)} style={s.tipLikeBtn} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={likedByMe.has(tip.id) ? 'Unlike' : 'Like'}>
                <Text style={s.tipLikeText}>{likedByMe.has(tip.id) ? '❤️' : '🤍'} {likeCounts[tip.id] ?? 0}</Text>
              </TouchableOpacity>
              {userId && userId !== tip.user_id && (
                <TouchableOpacity onPress={() => setReportingTipId(tip.id)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel="Report this tip">
                  <Text style={s.tipReport}>Report</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}

      {/* ── Rating modal ─────────────────────────────────────────────── */}
      <Modal visible={showRatingModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowRatingModal(false)}>
        <SafeAreaView style={s.modalSafe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setShowRatingModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={s.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>We tried it!</Text>
              <TouchableOpacity onPress={submitRating} disabled={saving}
                style={[s.modalSaveBtn, saving && s.modalSaveBtnDisabled]}
                accessibilityRole="button" accessibilityLabel="Save">
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalSaveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>How accurate was the difficulty?</Text>
              <View style={s.optionsCol}>
                {DIFFICULTY_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.optionBtn, difficultyAccuracy === opt.value && s.optionBtnActive]}
                    onPress={() => setDifficultyAccuracy(opt.value)}
                    accessibilityRole="button" accessibilityLabel={opt.label}
                  >
                    <Text style={s.optionEmoji}>{opt.emoji}</Text>
                    <Text style={[s.optionText, difficultyAccuracy === opt.value && s.optionTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLabel}>How did baby engage?</Text>
              <View style={s.optionsCol}>
                {ENGAGEMENT_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.optionBtn, babyEngagement === opt.value && s.optionBtnActive]}
                    onPress={() => setBabyEngagement(opt.value)}
                    accessibilityRole="button" accessibilityLabel={opt.label}
                  >
                    <Text style={s.optionEmoji}>{opt.emoji}</Text>
                    <Text style={[s.optionText, babyEngagement === opt.value && s.optionTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLabel}>Would you recommend it?</Text>
              <View style={s.recommendRow}>
                <TouchableOpacity
                  style={[s.recommendBtn, wouldRecommend === true && s.optionBtnActive]}
                  onPress={() => setWouldRecommend(true)}
                  accessibilityRole="button" accessibilityLabel="Yes, recommend">
                  <Text style={[s.optionText, wouldRecommend === true && s.optionTextActive]}>👍 Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.recommendBtn, wouldRecommend === false && s.optionBtnActive]}
                  onPress={() => setWouldRecommend(false)}
                  accessibilityRole="button" accessibilityLabel="No, don't recommend">
                  <Text style={[s.optionText, wouldRecommend === false && s.optionTextActive]}>👎 No</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.fieldLabel}>Photo or video (optional)</Text>
              {!(mediaUri ?? mediaUrl) ? (
                <View style={s.mediaPickerRow}>
                  <TouchableOpacity style={s.mediaPickerBtn} onPress={() => pickMedia('photo')} activeOpacity={0.8}>
                    <Text style={s.mediaPickerIcon}>📷</Text>
                    <Text style={s.mediaPickerLabel}>Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.mediaPickerBtn} onPress={() => pickMedia('video')} activeOpacity={0.8}>
                    <Text style={s.mediaPickerIcon}>🎥</Text>
                    <Text style={s.mediaPickerLabel}>Video</Text>
                  </TouchableOpacity>
                </View>
              ) : isVideo ? (
                <View style={s.mediaChosenRow}>
                  <Text style={s.mediaChosenText}>🎥 Video attached</Text>
                  <TouchableOpacity onPress={() => { setMediaUri(null); setMediaUrl(null); }} accessibilityRole="button" accessibilityLabel="Remove video">
                    <Text style={s.mediaRemove}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Image source={{ uri: (mediaUri ?? mediaUrl) as string }} style={s.mediaPreview} />
                  <TouchableOpacity onPress={() => { setMediaUri(null); setMediaUrl(null); }} style={{ marginTop: 8 }}
                    accessibilityRole="button" accessibilityLabel="Remove photo">
                    <Text style={s.mediaRemove}>Remove photo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {moderating && (
        <View style={s.moderatingOverlay}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={s.moderatingText}>Checking photo…</Text>
        </View>
      )}

      {blockedContent && userId && (
        <ContentBlockedModal
          visible={!!blockedContent}
          severity={blockedContent.severity}
          reason={blockedContent.reason}
          contentType="activity_photo"
          userId={userId}
          onClose={() => setBlockedContent(null)}
        />
      )}

      <ReportModal
        visible={reportingTipId !== null}
        title="Report this tip"
        onClose={() => setReportingTipId(null)}
        onSubmit={submitTipReport}
      />
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { marginTop: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary, marginBottom: 10 },

    statsRow: { marginBottom: 12 },
    statsText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    statsSub: { fontSize: 12, fontWeight: '700', color: c.honey, marginTop: 2 },

    tryBtn: { backgroundColor: c.primary, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
    tryBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },

    mediaThumbWrap: { width: 84 },
    mediaThumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: c.card },
    videoThumb: { backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
    videoPlayIcon: { fontSize: 20, color: '#fff' },
    mediaThumbAuthor: { fontSize: 10.5, color: c.textMuted, fontWeight: '600', marginTop: 4, textAlign: 'center' },

    tipsHeader: { marginTop: 22, marginBottom: 10 },
    groupLabel: { fontSize: 14, fontWeight: '800', color: c.textPrimary },
    emptyText: { fontSize: 13, color: c.textMuted, fontWeight: '500' },

    tipInputRow: { flexDirection: 'row', gap: 8, marginBottom: 14, alignItems: 'flex-end' },
    tipInput: { flex: 1, backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.inputBorder, padding: 12, fontSize: 13.5, color: c.textPrimary, minHeight: 44, maxHeight: 90 },
    tipPostBtn: { backgroundColor: c.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
    tipPostBtnDisabled: { backgroundColor: c.primaryDisabled },
    tipPostBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    tipCard: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.cardBorder, padding: 12, marginBottom: 10 },
    tipHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    tipAuthor: { fontSize: 12.5, fontWeight: '800', color: c.textPrimary },
    tipTime: { fontSize: 11, color: c.textMuted },
    tipBody: { fontSize: 13.5, color: c.textSecondary, lineHeight: 19, fontWeight: '500' },
    tipFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    tipLikeBtn: {},
    tipLikeText: { fontSize: 12.5, fontWeight: '700', color: c.textSecondary },
    tipReport: { fontSize: 11.5, color: c.textMuted, fontWeight: '600' },

    modalSafe: { flex: 1, backgroundColor: c.bg },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.separator },
    modalCancel: { fontSize: 15, color: c.textMuted, fontWeight: '600', width: 60 },
    modalTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary, flex: 1, textAlign: 'center' },
    modalSaveBtn: { backgroundColor: c.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 16, width: 60, alignItems: 'center' },
    modalSaveBtnDisabled: { backgroundColor: c.primaryDisabled },
    modalSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    modalBody: { padding: 16, gap: 8, paddingBottom: 40 },

    fieldLabel: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 14, marginBottom: 4 },
    optionsCol: { gap: 8 },
    optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.inputBorder, paddingVertical: 12, paddingHorizontal: 14 },
    optionBtnActive: { borderColor: c.primary, backgroundColor: c.cardLavender },
    optionEmoji: { fontSize: 18 },
    optionText: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    optionTextActive: { color: c.primary, fontWeight: '800' },

    recommendRow: { flexDirection: 'row', gap: 10 },
    recommendBtn: { flex: 1, alignItems: 'center', backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.inputBorder, paddingVertical: 12 },

    mediaPickerRow: { flexDirection: 'row', gap: 12 },
    mediaPickerBtn: { flex: 1, backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5, borderColor: c.inputBorder, paddingVertical: 18, alignItems: 'center', gap: 4 },
    mediaPickerIcon: { fontSize: 28 },
    mediaPickerLabel: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    mediaChosenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.inputBorder, padding: 14 },
    mediaChosenText: { fontSize: 13.5, fontWeight: '700', color: c.textPrimary },
    mediaPreview: { width: '100%', aspectRatio: 1, borderRadius: 14 },
    mediaRemove: { fontSize: 12.5, color: c.blush, fontWeight: '700' },

    moderatingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', gap: 12, zIndex: 999 },
    moderatingText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}
