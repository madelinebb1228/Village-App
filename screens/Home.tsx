import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Image } from 'react-native'
import { supabase } from '../lib/supabase'

interface Post {
  id: string
  author: string
  content: string
  timestamp: string
  likes: number
  type: 'text' | 'milestone' | 'question'
}

export default function Home() {
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [postContent, setPostContent] = useState('')
  const [postType, setPostType] = useState<'text' | 'milestone' | 'question'>('text')
  
  // Mock data - replace with real Supabase queries
  const todayStats = {
    feeds: 6,
    diapers: 5,
    sleepHours: 14.5,
    nextFeeding: '2:30 PM'
  }

  const [posts, setPosts] = useState<Post[]>([
    {
      id: '1',
      author: 'Sarah M.',
      content: 'Finally got baby to sleep through the night! 7 hours straight 🎉 Any tips for keeping it consistent?',
      timestamp: '2h ago',
      likes: 12,
      type: 'question'
    },
    {
      id: '2',
      author: 'Jessica K.',
      content: 'First smile today at 6 weeks! My heart is melting 💕',
      timestamp: '4h ago',
      likes: 24,
      type: 'milestone'
    },
    {
      id: '3',
      author: 'Village Admin',
      content: 'New WIC-approved recipes added! Check out the sweet potato puffs - babies love them and they\'re so easy to make.',
      timestamp: '6h ago',
      likes: 8,
      type: 'text'
    }
  ])

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) Alert.alert('Error signing out', error.message)
  }

  function handleCreatePost() {
    if (!postContent.trim()) return
    
    const newPost: Post = {
      id: Date.now().toString(),
      author: 'You',
      content: postContent,
      timestamp: 'now',
      likes: 0,
      type: postType
    }
    
    setPosts([newPost, ...posts])
    setPostContent('')
    setShowCreatePost(false)
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Baby Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.profileInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>👶</Text>
            </View>
            <View>
              <Text style={styles.babyName}>Emma</Text>
              <Text style={styles.babyAge}>3 months old</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.editButton}>
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Today's Stats - Colorful Cards */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: '#dbeafe' }]}>
            <Text style={styles.statIcon}>🍼</Text>
            <Text style={styles.statValue}>{todayStats.feeds}</Text>
            <Text style={styles.statLabel}>Feeds</Text>
            <Text style={styles.statSubtext}>Next: {todayStats.nextFeeding}</Text>
          </View>
          
          <View style={[styles.statCard, { backgroundColor: '#fef3c7' }]}>
            <Text style={styles.statIcon}>👶</Text>
            <Text style={styles.statValue}>{todayStats.diapers}</Text>
            <Text style={styles.statLabel}>Diapers</Text>
            <Text style={styles.statSubtext}>Today</Text>
          </View>
          
          <View style={[styles.statCard, { backgroundColor: '#d1fae5' }]}>
            <Text style={styles.statIcon}>😴</Text>
            <Text style={styles.statValue}>{todayStats.sleepHours}h</Text>
            <Text style={styles.statLabel}>Sleep</Text>
            <Text style={styles.statSubtext}>Last 24h</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#6366f1' }]}>
            <Text style={styles.actionIcon}>🍼</Text>
            <Text style={styles.actionText}>Log Feed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#f59e0b' }]}>
            <Text style={styles.actionIcon}>👶</Text>
            <Text style={styles.actionText}>Log Diaper</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#10b981' }]}>
            <Text style={styles.actionIcon}>😴</Text>
            <Text style={styles.actionText}>Log Sleep</Text>
          </TouchableOpacity>
        </View>

        {/* Community Feed Header */}
        <View style={styles.feedHeader}>
          <Text style={styles.feedTitle}>Village Feed</Text>
          <TouchableOpacity 
            style={styles.createPostButton}
            onPress={() => setShowCreatePost(!showCreatePost)}
          >
            <Text style={styles.createPostText}>+ Post</Text>
          </TouchableOpacity>
        </View>

        {/* Create Post Interface */}
        {showCreatePost && (
          <View style={styles.createPostContainer}>
            <View style={styles.postTypeSelector}>
              {(['text', 'milestone', 'question'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.postTypeButton,
                    postType === type && styles.postTypeButtonActive
                  ]}
                  onPress={() => setPostType(type)}
                >
                  <Text style={[
                    styles.postTypeText,
                    postType === type && styles.postTypeTextActive
                  ]}>
                    {type === 'text' ? '💬 Update' : type === 'milestone' ? '🎉 Milestone' : '❓ Question'}
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
                  : 'What\'s on your mind?'
              }
              value={postContent}
              onChangeText={setPostContent}
              multiline
              numberOfLines={3}
            />
            <View style={styles.postActions}>
              <TouchableOpacity style={styles.attachButton}>
                <Text style={styles.attachButtonText}>📷 Photo</Text>
              </TouchableOpacity>
              <View style={styles.postButtons}>
                <TouchableOpacity 
                  style={styles.cancelButton}
                  onPress={() => setShowCreatePost(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    styles.submitButton,
                    !postContent.trim() && styles.submitButtonDisabled
                  ]}
                  onPress={handleCreatePost}
                  disabled={!postContent.trim()}
                >
                  <Text style={styles.submitButtonText}>Post</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Community Feed */}
        <View style={styles.feed}>
          {posts.map((post) => (
            <View key={post.id} style={styles.postCard}>
              <View style={styles.postHeader}>
                <View style={styles.postAuthor}>
                  <View style={styles.postAvatar}>
                    <Text style={styles.postAvatarText}>
                      {post.author.charAt(0)}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.postAuthorName}>{post.author}</Text>
                    <Text style={styles.postTimestamp}>{post.timestamp}</Text>
                  </View>
                </View>
                {post.type !== 'text' && (
                  <View style={[
                    styles.postBadge,
                    post.type === 'milestone' && { backgroundColor: '#fef3c7' },
                    post.type === 'question' && { backgroundColor: '#dbeafe' }
                  ]}>
                    <Text style={styles.postBadgeText}>
                      {post.type === 'milestone' ? '🎉' : '❓'}
                    </Text>
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
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
  },
  profileHeader: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
  },
  babyName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  babyAge: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  editButtonText: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
  },
  statLabel: {
    fontSize: 12,
    color: '#4b5563',
    marginTop: 2,
    fontWeight: '600',
  },
  statSubtext: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  feedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
  },
  feedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  createPostButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createPostText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  createPostContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attachButton: {
    paddingVertical: 8,
  },
  attachButtonText: {
    fontSize: 14,
    color: '#6366f1',
    fontWeight: '500',
  },
  postButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#6b7280',
  },
  submitButton: {
    backgroundColor: '#6366f1',
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
  feed: {
    paddingTop: 8,
  },
  postCard: {
    backgroundColor: '#fff',
    marginBottom: 8,
    padding: 16,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  postAuthor: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  postAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4338ca',
  },
  postAuthorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  postTimestamp: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 1,
  },
  postBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  postBadgeText: {
    fontSize: 12,
  },
  postContent: {
    fontSize: 15,
    lineHeight: 21,
    color: '#374151',
    marginBottom: 12,
  },
  postFooter: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  postAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  postActionText: {
    fontSize: 13,
    color: '#6b7280',
  },
})