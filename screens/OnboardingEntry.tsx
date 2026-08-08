import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors, Colors } from '../lib/theme';
import OnboardingScreen from './Onboarding';
import PartnerJoinOnboarding from './PartnerJoinOnboarding';

type Mode = 'choose' | 'fresh' | 'joining';

export default function OnboardingEntry() {
  const [mode, setMode] = useState<Mode>('choose');
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  if (mode === 'fresh') return <OnboardingScreen />;
  if (mode === 'joining') return <PartnerJoinOnboarding onBack={() => setMode('choose')} />;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.title} accessibilityRole="header">Welcome to{'\n'}Parent Patch</Text>
        <Text style={styles.subtitle}>How are you getting started?</Text>

        <TouchableOpacity
          style={styles.choiceCard}
          onPress={() => setMode('fresh')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Starting fresh"
        >
          <Text style={styles.choiceEmoji}>👶</Text>
          <View style={styles.choiceText}>
            <Text style={styles.choiceTitle}>Starting fresh</Text>
            <Text style={styles.choiceSubtitle}>Set up your baby's profile and your own account.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.choiceCard}
          onPress={() => setMode('joining')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Joining as a partner or co-parent"
        >
          <Text style={styles.choiceEmoji}>🤝</Text>
          <View style={styles.choiceText}>
            <Text style={styles.choiceTitle}>Joining as a partner or co-parent</Text>
            <Text style={styles.choiceSubtitle}>Someone already started a baby's profile and gave you an invite code.</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.hint}>You can always invite or join another caregiver later from Settings.</Text>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    body: { flex: 1, padding: 24, justifyContent: 'center' },
    title: { fontSize: 30, fontWeight: '800', color: c.textPrimary, lineHeight: 36, marginBottom: 10 },
    subtitle: { fontSize: 15, color: c.textMuted, fontWeight: '500', marginBottom: 28 },
    choiceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: c.separator,
      padding: 18,
      marginBottom: 14,
    },
    choiceEmoji: { fontSize: 30 },
    choiceText: { flex: 1 },
    choiceTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    choiceSubtitle: { fontSize: 13, color: c.textMuted, fontWeight: '500', lineHeight: 18 },
    hint: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 17 },
  });
