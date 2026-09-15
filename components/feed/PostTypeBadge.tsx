import React, { useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useColors, Colors } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { hitSlopFor } from '../../lib/accessibility';
import { Post } from '../../types/feed';
import PostTypeInfoPopover from './PostTypeInfoPopover';

type Config = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: (c: Colors) => string;
  description: string;
};

const CONFIG: Partial<Record<Post['post_type'], Config>> = {
  milestone: {
    icon: 'trophy-outline', label: 'Celebration', color: c => c.postMilestone,
    description: 'A parent is sharing something worth celebrating.',
  },
  question: {
    icon: 'help-circle-outline', label: 'Question', color: c => c.postQuestion,
    description: 'This parent is looking for advice or answers.',
  },
  poll: {
    icon: 'bar-chart-outline', label: 'Poll', color: c => c.postPoll,
    description: 'This parent is asking the community to vote.',
  },
};

interface Props {
  postType: Post['post_type'];
  size?: number;
}

// Compact system-metadata marker for a post's type — a plain outline
// Ionicon (same family/weight as the sidebar and Track), colored with its
// category accent, no container bubble. It's interactive: tapping it
// explains what the icon means and offers "See more <Type>s" — reusing
// Home's existing local post-type filter (see HomeTab's activePostType),
// the same pattern already used for topic/tag filtering, not a new backend.
export default function PostTypeBadge({ postType, size = 15 }: Props) {
  const c = useColors();
  const { isDesktop } = useResponsive();
  const navigation = useNavigation<any>();
  const cfg = CONFIG[postType];
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const btnRef = useRef<View>(null);

  if (!cfg) return null;
  const color = cfg.color(c);

  const openPopover = (e?: GestureResponderEvent) => {
    e?.stopPropagation?.();
    if (isDesktop && btnRef.current) {
      (btnRef.current as any).measureInWindow?.((x: number, y: number, width: number, height: number) => {
        setAnchor({ x, y, width, height });
        setOpen(true);
      });
    } else {
      setAnchor(null);
      setOpen(true);
    }
  };

  const handleSeeMore = () => {
    setOpen(false);
    navigation.navigate('Home', { filterPostType: postType });
  };

  return (
    <>
      <TouchableOpacity
        ref={btnRef}
        onPress={openPopover}
        activeOpacity={0.6}
        hitSlop={hitSlopFor(size)}
        style={styles.badge}
        accessibilityRole="button"
        accessibilityLabel={`${cfg.label} post. Activate for details.`}
      >
        <Ionicons name={cfg.icon} size={size} color={color} />
      </TouchableOpacity>
      <PostTypeInfoPopover
        visible={open}
        anchor={isDesktop ? anchor : null}
        icon={cfg.icon}
        label={cfg.label}
        description={cfg.description}
        ctaLabel={`See more ${cfg.label}s`}
        color={color}
        onClose={() => setOpen(false)}
        onSeeMore={handleSeeMore}
      />
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
