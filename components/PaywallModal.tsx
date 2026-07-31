import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, Colors } from '../lib/theme';

const FEATURES = [
  { emoji: '🌙', label: 'Sleep tracker + Wake Windows' },
  { emoji: '📈', label: 'Growth charts with percentiles' },
  { emoji: '💉', label: 'Vaccine & appointment tracker' },
  { emoji: '📓', label: 'Baby Journal' },
  { emoji: '🧴', label: 'Smart supply insights & low-stock alerts' },
  { emoji: '🏘️', label: 'Unlimited village memberships' },
  { emoji: '🌈', label: 'Mood, nutrition & wellness tracking' },
  { emoji: '💊', label: 'Meds, period & movement tracking' },
  { emoji: '✏️', label: 'Post shopping lists, recipes & video guides' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => Promise<boolean>;
  onRestore: () => Promise<boolean>;
};

export default function PaywallModal({ visible, onClose, onSubscribe, onRestore }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const s = styles(c, insets);
  const [subscribing, setSubscribing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function handleSubscribe() {
    setSubscribing(true);
    await onSubscribe();
    setSubscribing(false);
  }

  async function handleRestore() {
    setRestoring(true);
    await onRestore();
    setRestoring(false);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
      onRequestClose={onClose}
    >
      <View style={s.container}>
        <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button" accessibilityLabel="Close">
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text style={s.badge}>🌿 Village Premium</Text>
          <Text style={s.headline}>Everything you need{'\n'}to thrive as a parent</Text>
          <Text style={s.price}>$5.99 <Text style={s.pricePer}>/ month</Text></Text>
          <Text style={s.cancelNote}>Cancel anytime · Billed monthly</Text>

          <View style={s.featureList}>
            {FEATURES.map((f, i) => (
              <View key={i} style={s.featureRow}>
                <Text style={s.featureEmoji}>{f.emoji}</Text>
                <Text style={s.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>

          <View style={s.freePickBadge}>
            <Text style={s.freePickText}>🎁 Plus 1 free tracker unlock for everyone</Text>
          </View>

          <TouchableOpacity
            style={[s.subscribeBtn, subscribing && s.subscribeBtnDisabled]}
            onPress={handleSubscribe}
            disabled={subscribing || restoring}
            activeOpacity={0.85}
            accessibilityRole="button" accessibilityLabel="Start Premium, $5.99 per month"
          >
            {subscribing
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.subscribeBtnText}>Start Premium — $5.99/mo</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={s.restoreBtn}
            onPress={handleRestore}
            disabled={subscribing || restoring}
            activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel="Restore purchase"
          >
            {restoring
              ? <ActivityIndicator color={c.textMuted} size="small" />
              : <Text style={s.restoreBtnText}>Restore Purchase</Text>
            }
          </TouchableOpacity>

          <Text style={s.legalText}>
            Subscription auto-renews at $5.99/month. Cancel anytime in your device settings.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = (c: Colors, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
      paddingTop: insets.top,
    },
    closeBtn: {
      position: 'absolute',
      top: insets.top + 16,
      right: 20,
      zIndex: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeBtnText: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '700',
    },
    scroll: {
      paddingHorizontal: 28,
      paddingTop: 56,
      paddingBottom: insets.bottom + 32,
      alignItems: 'center',
    },
    badge: {
      fontSize: 15,
      fontWeight: '700',
      color: c.sage,
      marginBottom: 16,
      letterSpacing: 0.5,
    },
    headline: {
      fontSize: 28,
      fontWeight: '800',
      color: c.textPrimary,
      textAlign: 'center',
      lineHeight: 36,
      marginBottom: 20,
    },
    price: {
      fontSize: 42,
      fontWeight: '800',
      color: c.textPrimary,
      marginBottom: 4,
    },
    pricePer: {
      fontSize: 20,
      fontWeight: '600',
      color: c.textMuted,
    },
    cancelNote: {
      fontSize: 13,
      color: c.textMuted,
      fontWeight: '500',
      marginBottom: 32,
    },
    featureList: {
      width: '100%',
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 20,
      gap: 14,
      marginBottom: 16,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    featureEmoji: {
      fontSize: 20,
      width: 28,
      textAlign: 'center',
    },
    featureLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textPrimary,
      flex: 1,
    },
    freePickBadge: {
      backgroundColor: c.cardHoney,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginBottom: 28,
      width: '100%',
      alignItems: 'center',
    },
    freePickText: {
      fontSize: 14,
      fontWeight: '700',
      color: c.textPrimary,
    },
    subscribeBtn: {
      width: '100%',
      backgroundColor: c.lavender,
      borderRadius: 16,
      paddingVertical: 18,
      alignItems: 'center',
      marginBottom: 16,
    },
    subscribeBtnDisabled: {
      opacity: 0.6,
    },
    subscribeBtnText: {
      fontSize: 17,
      fontWeight: '800',
      color: '#fff',
      letterSpacing: 0.3,
    },
    restoreBtn: {
      paddingVertical: 10,
      marginBottom: 24,
    },
    restoreBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textMuted,
      textDecorationLine: 'underline',
    },
    legalText: {
      fontSize: 11,
      color: c.textMuted,
      textAlign: 'center',
      lineHeight: 16,
    },
  });
