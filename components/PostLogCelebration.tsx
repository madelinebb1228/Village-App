import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { useColors, Colors } from '../lib/theme';
import Patchy from './Patchy';

interface Props {
  visible: boolean;
  streak: number;
  milestone: number | null;
  usedFreeze: boolean;
  onDismiss: () => void;
}

const MILESTONE_LINES: Record<number, string> = {
  3:   'Three days in a row! 🌟',
  7:   'One whole week! 🔥',
  14:  'Two weeks strong! 💪',
  30:  'A whole month! 🏆',
  60:  'Two months!! You\'re incredible 🌟🌟',
  100: '100 days!! You\'re a legend 👑',
};

export default function PostLogCelebration({
  visible, streak, milestone, usedFreeze, onDismiss,
}: Props) {
  const c = useColors();
  const s = makeStyles(c);

  // Auto-dismiss after 2.5 s
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDismiss, 2500);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  const isMilestone = milestone !== null;
  const mood = isMilestone || streak >= 7 ? 'celebrating' : 'happy';

  let title    = `${streak} day streak! 🎉`;
  let subtitle = 'Nice work logging today.';

  if (streak === 1) {
    title    = 'First log! 🐾';
    subtitle = 'Patchy is cheering for you.';
  } else if (isMilestone) {
    subtitle = MILESTONE_LINES[milestone!] ?? 'Amazing milestone!';
  } else if (usedFreeze) {
    subtitle = '❄️ Streak freeze used — streak saved!';
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onDismiss}>
        <View style={[s.card, isMilestone && s.milestoneCard]}>
          <Patchy mood={mood} size={110} />
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
          <Text style={s.tapHint}>Tap to continue</Text>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    card: {
      backgroundColor: c.bg,
      borderRadius: 28,
      padding: 32,
      alignItems: 'center',
      gap: 8,
      width: 280,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
      borderWidth: 2,
      borderColor: c.lavender,
    },
    milestoneCard: {
      borderColor: '#F9DE87',
      borderWidth: 3,
    },
    title: {
      fontSize: 22,
      fontWeight: '900',
      color: c.textPrimary,
      textAlign: 'center',
      marginTop: 4,
    },
    subtitle: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    tapHint: {
      fontSize: 12,
      color: c.textMuted,
      fontWeight: '500',
      marginTop: 8,
    },
  });
