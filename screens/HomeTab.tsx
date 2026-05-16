import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type Post = {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  likes: number;
  type: 'text' | 'milestone' | 'question';
};

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeTab() {
  const [stats, setStats] = useState<Stats>({ feeds: 0, diapers: 0, pumpedMl: 0 });
  const [loading, setLoading] = useState(true);

  const [posts, setPosts] = useState<Post[]>([
    {
      id: '1',
      author: 'Sarah M.',
      content: 'Finally got baby to sleep through the night! 7 hours straight 🎉 Any tips for keeping it consistent?',
      timestamp: '2h ago',
      likes: 12,
      type: 'question',
    },
    {
      id: '2',
      author: 'Jessica K.',
      content: 'First smile today at 6 weeks! My heart is melting 💕',
      timestamp: '4h ago',
      likes: 24,
      type: 'milestone',
    },
    {
      id: '3',
      author: 'Village Admin',
      content: "New WIC-approved recipes added! Check out the sweet potato puffs - babies love them and they're so easy to make.",
      timestamp: '6h ago',
      likes: 8,
      type: 'text',
    },
  ]);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postType, setPostType] = useState<Post['type']>('text');

  function handleCreatePost() {
    if (!postContent.trim()) return;
    const newPost: Post = {
      id: Date.now().toString(),
      author: 'You',
      content: postContent,
      timestamp: 'now',
      likes: 0,
      type: postType,
    };
    setPosts([newPost, ...posts]);
    setPostContent('');
    setShowCreatePost(false);
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
  const hasActivity = stats.feeds > 0 || stats.diapers > 0 || stats.pumpedMl > 0;

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

        {/* Recent activity */}
        <Text style={styles.sectionTitle}>Recent Activity</Text>

        <View style={styles.activityCard}>
          {loading ? (
            <ActivityIndicator color="#B8A9C9" />
          ) : hasActivity ? (
            <View style={styles.activitySummary}>
              {stats.feeds > 0 && (
                <ActivityRow
                  emoji="🍼"
                  label={`${stats.feeds} feed${stats.feeds !== 1 ? 's' : ''} logged today`}
                  accent="#B8A9C9"
                />
              )}
              {stats.diapers > 0 && (
                <ActivityRow
                  emoji="💩"
                  label={`${stats.diapers} diaper${stats.diapers !== 1 ? 's' : ''} logged today`}
                  accent="#A8B8A0"
                />
              )}
              {stats.pumpedMl > 0 && (
                <ActivityRow
                  emoji="🤱"
                  label={`${mlToOz(stats.pumpedMl)} oz pumped today`}
                  accent="#E8B4B8"
                />
              )}
            </View>
          ) : (
            <>
              <Text style={styles.activityEmpty}>No activity yet today.</Text>
              <Text style={styles.activityHint}>
                Tap Track to start logging feeds, diapers, and pumping sessions.
              </Text>
            </>
          )}
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
              {(['text', 'milestone', 'question'] as const).map((t) => (
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

        {posts.map((post) => (
          <View key={post.id} style={styles.postCard}>
            <View style={styles.postHeader}>
              <View style={styles.postAuthorRow}>
                <View style={styles.postAvatar}>
                  <Text style={styles.postAvatarText}>{post.author.charAt(0)}</Text>
                </View>
                <View>
                  <Text style={styles.postAuthorName}>{post.author}</Text>
                  <Text style={styles.postTimestamp}>{post.timestamp}</Text>
                </View>
              </View>
              {post.type !== 'text' && (
                <View style={[
                  styles.postBadge,
                  post.type === 'milestone' ? { backgroundColor: '#fef3c7' } : { backgroundColor: '#dbeafe' },
                ]}>
                  <Text>{post.type === 'milestone' ? '🎉' : '❓'}</Text>
                </View>
              )}
            </View>
            <Text style={styles.postContent}>{post.content}</Text>
            <View style={styles.postFooter}>
              <TouchableOpacity style={styles.postAction}>
                <Text style={styles.postActionText}>❤️ {post.likes}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.postAction}>
                <Text style={styles.postActionText}>💬 Reply</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.postAction}>
                <Text style={styles.postActionText}>↗️ Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Activity row sub-component ───────────────────────────────────────────────

function ActivityRow({
  emoji,
  label,
  accent,
}: {
  emoji: string;
  label: string;
  accent: string;
}) {
  return (
    <View style={activityRowStyles.row}>
      <View style={[activityRowStyles.dot, { backgroundColor: accent }]} />
      <Text style={activityRowStyles.emoji}>{emoji}</Text>
      <Text style={activityRowStyles.label}>{label}</Text>
    </View>
  );
}

const activityRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  emoji: {
    fontSize: 18,
    marginRight: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5A544E',
    flex: 1,
  },
});

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
  activityCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activitySummary: {
    width: '100%',
  },
  activityEmpty: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5A544E',
    marginBottom: 8,
  },
  activityHint: {
    fontSize: 13,
    color: '#B0A89E',
    textAlign: 'center',
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
});
