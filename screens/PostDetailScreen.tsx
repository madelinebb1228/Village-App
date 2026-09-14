import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Share,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useColors, Colors } from '../lib/theme';
import { typography } from '../lib/typography';
import { Ionicons } from '@expo/vector-icons';
import { hitSlopFor } from '../lib/accessibility';
import { screenView } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { Post, Comment } from '../types/feed';
import {
  resolveAuthorName, attachAuthorProfiles, renderTextWithMentions,
  buildCommentTree, sendMentionNotifications,
  toggleReactionMutation, toggleRepostMutation, castPollVoteMutation,
} from '../lib/feedUtils';
import { timeAgo, joinPatch, leavePatch } from '../lib/discoverData';
import { VILLAGE_MAP, Village, villagesByIds } from '../lib/villageData';
import UserAvatar from '../components/UserAvatar';
import PublicProfileSheet from './PublicProfileSheet';
import VillageFeedSheet from './VillageFeedSheet';
import ReportModal from '../components/ReportModal';
import { VideoPostPlayer } from '../components/feed/VideoPostPlayer';
import PatchLabel from '../components/feed/PatchLabel';

const REACTION_EMOJIS = ['❤️', '😂', '😢', '💪', '🙌', '👶'];

interface PollOption {
  id: string;
  post_id: string;
  text: string;
  vote_count: number;
  position: number;
}

type RestrictedReason = 'blocked' | 'muted' | 'private' | null;

export default function PostDetailScreen({ route, navigation }: any) {
  const postId: string | undefined = route?.params?.postId;
  // Bottom-tab navigators don't reliably keep a back-history across tabs
  // (goBack() can land on the tab's default route rather than wherever the
  // user actually came from), so the originating screen is passed explicitly
  // and used as the back destination instead of relying on goBack().
  const origin: string | undefined = route?.params?.origin;
  const goBack = () => (origin ? navigation?.navigate?.(origin) : navigation?.goBack?.());
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<Post | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [restricted, setRestricted] = useState<RestrictedReason>(null);
  const [revealedSensitive, setRevealedSensitive] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const [isReposted, setIsReposted] = useState(false);
  const [repostCount, setRepostCount] = useState(0);
  const [isSaved, setIsSaved] = useState(false);

  const [pollOptions, setPollOptions] = useState<PollOption[]>([]);
  const [myVoteId, setMyVoteId] = useState<string | null>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [postingComment, setPostingComment] = useState(false);

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [feedVillage, setFeedVillage] = useState<Village | null>(null);
  const [myVillageIds, setMyVillageIds] = useState<Set<string>>(new Set());
  const [joiningVillageId, setJoiningVillageId] = useState<string | null>(null);

  const [reportPostVisible, setReportPostVisible] = useState(false);
  const [reportedPost, setReportedPost] = useState(false);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [reportedCommentIds, setReportedCommentIds] = useState<Set<string>>(new Set());

  useEffect(() => { screenView('PostDetail'); }, []);
  useEffect(() => { load(); }, [postId]);

  async function load() {
    if (!postId) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    setNotFound(false);
    setRestricted(null);

    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);

    const { data: postData, error } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
    if (error || !postData) { setNotFound(true); setLoading(false); return; }
    const [withProfile] = await attachAuthorProfiles([postData as Post]);
    setPost(withProfile);

    if (user && withProfile.user_id !== user.id) {
      const [{ data: iBlockedThem }, { data: theyBlockedMe }, { data: muteRow }, { data: authorProfile }] = await Promise.all([
        supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id).eq('blocked_id', withProfile.user_id).maybeSingle(),
        supabase.from('user_blocks').select('blocked_id').eq('blocker_id', withProfile.user_id).eq('blocked_id', user.id).maybeSingle(),
        supabase.from('user_mutes').select('muted_id').eq('muter_id', user.id).eq('muted_id', withProfile.user_id).maybeSingle(),
        supabase.from('profiles').select('is_private').eq('id', withProfile.user_id).maybeSingle(),
      ]);
      if (iBlockedThem || theyBlockedMe) { setRestricted('blocked'); setLoading(false); return; }
      if (muteRow) { setRestricted('muted'); setLoading(false); return; }
      if ((authorProfile as any)?.is_private) {
        const { data: followRow } = await supabase
          .from('follows').select('following_id')
          .eq('follower_id', user.id).eq('following_id', withProfile.user_id).maybeSingle();
        if (!followRow) { setRestricted('private'); setLoading(false); return; }
      }
    }

    await Promise.all([
      loadReactions(postId, user?.id ?? null),
      loadRepostAndSave(postId, user?.id ?? null),
      withProfile.post_type === 'poll' ? loadPoll(postId, user?.id ?? null) : Promise.resolve(),
      loadComments(postId),
      withProfile.village_id && user ? loadMyVillageIds(user.id) : Promise.resolve(),
    ]);
    setLoading(false);
  }

  async function loadMyVillageIds(userId: string) {
    const { data } = await supabase.from('user_villages').select('village_id').eq('user_id', userId);
    setMyVillageIds(new Set((data ?? []).map((r: any) => r.village_id)));
  }

  async function toggleVillageMembership(villageId: string) {
    setJoiningVillageId(villageId);
    const wasJoined = myVillageIds.has(villageId);
    const { error } = wasJoined ? await leavePatch(villageId) : await joinPatch(villageId);
    if (error) {
      Alert.alert('Something went wrong', wasJoined ? "Couldn't leave this patch. Please try again." : "Couldn't join this patch. Please try again.");
    } else {
      setMyVillageIds(prev => {
        const n = new Set(prev);
        wasJoined ? n.delete(villageId) : n.add(villageId);
        return n;
      });
    }
    setJoiningVillageId(null);
  }

  async function loadReactions(id: string, userId: string | null) {
    const [{ data: allRows }, { data: myRows }] = await Promise.all([
      supabase.from('post_reactions').select('type').eq('post_id', id),
      userId ? supabase.from('post_reactions').select('type').eq('post_id', id).eq('user_id', userId) : Promise.resolve({ data: [] as any[] }),
    ]);
    const counts: Record<string, number> = {};
    (allRows ?? []).forEach((r: any) => { counts[r.type] = (counts[r.type] || 0) + 1; });
    setReactionCounts(counts);
    setMyReaction((myRows ?? [])[0]?.type ?? null);
  }

  async function loadRepostAndSave(id: string, userId: string | null) {
    const [{ count }, savedRes, myRepostRes] = await Promise.all([
      (supabase as any).from('reposts').select('id', { count: 'exact', head: true }).eq('post_id', id),
      userId ? supabase.from('saved_posts').select('post_id').eq('post_id', id).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
      userId ? (supabase as any).from('reposts').select('post_id').eq('post_id', id).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setRepostCount(count ?? 0);
    setIsSaved(!!savedRes.data);
    setIsReposted(!!myRepostRes.data);
  }

  async function loadPoll(id: string, userId: string | null) {
    const [{ data: options }, { data: myVote }] = await Promise.all([
      supabase.from('poll_options').select('id,post_id,text,vote_count,position').eq('post_id', id).order('position'),
      userId ? supabase.from('poll_votes').select('option_id').eq('post_id', id).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setPollOptions((options ?? []) as PollOption[]);
    setMyVoteId((myVote as any)?.option_id ?? null);
  }

  async function loadComments(id: string) {
    const { data } = await supabase.from('comments').select('*').eq('post_id', id).order('created_at', { ascending: true });
    setComments(buildCommentTree(await attachAuthorProfiles((data ?? []) as Comment[])));
  }

  async function toggleReaction(type: string) {
    if (!currentUserId || !post) return;
    setShowReactionPicker(false);
    const current = myReaction;
    if (current === type) {
      setMyReaction(null);
      setReactionCounts(prev => ({ ...prev, [type]: Math.max(0, (prev[type] || 1) - 1) }));
      await toggleReactionMutation(post.id, currentUserId, null);
    } else {
      setMyReaction(type);
      setReactionCounts(prev => {
        const next = { ...prev };
        if (current) next[current] = Math.max(0, (next[current] || 1) - 1);
        next[type] = (next[type] || 0) + 1;
        return next;
      });
      await toggleReactionMutation(post.id, currentUserId, type);
    }
  }

  async function toggleRepost() {
    if (!currentUserId || !post) return;
    if (isReposted) {
      setIsReposted(false);
      setRepostCount(n => Math.max(0, n - 1));
      await toggleRepostMutation(post.id, currentUserId, false);
    } else {
      setIsReposted(true);
      setRepostCount(n => n + 1);
      await toggleRepostMutation(post.id, currentUserId, true);
    }
  }

  async function toggleSave() {
    if (!currentUserId || !post) return;
    if (isSaved) {
      setIsSaved(false);
      await supabase.from('saved_posts').delete().eq('post_id', post.id).eq('user_id', currentUserId);
    } else {
      setIsSaved(true);
      await (supabase as any).from('saved_posts').insert({ post_id: post.id, user_id: currentUserId });
    }
  }

  async function castVote(optionId: string) {
    if (!currentUserId || !post) return;
    const prevId = myVoteId;
    setMyVoteId(optionId);
    setPollOptions(prev => prev.map(o => ({
      ...o,
      vote_count: o.id === prevId ? Math.max(0, o.vote_count - 1) : o.id === optionId ? o.vote_count + 1 : o.vote_count,
    })));
    await castPollVoteMutation(post.id, currentUserId, optionId);
  }

  async function handleShare() {
    if (!post) return;
    await Share.share({ message: post.content });
  }

  function handleDeletePost() {
    if (!post) return;
    const message = 'Delete this post? This cannot be undone.';
    const doDelete = async () => {
      const { error } = await supabase.from('posts').delete().eq('id', post.id).select('id');
      if (error) { Alert.alert('Delete failed', error.message); return; }
      goBack();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(message)) doDelete();
      return;
    }
    Alert.alert('Delete Post', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  }

  async function submitComment() {
    if (!commentText.trim() || !post || !currentUserId) return;
    setPostingComment(true);
    const { data: profileData } = await supabase.from('profiles').select('username, display_name').eq('id', currentUserId).maybeSingle();
    const author = (profileData as any)?.username ?? (profileData as any)?.display_name ?? 'Parent';
    const { error } = await (supabase as any).from('comments').insert({
      post_id: post.id,
      user_id: currentUserId,
      author,
      content: commentText,
      parent_id: replyingTo?.id ?? null,
    });
    if (!error) {
      sendMentionNotifications(commentText.trim(), post.id, currentUserId);
      setCommentText('');
      setReplyingTo(null);
      await loadComments(post.id);
    }
    setPostingComment(false);
  }

  function openMentionedUser(username: string) {
    supabase.from('profiles').select('id').eq('username', username).maybeSingle().then(({ data }) => {
      if (data) setProfileUserId((data as any).id);
    });
  }

  // ─── Loading / error / restricted states ───

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <Header onBack={goBack} s={s} c={c} />
        <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>
      </SafeAreaView>
    );
  }

  if (notFound) {
    return (
      <SafeAreaView style={s.container}>
        <Header onBack={goBack} s={s} c={c} />
        <View style={s.center}>
          <Text style={s.stateEmoji}>🌱</Text>
          <Text style={s.stateTitle}>This post isn't available</Text>
          <Text style={s.stateMessage}>It may have been deleted, or the link is no longer valid.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (restricted) {
    const copy = restricted === 'blocked'
      ? "You can't view this post."
      : restricted === 'muted'
      ? "You've muted this author, so their posts are hidden."
      : 'This account is private. Follow them to see their posts.';
    return (
      <SafeAreaView style={s.container}>
        <Header onBack={goBack} s={s} c={c} />
        <View style={s.center}>
          <Text style={s.stateEmoji}>🔒</Text>
          <Text style={s.stateTitle}>Post unavailable</Text>
          <Text style={s.stateMessage}>{copy}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!post) return null;

  const authorName = resolveAuthorName(post);
  const isOwnPost = currentUserId === post.user_id;
  const isSensitiveHidden = post.is_sensitive && !revealedSensitive;

  return (
    <SafeAreaView style={s.container}>
      <Header
        onBack={goBack}
        s={s}
        c={c}
        right={
          isOwnPost ? (
            <TouchableOpacity onPress={handleDeletePost} hitSlop={hitSlopFor(22)} accessibilityRole="button" accessibilityLabel="Delete post">
              <Ionicons name="trash-outline" size={22} color={c.textSecondary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setReportPostVisible(true)} hitSlop={hitSlopFor(22)} accessibilityRole="button" accessibilityLabel="Report post">
              <Ionicons name="flag-outline" size={22} color={c.textSecondary} />
            </TouchableOpacity>
          )
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={s.authorRow} onPress={() => setProfileUserId(post.user_id)} activeOpacity={0.75}>
            <UserAvatar userId={post.user_id} name={authorName} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={s.authorName}>{authorName}</Text>
              {post.profiles?.username ? <Text style={s.authorUsername}>@{post.profiles.username}</Text> : null}
            </View>
            <Text style={s.timestamp}>{timeAgo(post.created_at)}</Text>
          </TouchableOpacity>

          {post.village_id && VILLAGE_MAP[post.village_id] && (
            <PatchLabel
              emoji={VILLAGE_MAP[post.village_id].emoji}
              name={VILLAGE_MAP[post.village_id].name}
              onPress={() => { const [v] = villagesByIds([post.village_id!]); if (v) setFeedVillage(v); }}
            />
          )}

          {isSensitiveHidden ? (
            <View style={s.sensitiveBox}>
              <Text style={s.sensitiveTitle}>⚠️ Sensitive Content</Text>
              {post.sensitive_label ? (
                <Text style={s.sensitiveText}>This post is marked as: <Text style={{ fontWeight: '700' }}>{post.sensitive_label}</Text></Text>
              ) : (
                <Text style={s.sensitiveText}>The author has marked this post as sensitive.</Text>
              )}
              <TouchableOpacity onPress={() => setRevealedSensitive(true)} style={s.sensitiveBtn} accessibilityRole="button" accessibilityLabel="Show sensitive post">
                <Text style={s.sensitiveBtnText}>Show post</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {renderTextWithMentions(post.content, s.postContent, c.primary, openMentionedUser, () => {})}

              {post.image_url ? <Image source={{ uri: post.image_url }} style={s.media} resizeMode="cover" /> : null}
              {post.video_url ? <VideoPostPlayer uri={post.video_url} /> : null}

              {post.post_type === 'poll' && pollOptions.length > 0 && (
                <View style={s.pollWrap}>
                  {pollOptions.map(opt => {
                    const total = pollOptions.reduce((sum, o) => sum + o.vote_count, 0);
                    const pct = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0;
                    const selected = myVoteId === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[s.pollOption, selected && s.pollOptionSelected]}
                        onPress={() => castVote(opt.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${opt.text}, ${pct} percent`}
                      >
                        <View style={[s.pollFill, { width: `${pct}%` }]} />
                        <Text style={s.pollOptionText}>{opt.text}</Text>
                        <Text style={s.pollOptionPct}>{pct}%</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {post.tags && post.tags.length > 0 && (
                <View style={s.tagRow}>
                  {post.tags.map(tag => <Text key={tag} style={s.tagChip}>#{tag}</Text>)}
                </View>
              )}
            </>
          )}

          <View style={s.actionsRow}>
            <View style={{ position: 'relative' }}>
              <TouchableOpacity style={s.actionBtn} onPress={() => setShowReactionPicker(v => !v)} hitSlop={hitSlopFor(24)} accessibilityRole="button" accessibilityLabel="React to post">
                <Text style={s.actionIcon}>{myReaction || '🤍'}</Text>
                <Text style={s.actionCount}>{Object.values(reactionCounts).reduce((a, b) => a + b, 0)}</Text>
              </TouchableOpacity>
              {showReactionPicker && (
                <View style={s.reactionPicker}>
                  {REACTION_EMOJIS.map(emoji => (
                    <TouchableOpacity key={emoji} onPress={() => toggleReaction(emoji)} style={s.reactionOption} hitSlop={hitSlopFor(30)} accessibilityRole="button" accessibilityLabel={`React with ${emoji}`}>
                      <Text style={{ fontSize: 22 }}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={s.actionBtn}>
              <Text style={s.actionIcon}>💬</Text>
              <Text style={s.actionCount}>{comments.reduce((n, cm) => n + 1 + (cm.replies?.length ?? 0), 0)}</Text>
            </View>

            <TouchableOpacity style={s.actionBtn} onPress={toggleRepost} hitSlop={hitSlopFor(24)} accessibilityRole="button" accessibilityLabel={isReposted ? 'Undo repost' : 'Repost'}>
              <Text style={[s.actionIcon, isReposted && { color: c.sage }]}>🔁</Text>
              <Text style={[s.actionCount, isReposted && { color: c.sage }]}>{repostCount}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.actionBtn} onPress={toggleSave} hitSlop={hitSlopFor(24)} accessibilityRole="button" accessibilityLabel={isSaved ? 'Unsave post' : 'Save post'}>
              <Text style={s.actionIcon}>{isSaved ? '🔖' : '📑'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.actionBtn} onPress={handleShare} hitSlop={hitSlopFor(24)} accessibilityRole="button" accessibilityLabel="Share post">
              <Text style={s.actionIcon}>↗️</Text>
            </TouchableOpacity>
          </View>

          <View style={s.divider} />

          <Text style={s.commentsHeading}>Comments</Text>
          {comments.length === 0 ? (
            <Text style={s.mutedNote}>No comments yet. Be the first to reply.</Text>
          ) : (
            comments.map(cm => (
              <CommentThread
                key={cm.id}
                comment={cm}
                depth={0}
                s={s}
                c={c}
                onReply={setReplyingTo}
                onOpenProfile={setProfileUserId}
                onReport={setReportCommentId}
                reportedIds={reportedCommentIds}
              />
            ))
          )}
        </ScrollView>

        <View style={s.composerRow}>
          {replyingTo && (
            <View style={s.replyingBanner}>
              <Text style={s.replyingText}>Replying to {resolveAuthorName(replyingTo)}</Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)} accessibilityRole="button" accessibilityLabel="Cancel reply">
                <Text style={s.replyingCancel}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={s.composerInputRow}>
            <TextInput
              style={s.composerInput}
              placeholder={replyingTo ? `Reply to @${resolveAuthorName(replyingTo)}...` : 'Add a comment...'}
              placeholderTextColor={c.textMuted}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              accessibilityLabel="Write a comment"
            />
            <TouchableOpacity
              style={[s.postCommentBtn, (!commentText.trim() || postingComment) && { opacity: 0.4 }]}
              onPress={submitComment}
              disabled={!commentText.trim() || postingComment}
              hitSlop={hitSlopFor(34)}
              accessibilityRole="button"
              accessibilityLabel="Post comment"
            >
              {postingComment ? <ActivityIndicator size="small" color={c.textOnColored} /> : <Text style={s.postCommentBtnText}>Post</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <PublicProfileSheet userId={profileUserId} visible={profileUserId !== null} onClose={() => setProfileUserId(null)} />

      <VillageFeedSheet
        village={feedVillage}
        visible={feedVillage !== null}
        onClose={() => setFeedVillage(null)}
        joined={feedVillage !== null && myVillageIds.has(feedVillage.id)}
        onToggleJoin={() => feedVillage && toggleVillageMembership(feedVillage.id)}
      />

      <ReportModal
        visible={reportPostVisible}
        title="Report Post"
        onClose={() => setReportPostVisible(false)}
        onSubmit={async (reason) => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          await (supabase as any).from('post_reports').insert({ reporter_id: user.id, post_id: post.id, reason });
          setReportedPost(true);
        }}
      />

      <ReportModal
        visible={reportCommentId !== null}
        title="Report Comment"
        onClose={() => setReportCommentId(null)}
        onSubmit={async (reason) => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || !reportCommentId) return;
          await (supabase as any).from('comment_reports').insert({ reporter_id: user.id, comment_id: reportCommentId, reason });
          setReportedCommentIds(prev => new Set(prev).add(reportCommentId));
        }}
      />
    </SafeAreaView>
  );
}

function Header({ onBack, right, s, c }: { onBack: () => void; right?: React.ReactNode; s: ReturnType<typeof makeStyles>; c: Colors }) {
  return (
    <View style={s.header}>
      <View style={s.headerSideSlot}>
        <TouchableOpacity onPress={onBack} hitSlop={hitSlopFor(24)} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
        </TouchableOpacity>
      </View>
      <Text style={s.headerTitle}>Post</Text>
      <View style={[s.headerSideSlot, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

function CommentThread({
  comment, depth, s, c, onReply, onOpenProfile, onReport, reportedIds,
}: {
  comment: Comment;
  depth: number;
  s: ReturnType<typeof makeStyles>;
  c: Colors;
  onReply: (comment: Comment) => void;
  onOpenProfile: (userId: string) => void;
  onReport: (commentId: string) => void;
  reportedIds: Set<string>;
}) {
  const name = resolveAuthorName(comment);
  return (
    <View style={[s.commentWrap, { marginLeft: depth * 24 }]}>
      <TouchableOpacity style={s.commentHeader} onPress={() => onOpenProfile(comment.user_id)} activeOpacity={0.75}>
        <UserAvatar userId={comment.user_id} name={name} size={28} />
        <Text style={s.commentAuthor}>{name}</Text>
        <Text style={s.commentTime}>{timeAgo(comment.created_at)}</Text>
      </TouchableOpacity>
      <Text style={s.commentContent}>{comment.content}</Text>
      <View style={s.commentActions}>
        <TouchableOpacity onPress={() => onReply(comment)} hitSlop={hitSlopFor(20)} accessibilityRole="button" accessibilityLabel={`Reply to ${name}`}>
          <Text style={s.commentActionText}>Reply</Text>
        </TouchableOpacity>
        {!reportedIds.has(comment.id) && (
          <TouchableOpacity onPress={() => onReport(comment.id)} hitSlop={hitSlopFor(20)} accessibilityRole="button" accessibilityLabel={`Report comment by ${name}`}>
            <Text style={s.commentActionText}>Report</Text>
          </TouchableOpacity>
        )}
      </View>
      {comment.replies?.map(reply => (
        <CommentThread
          key={reply.id}
          comment={reply}
          depth={depth + 1}
          s={s}
          c={c}
          onReply={onReply}
          onOpenProfile={onOpenProfile}
          onReport={onReport}
          reportedIds={reportedIds}
        />
      ))}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    headerSideSlot: { minWidth: 24, justifyContent: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
    stateEmoji: { fontSize: 36, marginBottom: 4 },
    stateTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary, textAlign: 'center' },
    stateMessage: { fontSize: 13.5, color: c.textMuted, textAlign: 'center', lineHeight: 19 },

    scroll: { padding: 16, paddingBottom: 32 },
    authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    authorName: { ...typography.postAuthor, color: c.textPrimary },
    authorUsername: { fontSize: 12.5, color: c.textMuted, marginTop: 1 },
    timestamp: { ...typography.postMeta, color: c.textMuted },

    postContent: { fontSize: 17, color: c.textPrimary, lineHeight: 24, marginBottom: 12 },
    // Same 4:3 aspect ratio as the feed card (HomeTab.tsx postImage) so a
    // post's photo doesn't get a different crop depending on which screen
    // it's viewed from.
    media: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, marginBottom: 12, backgroundColor: c.card },

    sensitiveBox: { backgroundColor: c.reminderWarning.bg, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: c.reminderWarning.border, marginBottom: 12 },
    sensitiveTitle: { fontSize: 13, fontWeight: '800', color: c.reminderWarning.text },
    sensitiveText: { fontSize: 13, color: c.reminderWarning.text, lineHeight: 18 },
    sensitiveBtn: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: c.reminderWarning.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
    sensitiveBtnText: { fontSize: 13, fontWeight: '700', color: c.textOnColored },

    pollWrap: { gap: 8, marginBottom: 12 },
    pollOption: {
      borderWidth: 1.5, borderColor: c.separator, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden',
    },
    pollOptionSelected: { borderColor: c.primary },
    pollFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: c.cardLavender },
    pollOptionText: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    pollOptionPct: { fontSize: 13, fontWeight: '700', color: c.textMuted },

    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    tagChip: { fontSize: 13, fontWeight: '700', color: c.primary },

    actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 24, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.separator, borderBottomWidth: 1, borderBottomColor: c.separator, marginBottom: 16 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionIcon: { fontSize: 18, color: c.textSecondary },
    actionCount: { fontSize: 13, fontWeight: '700', color: c.textMuted },

    reactionPicker: {
      position: 'absolute', bottom: 34, left: 0, flexDirection: 'row', gap: 8,
      backgroundColor: c.card, borderRadius: 24, paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1, borderColor: c.separator, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 6,
    },
    reactionOption: { padding: 4 },

    divider: { height: 1, backgroundColor: c.separator, marginVertical: 12 },
    commentsHeading: { fontSize: 15, fontWeight: '800', color: c.textPrimary, marginBottom: 12 },
    mutedNote: { fontSize: 13.5, color: c.textMuted },

    commentWrap: { marginBottom: 16 },
    commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    commentAuthor: { fontSize: 13.5, fontWeight: '700', color: c.textPrimary },
    commentTime: { fontSize: 11.5, color: c.textMuted },
    commentContent: { fontSize: 14, color: c.textPrimary, lineHeight: 19, marginLeft: 36 },
    commentActions: { flexDirection: 'row', gap: 16, marginLeft: 36, marginTop: 4 },
    commentActionText: { fontSize: 12, fontWeight: '700', color: c.textMuted },

    composerRow: { borderTopWidth: 1, borderTopColor: c.separator, backgroundColor: c.bg, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
    replyingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
    replyingText: { fontSize: 12.5, color: c.textMuted, fontWeight: '600' },
    replyingCancel: { fontSize: 13, color: c.textMuted },
    composerInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
    composerInput: { flex: 1, backgroundColor: c.inputBg, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: c.textPrimary, maxHeight: 100 },
    postCommentBtn: { backgroundColor: c.primary, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 },
    postCommentBtnText: { fontSize: 13.5, fontWeight: '700', color: c.textOnColored },
  });
