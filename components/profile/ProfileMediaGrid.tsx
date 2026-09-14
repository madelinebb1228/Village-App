import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { Post } from '../../types/feed';

interface Props {
  /** Already filtered to posts with image_url or video_url. */
  posts: Post[];
  onPressPost: (post: Post) => void;
  columns?: number;
}

// Simple 3-column media grid built from the user's existing posts — no new
// storage or media pipeline, just a filtered view over posts already loaded
// for the Posts tab.
export default function ProfileMediaGrid({ posts, onPressPost, columns = 3 }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const gap = 3;
  const widthPct = `${100 / columns}%` as const;

  return (
    <View style={s.grid}>
      {posts.map(post => (
        <View key={post.id} style={{ width: widthPct, padding: gap / 2 }}>
          <TouchableOpacity
            style={s.cell}
            onPress={() => onPressPost(post)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={post.video_url ? 'Video post' : 'Photo post'}
          >
            {post.image_url ? (
              <Image source={{ uri: post.image_url }} style={s.thumb} resizeMode="cover" />
            ) : (
              <View style={[s.thumb, s.videoThumb]}>
                <Text style={s.playIcon}>▶</Text>
              </View>
            )}
            {post.video_url && post.image_url ? (
              <View style={s.videoBadge}><Text style={s.videoBadgeIcon}>▶</Text></View>
            ) : null}
            {post.is_sensitive ? (
              <View style={s.sensitiveOverlay}>
                <Text style={s.sensitiveIcon}>⚠️</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: {
      aspectRatio: 1,
      borderRadius: 6,
      overflow: 'hidden',
      backgroundColor: c.card,
    },
    thumb: { width: '100%', height: '100%' },
    videoThumb: { backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
    playIcon: { fontSize: 22, color: '#fff' },
    videoBadge: {
      position: 'absolute', top: 6, right: 6,
      width: 20, height: 20, borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
    },
    videoBadgeIcon: { fontSize: 9, color: '#fff' },
    sensitiveOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sensitiveIcon: { fontSize: 20 },
  });
}
