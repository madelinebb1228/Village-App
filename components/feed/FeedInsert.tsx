import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../../lib/theme';

export type FeedInsertAccent = 'lavender' | 'blush' | 'sage' | 'honey' | 'blue';

interface Props {
  accent: FeedInsertAccent;
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow?: string;
  title: string;
  body: string;
  ctaLabel: string;
  onPress: () => void;
}

// A visually distinct "Parent Patch" branded card, interleaved into the
// otherwise-neutral social feed. Deliberately the only place in the feed that
// uses the brand's colorful card treatment — everything else stays neutral so
// these keep reading as helpful utility, not more dashboard noise.
export default function FeedInsert({ accent, icon, eyebrow = 'Parent Patch', title, body, ctaLabel, onPress }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c, accent), [c, accent]);

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.iconBubble}>
          <Ionicons name={icon} size={16} color={s.iconColor.color} />
        </View>
        <Text style={s.eyebrow}>{eyebrow}</Text>
      </View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.body}>{body}</Text>
      <TouchableOpacity
        style={s.cta}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
      >
        <Text style={s.ctaText}>{ctaLabel}</Text>
        <Ionicons name="chevron-forward" size={14} color={s.iconColor.color} />
      </TouchableOpacity>
    </View>
  );
}

function accentColors(c: Colors, accent: FeedInsertAccent) {
  switch (accent) {
    case 'blush':    return { bg: c.cardBlush,    fg: c.blush };
    case 'sage':      return { bg: c.cardSage,      fg: c.sage };
    case 'honey':     return { bg: c.cardHoney,     fg: c.honey };
    case 'blue':      return { bg: c.cardBlue,      fg: c.blue };
    case 'lavender':
    default:          return { bg: c.cardLavender,  fg: c.lavender };
  }
}

function makeStyles(c: Colors, accent: FeedInsertAccent) {
  const { bg, fg } = accentColors(c, accent);
  return StyleSheet.create({
    card: {
      backgroundColor: bg,
      borderRadius: 18,
      padding: 16,
      marginVertical: 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    iconBubble: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconColor: { color: fg },
    eyebrow: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: fg,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 4,
    },
    body: {
      fontSize: 13,
      color: c.textSecondary,
      lineHeight: 18,
      marginBottom: 12,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 2,
    },
    ctaText: {
      fontSize: 13,
      fontWeight: '700',
      color: fg,
    },
  });
}
