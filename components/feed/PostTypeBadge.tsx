import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../../lib/theme';
import { Post } from '../../types/feed';

type Config = { icon: keyof typeof Ionicons.glyphMap; label: string; color: (c: Colors) => string };

const CONFIG: Partial<Record<Post['post_type'], Config>> = {
  milestone: { icon: 'trophy', label: 'Celebration', color: c => c.postMilestone },
  question:  { icon: 'help-circle', label: 'Question', color: c => c.postQuestion },
  poll:      { icon: 'bar-chart', label: 'Poll', color: c => c.postPoll },
};

interface Props {
  postType: Post['post_type'];
  size?: number;
}

// Compact system-metadata marker for a post's type — deliberately the same
// small colored-circle-plus-icon shape everywhere it appears (feed cards,
// trending cards, post detail, search results) so it reads as one
// consistent piece of chrome rather than a decorative sticker that happens
// to look different in each place it's used. Renders nothing for a plain
// text post — there's nothing to mark.
export default function PostTypeBadge({ postType, size = 14 }: Props) {
  const c = useColors();
  const cfg = CONFIG[postType];
  if (!cfg) return null;
  const color = cfg.color(c);
  const box = size + 12;
  return (
    <View
      style={[styles.badge, { backgroundColor: color + '22', width: box, height: box, borderRadius: box / 2 }]}
      accessible
      accessibilityLabel={`${cfg.label} post`}
    >
      <Ionicons name={cfg.icon} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
