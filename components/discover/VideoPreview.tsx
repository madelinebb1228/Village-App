import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';

interface Props {
  emoji: string;
  title: string;
  description: string;
  onPress: () => void;
  width?: number;
}

// VideoGuidesScreen has no real video thumbnails/durations yet (it's
// category placeholders + a community "suggest a video" form), so this is a
// media-forward *category* card rather than a fabricated video thumbnail.
export default function VideoPreview({ emoji, title, description, onPress, width = 200 }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  return (
    <TouchableOpacity
      style={[s.card, { width }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
    >
      <View style={s.thumb}>
        <Text style={s.thumbEmoji}>{emoji}</Text>
      </View>
      <Text style={s.title} numberOfLines={1}>{title}</Text>
      <Text style={s.desc} numberOfLines={2}>{description}</Text>
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: { gap: 6 },
    thumb: {
      height: 100,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.separator,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbEmoji: { fontSize: 34 },
    title: { fontSize: 13.5, fontWeight: '700', color: c.textPrimary },
    desc: { fontSize: 11.5, color: c.textMuted, lineHeight: 15 },
  });
}
