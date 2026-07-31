import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, Image, Modal, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import UserAvatar from './UserAvatar';
import { StoryGroup } from './StoriesBar';

const { width: W, height: H } = Dimensions.get('window');
const PHOTO_DURATION = 5000;
const VIDEO_DURATION = 30000;

function timeAgo(dateStr: string) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

interface Props {
  visible: boolean;
  groups: StoryGroup[];
  startGroupIndex: number;
  onClose: () => void;
}

export default function StoryViewer({ visible, groups, startGroupIndex, onClose }: Props) {
  const [groupIdx, setGroupIdx] = useState(startGroupIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const videoPlayer = useVideoPlayer(null, p => { p.loop = false; });

  // Keep a ref to the latest advance function to avoid stale closures in anim callback
  const goNextRef = useRef<() => void>(() => {});

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];

  const goNext = useCallback(() => {
    if (!group) { onClose(); return; }
    if (storyIdx < group.stories.length - 1) {
      setStoryIdx(i => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(g => g + 1);
      setStoryIdx(0);
    } else {
      onClose();
    }
  }, [group, storyIdx, groupIdx, groups.length, onClose]);

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx(i => i - 1);
    } else if (groupIdx > 0) {
      setGroupIdx(g => g - 1);
      setStoryIdx(0);
    }
  }, [storyIdx, groupIdx]);

  // Update ref every render
  goNextRef.current = goNext;

  // Reset state when opened
  useEffect(() => {
    if (visible) {
      setGroupIdx(startGroupIndex);
      setStoryIdx(0);
    }
  }, [visible, startGroupIndex]);

  // Load / unload video when the story changes
  useEffect(() => {
    if (!visible || !story) return;
    if (story.video_url) {
      videoPlayer.replace(story.video_url);
      videoPlayer.play();
    } else {
      videoPlayer.replace(null as any);
    }
  }, [groupIdx, storyIdx, visible]);

  // Advance when video finishes naturally
  useEffect(() => {
    const sub = videoPlayer.addListener('playToEnd', () => {
      animRef.current?.stop();
      goNextRef.current();
    });
    return () => sub.remove();
  }, [videoPlayer]);

  // Start/restart animation when story changes
  useEffect(() => {
    if (!visible || !story) return;
    animRef.current?.stop();
    progress.setValue(0);

    const duration = story.video_url ? VIDEO_DURATION : PHOTO_DURATION;
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) goNextRef.current();
    });

    return () => { anim.stop(); };
  }, [groupIdx, storyIdx, visible]);

  if (!visible || !group || !story) return null;

  const segmentWidth = (W - 24 - (group.stories.length - 1) * 4) / group.stories.length;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.container}>
        {/* Story content */}
        {story.video_url ? (
          <VideoView
            player={videoPlayer}
            style={s.image}
            contentFit="cover"
            nativeControls={false}
          />
        ) : story.image_url ? (
          <Image source={{ uri: story.image_url }} style={s.image} resizeMode="cover" />
        ) : (
          <View style={[s.textBg, { backgroundColor: story.bg_color ?? '#B1A7F0' }]}>
            <Text style={s.textStory}>{story.text_content}</Text>
          </View>
        )}

        {/* Gradient overlay at top */}
        <View style={s.topGradient} />

        <SafeAreaView style={s.overlay} pointerEvents="box-none">
          {/* Progress bars */}
          <View style={s.progressRow}>
            {group.stories.map((_, i) => (
              <View key={i} style={[s.progressTrack, { width: segmentWidth }]}>
                {i < storyIdx ? (
                  <View style={[s.progressFill, { width: segmentWidth }]} />
                ) : i === storyIdx ? (
                  <Animated.View style={[s.progressFill, {
                    width: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, segmentWidth],
                    }),
                  }]} />
                ) : null}
              </View>
            ))}
          </View>

          {/* Author row */}
          <View style={s.header}>
            <View style={s.authorRow}>
              <UserAvatar userId={group.user_id} name={group.author} size={36} />
              <View style={{ marginLeft: 10 }}>
                <Text style={s.authorName}>{group.author}</Text>
                <Text style={s.storyTime}>{timeAgo(story.created_at)}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button" accessibilityLabel="Close story">
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Tap zones — behind the header */}
        <View style={s.tapRow} pointerEvents="box-none">
          <TouchableOpacity style={s.tapLeft} onPress={goPrev} activeOpacity={1}
            accessibilityRole="button" accessibilityLabel="Previous story" />
          <TouchableOpacity style={s.tapRight} onPress={goNext} activeOpacity={1}
            accessibilityRole="button" accessibilityLabel="Next story" />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  image: { position: 'absolute', top: 0, left: 0, width: W, height: H },
  textBg: {
    position: 'absolute', top: 0, left: 0, width: W, height: H,
    justifyContent: 'center', alignItems: 'center', padding: 48,
  },
  textStory: {
    fontSize: 30, fontWeight: '700', color: '#fff',
    textAlign: 'center', lineHeight: 44,
    textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  topGradient: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 130,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  overlay: { flex: 1 },
  progressRow: {
    flexDirection: 'row', gap: 4,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
  },
  progressTrack: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: 3, backgroundColor: '#fff', borderRadius: 2 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 4,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  authorName: { color: '#fff', fontWeight: '700', fontSize: 14 },
  storyTime: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },
  closeBtn: { padding: 8 },
  closeBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  tapRow: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', top: 100 },
  tapLeft: { flex: 1 },
  tapRight: { flex: 1 },
});
