import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Post {
  id: string;
  author: string;
  content: string;
  post_type: 'text' | 'milestone' | 'question';
  likes: number;
  created_at: string;
}

interface Comment {
  id: string;
  author: string;
  content: string;
  created_at: string;
}

type Stats = {
  feeds: number;
  diapers: number;
  pumpedMl: number;
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

function getTimeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeTab() {
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

  useEffect(() => {
    fetchPosts();
    fetchLikedPosts();
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
    const { error } = await supabase.from('comments').insert({
      post_id: commentPostId,
      user_id: user.id,
      author: user.email?.split('@')[0] || 'Anonymous',
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

  async function handleCreatePost() {
    if (!postContent.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('posts').insert({
      user_id: user.id,
      author: user.email?.split('@')[0] || 'Anonymous',
      content: postContent,
      post_type: postType,
      likes: 0,
    });
    if (!error) {
      setPostContent('');
      setShowCreatePost(false);
      fetchPosts();
    }
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

      fetchStats();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const statCards = [
    {
      label: 'Feeds\nToday',
      value: String(stats.feeds),
      accent: '#B8A9C9',
    },
    {
      label: 'Diapers\nToday',
      value: String(stats.diapers),
      accent: '#A8B8A0',
    },
    {
      label: 'Pumped\nToday',
      value: `${mlToOz(stats.pumpedMl)} oz`,
      accent: '#E8B4B8',
    },
  ];

  const greeting = greetingFor(new Date().getHours());

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>{greeting}</Text>

        {/* Stat cards */}
        <View style={styles.statRow}>
          {statCards.map((card) => (
            <View
              key={card.label}
              style={[styles.statCard, { borderTopColor: card.accent }]}
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

        {/* Village Feed */}
        <View style={styles.feedHeader}>
          <Text style={styles.sectionTitle}>Village Feed</Text>
          <TouchableOpacity
            style={styles.createPostButton}
            onPress={() => setShowCreatePost(!showCreatePost)}
          >
            <Text style={styles.createPostButtonText}>+ Post</Text>
          </TouchableOpacity>
        </View>

        {showCreatePost && (
          <View style={styles.createPostContainer}>
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
                postType === 'milestone'
                  ? 'Share a milestone...'
                  : postType === 'question'
                  ? 'Ask the village...'
                  : "What's on your mind?"
              }
              value={postContent}
              onChangeText={setPostContent}
              multiline
              numberOfLines={3}
            />
            <View style={styles.postActions}>
              <TouchableOpacity onPress={() => setShowCreatePost(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, !postContent.trim() && styles.submitButtonDisabled]}
                onPress={handleCreatePost}
                disabled={!postContent.trim()}
              >
                <Text style={styles.submitButtonText}>Post</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {posts.length === 0 && (
          <View style={styles.emptyFeed}>
            <Text style={styles.emptyFeedText}>No posts yet. Be the first to share!</Text>
          </View>
        )}

        {posts.map((post) => (
          <View key={post.id} style={styles.postCard}>
            <View style={styles.postHeader}>
              <View style={styles.postAuthorRow}>
                <View style={styles.postAvatar}>
                  <Text style={styles.postAvatarText}>{post.author.charAt(0)}</Text>
                </View>
                <View>
                  <Text style={styles.postAuthorName}>{post.author}</Text>
                  <Text style={styles.postTimestamp}>{getTimeAgo(post.created_at)}</Text>
                </View>
              </View>
              {post.post_type !== 'text' && (
                <View style={[
                  styles.postBadge,
                  post.post_type === 'milestone' ? { backgroundColor: '#fef3c7' } : { backgroundColor: '#dbeafe' },
                ]}>
                  <Text>{post.post_type === 'milestone' ? '🎉' : '❓'}</Text>
                </View>
              )}
            </View>
            <Text style={styles.postContent}>{post.content}</Text>
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
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>

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
              comments.map(c => (
                <View key={c.id} style={styles.commentItem}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>{c.author.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.commentBody}>
                    <Text style={styles.commentAuthor}>{c.author}</Text>
                    <Text style={styles.commentContent}>{c.content}</Text>
                    <Text style={styles.commentTime}>{getTimeAgo(c.created_at)}</Text>
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
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FEFCF8',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#5A544E',
    marginBottom: 24,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 36,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
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
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5A544E',
    textAlign: 'center',
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#5A544E',
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
    backgroundColor: '#B8A9C9',
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
    backgroundColor: '#ffffff',
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
    backgroundColor: '#f3f4f6',
  },
  postTypeButtonActive: {
    backgroundColor: '#ede9fe',
  },
  postTypeText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  postTypeTextActive: {
    color: '#7c3aed',
  },
  postInput: {
    backgroundColor: '#f9fafb',
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
    color: '#6b7280',
  },
  submitButton: {
    backgroundColor: '#B8A9C9',
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
    backgroundColor: '#ffffff',
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
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7c3aed',
  },
  postAuthorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5A544E',
  },
  postTimestamp: {
    fontSize: 12,
    color: '#B0A89E',
    marginTop: 1,
  },
  postBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  postContent: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5A544E',
    marginBottom: 12,
  },
  postFooter: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  postAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  postActionText: {
    fontSize: 13,
    color: '#B0A89E',
  },
  likedText: {
    color: '#e11d48',
    fontWeight: '600',
  },
  // ── Comments modal ──────────────────────────────────────────────────────────
  modalSafeArea: {
    flex: 1,
    backgroundColor: '#FEFCF8',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#5A544E',
  },
  modalClose: {
    fontSize: 18,
    color: '#B0A89E',
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
    color: '#B0A89E',
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
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  commentAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7c3aed',
  },
  commentBody: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5A544E',
    marginBottom: 2,
  },
  commentContent: {
    fontSize: 14,
    color: '#5A544E',
    lineHeight: 20,
    marginBottom: 4,
  },
  commentTime: {
    fontSize: 11,
    color: '#B0A89E',
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#FEFCF8',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  commentSubmit: {
    backgroundColor: '#B8A9C9',
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
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyFeedText: {
    fontSize: 15,
    color: '#B0A89E',
    textAlign: 'center',
  },
});
