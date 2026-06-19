import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSubscription } from '../lib/subscriptionContext';
import { useColors, Colors } from '../lib/theme';

type Props = {
  feature: string;
  isTracker?: boolean;
  title: string;
  description: string;
  emoji?: string;
  children: React.ReactNode;
};

export default function PaywallGate({ feature, isTracker = false, title, description, emoji = '🔒', children }: Props) {
  const { isSubscribed, freeTrackerPick, setFreeTrackerPick, openPaywall } = useSubscription();

  const isUnlocked = isSubscribed || (isTracker && freeTrackerPick === feature);

  if (isUnlocked) return <>{children}</>;

  const canUseFree = isTracker && freeTrackerPick === null;
  const usedFreeOnOther = isTracker && freeTrackerPick !== null && freeTrackerPick !== feature;

  const c = useColors();
  const s = styles(c);

  return (
    <View style={s.container}>
      <View style={s.lockIcon}>
        <Text style={s.lockEmoji}>{emoji}</Text>
      </View>

      <Text style={s.title}>{title}</Text>
      <Text style={s.description}>{description}</Text>

      {canUseFree && (
        <TouchableOpacity
          style={s.freeBtn}
          onPress={() => setFreeTrackerPick(feature)}
          activeOpacity={0.85}
        >
          <Text style={s.freeBtnText}>🎁 Use my free tracker unlock</Text>
        </TouchableOpacity>
      )}

      {usedFreeOnOther && (
        <View style={s.freeUsedNote}>
          <Text style={s.freeUsedText}>Your free unlock is already in use on another tracker</Text>
        </View>
      )}

      <TouchableOpacity
        style={[s.upgradeBtn, canUseFree && s.upgradeBtnSecondary]}
        onPress={openPaywall}
        activeOpacity={0.85}
      >
        <Text style={[s.upgradeBtnText, canUseFree && s.upgradeBtnTextSecondary]}>
          {canUseFree ? 'Or upgrade to Premium' : 'Unlock with Premium — $5.99/mo'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    container: {
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 28,
      margin: 16,
      alignItems: 'center',
      gap: 12,
    },
    lockIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    lockEmoji: {
      fontSize: 30,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: c.textPrimary,
      textAlign: 'center',
    },
    description: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 4,
    },
    freeBtn: {
      width: '100%',
      backgroundColor: c.cardHoney,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    freeBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
    },
    freeUsedNote: {
      backgroundColor: c.inputBg,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 14,
      width: '100%',
    },
    freeUsedText: {
      fontSize: 13,
      color: c.textMuted,
      fontWeight: '500',
      textAlign: 'center',
    },
    upgradeBtn: {
      width: '100%',
      backgroundColor: c.lavender,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    upgradeBtnSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: c.lavender,
    },
    upgradeBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#fff',
    },
    upgradeBtnTextSecondary: {
      color: c.lavender,
    },
  });
