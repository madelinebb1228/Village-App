import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { Village } from '../lib/villageData';
import { moderateImage } from '../lib/contentModeration';
import ContentBlockedModal from '../components/ContentBlockedModal';
import PublicProfileSheet from './PublicProfileSheet';
import UserAvatar from '../components/UserAvatar';
import { track } from '../lib/analytics';

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

interface Props {
  village: Village | null;
  visible: boolean;
  onClose: () => void;
  joined: boolean;
  onToggleJoin: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTimeAgo(dateString: string): string {
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

export default function VillageFeedSheet({ village, visible, onClose, joined, onToggleJoin }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());

  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');

  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postType, setPostType] = useState<Post['post_type']>('text');
  const [pendingPostImageUri, setPendingPostImageUri] = useState<string | null>(null);
  const [moderating, setModerating] = useState(false);
  const [blockedContent, setBlockedContent] = useState<{ severity: 'high' | 'extreme'; reason: string } | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !village) {
      setPosts([]);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
    fetchPosts();
    fetchLikedPosts();
  }, [visible, village?.id]);

  async function fetchPosts() {
    if (!village) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('village_id', village.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (!error && data) setPosts(data);
    setLoading(false);
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
      post_id: commentPostId, user_id: user.id, author, content: commentText,
    });
    if (!error) {
      setCommentText('');
      const { data } = await supabase
        .from('comments').select('*').eq('post_id', commentPostId).order('created_at', { ascending: true });
      if (data) setComments(data);
    }
  }

  async function doDeletePost(postId: string) {
    const { data, error } = await supabase.from('posts').delete().eq('id', postId).select('id');
    if (error) { Alert.alert('Delete Failed', error.message); return; }
    if (!data || data.length === 0) { Alert.alert('Delete Failed', 'Post not deleted.'); return; }
    setPosts(prev => prev.filter(p => p.id !== postId));
  }

  function handleDeletePost(post: Post) {
    const msg = 'Delete this post? This cannot be undone.';
    if (Platform.OS === 'web') { if (window.confirm(msg)) doDeletePost(post.id); return; }
    Alert.alert('Delete Post', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => doDeletePost(post.id) },
    ]);
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
      const uri = result.assets[0].uri;
      setModerating(true);
      const modResult = await moderateImage(uri);
      setModerating(false);
      if (modResult.blocked) {
        setBlockedContent({ severity: modResult.severity, reason: modResult.reason });
        return;
      }
      setPendingPostImageUri(uri);
    }
  }

  async function handleCreatePost() {
    if (!postContent.trim() && !pendingPostImageUri) return;
    if (!village) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert('Not signed in'); return; }

    const { data: profileData } = await supabase
      .from('profiles').select('username, display_name').eq('id', user.id).maybeSingle();
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
      village_id: village.id,
    };
    if (imageUrl) payload.image_url = imageUrl;

    const { error } = await supabase.from('posts').insert(payload);
    if (error) { Alert.alert('Could not post', error.message); return; }

    track('post_created', { patch_id: village.id, has_image: !!imageUrl });
    setPostContent('');
    setPendingPostImageUri(null);
    setPostType('text');
    setShowCreatePost(false);
    fetchPosts();
  }

  if (!village) return null;

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <SafeAreaView style={s.safeArea}>

          {/* ── Header ── */}
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} style={s.doneBtn}>
              <Text style={s.doneBtnText}>Done</Text>
            </TouchableOpacity>
            <View style={s.headerCenter}>
              <Text style={s.headerEmoji}>{village.emoji}</Text>
              <Text style={s.headerName} numberOfLines={1}>{village.name}</Text>
            </View>
            <TouchableOpacity
              style={[s.joinToggleBtn, joined && s.joinToggleBtnJoined]}
              onPress={onToggleJoin}
            >
              <Text style={[s.joinToggleBtnText, joined && s.joinToggleBtnTextJoined]}>
                {joined ? 'Leave' : '+ Join'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Description ── */}
          <View style={s.descRow}>
            <Text style={s.villageDesc}>{village.description}</Text>
          </View>

          {/* ── Feed ── */}
          {loading ? (
            <View style={s.center}>
              <ActivityIndicator color={c.primary} size="large" />
            </View>
          ) : (
            <ScrollView
              style={s.feed}
              contentContainerStyle={s.feedContent}
              showsVerticalScrollIndicator={false}
            >
              {posts.length === 0 ? (
                <View style={s.emptyFeed}>
                  <Text style={s.emptyFeedEmoji}>🏘️</Text>
                  <Text style={s.emptyFeedTitle}>No posts yet</Text>
                  <Text style={s.emptyFeedSub}>
                    {joined
                      ? 'Be the first to post to this patch!'
                      : 'Join this patch to start posting here.'}
                  </Text>
                </View>
              ) : posts.map(post => (
                <View key={post.id} style={[s.postCard, {
                  borderLeftColor: post.post_type === 'milestone' ? c.postMilestone
                    : post.post_type === 'question' ? c.postQuestion
                    : c.postText,
                }]}>
                  <View style={s.postHeader}>
                    <TouchableOpacity
                      style={s.postAuthorRow}
                      onPress={() => setProfileUserId(post.user_id)}
                      activeOpacity={0.7}
                    >
                      <UserAvatar userId={post.user_id} name={post.author} size={36} />
                      <View>
                        <Text style={s.postAuthorName}>{post.author}</Text>
                        <Text style={s.postTimestamp}>{getTimeAgo(post.created_at)}</Text>
                      </View>
                    </TouchableOpacity>
                    <View style={s.postHeaderRight}>
                      {post.post_type !== 'text' && (
                        <View style={[
                          s.postBadge,
                          post.post_type === 'milestone' ? { backgroundColor: c.cardHoney } : { backgroundColor: c.cardBlue },
                        ]}>
                          <Text>{post.post_type === 'milestone' ? '🎉' : '❓'}</Text>
                        </View>
                      )}
                      {post.user_id === currentUserId && (
                        <TouchableOpacity onPress={() => handleDeletePost(post)} style={s.postDeleteBtn}>
                          <Text>🗑</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  {post.content ? <Text style={s.postContent}>{post.content}</Text> : null}
                  {post.image_url ? (
                    <Image source={{ uri: post.image_url }} style={s.postImage} resizeMode="cover" />
                  ) : null}
                  <View style={s.postFooter}>
                    <TouchableOpacity style={s.postAction} onPress={() => toggleLike(post)}>
                      <Text style={[s.postActionText, likedPostIds.has(post.id) && s.likedText]}>
                        {likedPostIds.has(post.id) ? '❤️' : '🤍'} {post.likes}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.postAction} onPress={() => openComments(post.id)}>
                      <Text style={s.postActionText}>💬 Reply</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={{ height: 80 }} />
            </ScrollView>
          )}

          {/* FAB — only when joined */}
          {joined && (
            <TouchableOpacity style={s.fab} onPress={() => setShowCreatePost(true)} activeOpacity={0.85}>
              <Text style={s.fabIcon}>＋</Text>
            </TouchableOpacity>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Comments modal ── */}
      <Modal
        visible={commentPostId !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCommentPostId(null)}
      >
        <SafeAreaView style={s.modalSafeArea}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Comments</Text>
            <TouchableOpacity onPress={() => setCommentPostId(null)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 12 }}>
            {comments.length === 0 ? (
              <Text style={s.noComments}>No comments yet. Start the conversation!</Text>
            ) : comments.map(cm => (
              <View key={cm.id} style={s.commentItem}>
                <UserAvatar userId={cm.user_id} name={cm.author} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={s.commentAuthor}>{cm.author}</Text>
                  <Text style={s.commentContent}>{cm.content}</Text>
                  <Text style={s.commentTime}>{getTimeAgo(cm.created_at)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.commentInputRow}>
              <TextInput
                style={s.commentInput}
                placeholder="Add a comment..."
                value={commentText}
                onChangeText={setCommentText}
                multiline
              />
              <TouchableOpacity
                style={[s.commentSubmitBtn, !commentText.trim() && s.disabledBtn]}
                onPress={submitComment}
                disabled={!commentText.trim()}
              >
                <Text style={s.commentSubmitText}>Post</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Create post modal ── */}
      <Modal
        visible={showCreatePost}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowCreatePost(false); setPendingPostImageUri(null); }}
      >
        <SafeAreaView style={s.modalSafeArea}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => { setShowCreatePost(false); setPendingPostImageUri(null); }}>
              <Text style={s.modalClose}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle} numberOfLines={1}>Post to {village.name}</Text>
            <TouchableOpacity
              style={[s.postSubmitBtn, (!postContent.trim() && !pendingPostImageUri) && s.disabledBtn]}
              onPress={handleCreatePost}
              disabled={(!postContent.trim() && !pendingPostImageUri) || imageUploading}
            >
              {imageUploading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.postSubmitBtnText}>Post</Text>
              }
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              {/* Village chip */}
              <View style={s.postingToChip}>
                <Text style={s.postingToText}>{village.emoji}  Posting to {village.name}</Text>
              </View>

              <View style={s.postTypeSelector}>
                {(['text', 'milestone', 'question'] as Post['post_type'][]).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[s.postTypeBtn, postType === t && s.postTypeBtnActive]}
                    onPress={() => setPostType(t)}
                  >
                    <Text style={[s.postTypeBtnText, postType === t && s.postTypeBtnTextActive]}>
                      {t === 'text' ? '💬 Update' : t === 'milestone' ? '🎉 Milestone' : '❓ Question'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={s.postInput}
                placeholder={
                  postType === 'milestone' ? 'Share a milestone...' :
                  postType === 'question' ? 'Ask the community...' :
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
                <View style={s.imagePreviewWrap}>
                  <Image source={{ uri: pendingPostImageUri }} style={s.imagePreview} resizeMode="cover" />
                  <TouchableOpacity style={s.removeImageBtn} onPress={() => setPendingPostImageUri(null)}>
                    <Text style={s.removeImageText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={s.addPhotoBtn} onPress={pickPostImage}>
                <Text style={s.addPhotoBtnText}>📷  Add Photo</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Public profile viewer ── */}
      <PublicProfileSheet
        userId={profileUserId}
        visible={profileUserId !== null}
        onClose={() => setProfileUserId(null)}
      />

      {blockedContent && currentUserId && (
        <ContentBlockedModal
          visible={!!blockedContent}
          severity={blockedContent.severity}
          reason={blockedContent.reason}
          contentType="post_image"
          userId={currentUserId}
          onClose={() => setBlockedContent(null)}
        />
      )}

      {moderating && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', gap: 12,
        }}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Checking photo…</Text>
        </View>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },

    // ── Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    doneBtn: { paddingHorizontal: 4 },
    doneBtnText: { fontSize: 15, fontWeight: '600', color: c.primary },
    headerCenter: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
    headerEmoji: { fontSize: 20 },
    headerName: { fontSize: 16, fontWeight: '800', color: c.textPrimary, flexShrink: 1 },
    joinToggleBtn: {
      borderWidth: 1.5,
      borderColor: c.primary,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    joinToggleBtnJoined: { borderColor: c.textMuted },
    joinToggleBtnText: { fontSize: 13, fontWeight: '700', color: c.primary },
    joinToggleBtnTextJoined: { color: c.textMuted },

    descRow: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    villageDesc: { fontSize: 13, color: c.textMuted, lineHeight: 18 },

    // ── Feed
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    feed: { flex: 1 },
    feedContent: { padding: 16, paddingBottom: 40 },

    emptyFeed: {
      alignItems: 'center',
      padding: 40,
      marginTop: 24,
    },
    emptyFeedEmoji: { fontSize: 40, marginBottom: 12 },
    emptyFeedTitle: { fontSize: 17, fontWeight: '700', color: c.textSecondary, marginBottom: 6 },
    emptyFeedSub: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },

    // ── Post card
    postCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 10,
      borderLeftWidth: 4,
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
    postAuthorRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    postAvatar: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.boyBg, justifyContent: 'center', alignItems: 'center',
    },
    postAvatarText: { fontSize: 14, fontWeight: '700', color: c.primary },
    postAuthorName: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
    postTimestamp: { fontSize: 12, color: c.textMuted, marginTop: 1 },
    postHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    postBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    postDeleteBtn: { padding: 4 },
    postContent: { fontSize: 15, lineHeight: 22, color: c.textSecondary, marginBottom: 12 },
    postImage: {
      width: '100%', height: 220, borderRadius: 12,
      marginBottom: 12, backgroundColor: '#F0EBE4',
    },
    postFooter: {
      flexDirection: 'row',
      gap: 20,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.inputBg,
    },
    postAction: { flexDirection: 'row', alignItems: 'center' },
    postActionText: { fontSize: 13, color: c.textMuted },
    likedText: { color: '#e11d48', fontWeight: '600' },

    // ── FAB
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
    fabIcon: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 34, marginTop: -2 },

    // ── Shared modal styles
    modalSafeArea: { flex: 1, backgroundColor: c.bg },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.inputBg,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.textSecondary, flex: 1, textAlign: 'center' },
    modalClose: { fontSize: 16, color: c.textMuted, paddingHorizontal: 4, fontWeight: '500' },

    // ── Comments
    noComments: { textAlign: 'center', color: c.textMuted, fontSize: 15, marginTop: 40 },
    commentItem: { flexDirection: 'row', gap: 12, marginBottom: 18 },
    commentAvatar: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: c.boyBg, justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    commentAvatarText: { fontSize: 13, fontWeight: '700', color: c.primary },
    commentAuthor: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 2 },
    commentContent: { fontSize: 14, color: c.textSecondary, lineHeight: 20, marginBottom: 4 },
    commentTime: { fontSize: 11, color: c.textMuted },
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
    commentSubmitBtn: {
      backgroundColor: c.primary,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    commentSubmitText: { color: '#fff', fontWeight: '600', fontSize: 14 },

    // ── Create post modal
    postingToChip: {
      backgroundColor: c.cardLavender,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginBottom: 16,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: c.lavender,
    },
    postingToText: { fontSize: 13, fontWeight: '700', color: c.primary },
    postTypeSelector: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    postTypeBtn: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: c.inputBg,
    },
    postTypeBtnActive: { backgroundColor: c.cardBlush },
    postTypeBtnText: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
    postTypeBtnTextActive: { color: c.primary },
    postInput: {
      backgroundColor: c.inputBg,
      borderRadius: 12,
      padding: 12,
      fontSize: 15,
      minHeight: 100,
      textAlignVertical: 'top',
      marginBottom: 12,
    },
    imagePreviewWrap: {
      marginBottom: 12, borderRadius: 12, overflow: 'hidden', position: 'relative',
    },
    imagePreview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: '#F0EBE4' },
    removeImageBtn: {
      position: 'absolute', top: 8, right: 8,
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
    },
    removeImageText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    addPhotoBtn: {
      paddingVertical: 12, paddingHorizontal: 16,
      borderRadius: 12, backgroundColor: c.cardBlush, alignSelf: 'flex-start',
    },
    addPhotoBtnText: { fontSize: 14, color: c.primary, fontWeight: '600' },
    postSubmitBtn: {
      backgroundColor: c.primary, paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20,
    },
    postSubmitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    disabledBtn: { backgroundColor: '#d1d5db' },
  });
}
