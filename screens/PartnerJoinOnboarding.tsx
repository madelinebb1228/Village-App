import React, { useContext, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { AppContext } from '../lib/AppContext';
import { useBaby } from '../lib/babyContext';
import { useColors, Colors } from '../lib/theme';
import {
  PARENT_TERM_OPTIONS, CUSTOM_TERM_ID,
  FAMILY_STRUCTURE_OPTIONS,
} from '../lib/inclusiveLanguage';

type Step = 'code' | 'confirm' | 'about' | 'done';

export default function PartnerJoinOnboarding({ onBack }: { onBack: () => void }) {
  const { markOnboardingComplete } = useContext(AppContext);
  const { activeBaby, joinBabyByCode } = useBaby();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const [term, setTerm] = useState('');
  const [customTerm, setCustomTerm] = useState('');
  const [familyStructure, setFamilyStructure] = useState('');
  const [finishing, setFinishing] = useState(false);

  async function handleJoin() {
    if (!code.trim()) return;
    setJoining(true);
    setJoinError('');
    const result = await joinBabyByCode(code.trim());
    setJoining(false);
    if (!result.ok) {
      setJoinError(result.error ?? 'Please check the code and try again.');
      return;
    }
    setStep('confirm');
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const preferredTerm = term === CUSTOM_TERM_ID ? (customTerm.trim() || 'Parent') : (term || null);
        await supabase
          .from('profiles')
          .upsert(
            {
              id: user.id,
              onboarding_complete: true,
              ...(preferredTerm ? { preferred_term: preferredTerm } : {}),
              ...(familyStructure ? { family_structure: familyStructure } : {}),
            } as any,
            { onConflict: 'id' }
          );
      }
    } catch (err: any) {
      console.warn('PartnerJoinOnboarding save error (non-blocking):', err?.message);
    }
    await markOnboardingComplete();
    setFinishing(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={step === 'code' ? onBack : () => setStep('code')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="Back"
          >
            <Text style={styles.back}>‹ Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {step === 'code' && (
            <>
              <Text style={styles.title} accessibilityRole="header">Enter your invite code</Text>
              <Text style={styles.subtitle}>
                Ask your co-parent or family caregiver for the code from Settings → Manage Babies on their account.
              </Text>
              <TextInput
                style={styles.codeInput}
                placeholder="ABC123"
                placeholderTextColor={c.textMuted}
                value={code}
                onChangeText={t => { setCode(t); setJoinError(''); }}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel="Invite code"
              />
              {!!joinError && (
                <Text style={styles.error} accessibilityLiveRegion="assertive" accessibilityRole="alert">
                  {joinError}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.primaryBtn, (!code.trim() || joining) && styles.primaryBtnDisabled]}
                onPress={handleJoin}
                disabled={!code.trim() || joining}
                accessibilityRole="button" accessibilityLabel="Join"
                accessibilityState={{ disabled: !code.trim() || joining, busy: joining }}
              >
                {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Join</Text>}
              </TouchableOpacity>
            </>
          )}

          {step === 'confirm' && activeBaby && (
            <>
              <Text style={styles.title} accessibilityRole="header">You're in! 🎉</Text>
              <View style={styles.babyCard}>
                {activeBaby.photo_url ? (
                  <Image source={{ uri: activeBaby.photo_url }} style={styles.babyPhoto} />
                ) : (
                  <View style={styles.babyPhotoPlaceholder}>
                    <Text style={{ fontSize: 28 }}>👶</Text>
                  </View>
                )}
                <Text style={styles.babyName}>{activeBaby.name}</Text>
              </View>
              <Text style={styles.subtitle}>
                You can now see and log feeds, diapers, sleep, and more for {activeBaby.name}.
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => setStep('about')}
                accessibilityRole="button" accessibilityLabel="Continue"
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'about' && (
            <>
              <Text style={styles.title} accessibilityRole="header">What should we call you?</Text>
              <View style={styles.chipRow}>
                {PARENT_TERM_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.chip, term === opt.id && styles.chipActive]}
                    onPress={() => setTerm(prev => prev === opt.id ? '' : opt.id)}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected: term === opt.id }}
                  >
                    <Text style={[styles.chipText, term === opt.id && styles.chipTextActive]}>{opt.emoji} {opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {term === CUSTOM_TERM_ID && (
                <TextInput
                  style={styles.textInput}
                  placeholder="What should we call you?"
                  placeholderTextColor={c.textMuted}
                  value={customTerm}
                  onChangeText={setCustomTerm}
                  autoCapitalize="words"
                />
              )}

              <Text style={[styles.title, { fontSize: 18, marginTop: 24 }]}>Our family looks like</Text>
              <View style={styles.chipRow}>
                {FAMILY_STRUCTURE_OPTIONS.map(fs => (
                  <TouchableOpacity
                    key={fs}
                    style={[styles.chip, familyStructure === fs && styles.chipActive]}
                    onPress={() => setFamilyStructure(prev => prev === fs ? '' : fs)}
                    accessibilityRole="button"
                    accessibilityLabel={fs}
                    accessibilityState={{ selected: familyStructure === fs }}
                  >
                    <Text style={[styles.chipText, familyStructure === fs && styles.chipTextActive]}>{fs}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.hint}>Both are optional and you can change them any time in Profile.</Text>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleFinish}
                disabled={finishing}
                accessibilityRole="button" accessibilityLabel="Finish"
              >
                {finishing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Done</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 20, paddingTop: 8 },
    back: { fontSize: 15, fontWeight: '700', color: c.textSecondary },
    body: { flex: 1, padding: 24, justifyContent: 'center' },
    title: { fontSize: 24, fontWeight: '800', color: c.textPrimary, marginBottom: 10 },
    subtitle: { fontSize: 14, color: c.textMuted, fontWeight: '500', lineHeight: 20, marginBottom: 20 },
    codeInput: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator,
      paddingVertical: 16, paddingHorizontal: 16, fontSize: 22, fontWeight: '800', letterSpacing: 4,
      color: c.textPrimary, textAlign: 'center', marginBottom: 12,
    },
    error: { fontSize: 13, color: '#DC2626', marginBottom: 12, fontWeight: '600' },
    primaryBtn: {
      backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8,
    },
    primaryBtnDisabled: { opacity: 0.45 },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
    babyCard: {
      alignItems: 'center', backgroundColor: c.card, borderRadius: 18, borderWidth: 1.5,
      borderColor: c.separator, padding: 24, marginBottom: 20, gap: 10,
    },
    babyPhoto: { width: 72, height: 72, borderRadius: 36 },
    babyPhotoPlaceholder: {
      width: 72, height: 72, borderRadius: 36, backgroundColor: c.cardBlush,
      alignItems: 'center', justifyContent: 'center',
    },
    babyName: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
      backgroundColor: c.card, borderRadius: 20, borderWidth: 1.5, borderColor: c.separator,
      paddingHorizontal: 14, paddingVertical: 9,
    },
    chipActive: { backgroundColor: c.cardBlush, borderColor: c.blush ?? c.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    chipTextActive: { color: c.textPrimary, fontWeight: '700' },
    textInput: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator,
      paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: c.textPrimary, marginBottom: 12,
    },
    hint: { fontSize: 12, color: c.textMuted, marginTop: 4, marginBottom: 20, lineHeight: 17 },
  });
