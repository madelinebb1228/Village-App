import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, GestureResponderEvent } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { hitSlopFor } from '../../lib/accessibility';

interface Props {
  emoji: string;
  name: string;
  onPress: () => void;
}

// One consistent "which Patch is this post from" label, used everywhere a
// post can render: Home (For You/Following/Friends/Patches), Discover,
// Profile, PublicProfileSheet, and PostDetail. Compact and tappable rather
// than a colored banner — Patches don't have a real icon asset (only a
// per-Patch emoji, same as every other Patch surface in the app already
// uses), so that emoji sits inside a small neutral bubble instead of
// floating loose as plain text.
//
// Some callers (e.g. PostPreviewCard) render this inside an outer pressable
// "open post" card — stopPropagation here (harmless where there's no outer
// pressable) keeps tapping the Patch name from also triggering that.
export default function PatchLabel({ emoji, name, onPress }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  return (
    <TouchableOpacity
      style={s.tag}
      onPress={(e: GestureResponderEvent) => { e.stopPropagation?.(); onPress(); }}
      hitSlop={hitSlopFor(24)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name} patch`}
    >
      <View style={s.iconBubble}>
        <Text style={s.emoji}>{emoji}</Text>
      </View>
      <Text style={s.text} numberOfLines={1}>{name}</Text>
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      backgroundColor: c.cardLavender,
      borderRadius: 14,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.lavender,
    },
    iconBubble: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: c.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emoji: { fontSize: 10 },
    text: { fontSize: 11, fontWeight: '700', color: c.primary },
  });
}
