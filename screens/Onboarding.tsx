import React, { useContext, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { AppContext } from '../lib/AppContext';
import { useColors, Colors } from '../lib/theme';
import { moderateImage } from '../lib/contentModeration';
import ContentBlockedModal, { ContentType } from '../components/ContentBlockedModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDateInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return new Date().toISOString().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const [m, d, y] = parts;
      const year = y.length === 2 ? '20' + y : y.padStart(4, '0');
      const candidate = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      if (!isNaN(Date.parse(candidate))) return candidate;
    }
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}

function autoFormatDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

async function uploadPhoto(uri: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/baby-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('baby-photos')
      .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (err: any) {
    console.warn('Photo upload failed:', err.message);
    return null;
  }
}

// ─── Option data ──────────────────────────────────────────────────────────────

type Option = { id: string; label: string; emoji: string };

type Step = {
  title: string;
  subtitle: string;
  options: Option[];
  accent: string;
  singleSelect?: boolean;
};

const ROLE_OPTIONS: Option[] = [
  { id: 'Mom',         label: 'Mom',         emoji: '👩' },
  { id: 'Dad',         label: 'Dad',         emoji: '👨' },
  { id: 'Parent',      label: 'Parent',      emoji: '🧡' },
  { id: 'Grandparent', label: 'Grandparent', emoji: '🧓' },
  { id: 'Caregiver',   label: 'Caregiver',   emoji: '🤲' },
];

const FEEDING_OPTIONS: Option[] = [
  { id: 'breast',  label: 'Breastfeeding',  emoji: '🤱' },
  { id: 'bottle',  label: 'Bottle Feeding', emoji: '🍼' },
  { id: 'formula', label: 'Formula',        emoji: '🧪' },
  { id: 'solids',  label: 'Solid Foods',    emoji: '🥣' },
];

const TOPIC_OPTIONS: Option[] = [
  { id: 'feeding',           label: 'Feeding',             emoji: '🍼' },
  { id: 'sleep',             label: 'Sleep',               emoji: '😴' },
  { id: 'development',       label: 'Development',         emoji: '🌱' },
  { id: 'health',            label: 'Health & Wellness',   emoji: '💊' },
  { id: 'mental_health',     label: 'Mental Health',       emoji: '🧠' },
  { id: 'pumping',           label: 'Pumping',             emoji: '🤱' },
  { id: 'returning_to_work', label: 'Returning to Work',   emoji: '💼' },
  { id: 'postpartum',        label: 'Postpartum Recovery', emoji: '🌸' },
];

const VILLAGE_OPTIONS: Option[] = [
  { id: 'first_time',    label: 'First Time Parents',     emoji: '👶' },
  { id: 'breastfeeding', label: 'Breastfeeding Support',  emoji: '🤱' },
  { id: 'night_waking',  label: 'Sleep-Deprived Parents', emoji: '😴' },
  { id: 'working_mom',   label: 'Working Parents',        emoji: '💼' },
  { id: 'sahp',          label: 'Stay-at-Home Parents',   emoji: '🏡' },
  { id: 'nicu',          label: 'NICU Families',          emoji: '💪' },
  { id: 'multiples',     label: 'Twins & Multiples',      emoji: '👯' },
  { id: 'single_mom',    label: 'Single Parents',         emoji: '⭐' },
];

// Steps 1-4 (stepIndex 1-4 in the component; index 0-3 in this array via stepIndex-1)
const STEPS: Step[] = [
  {
    title: "What's your\nrole?",
    subtitle: 'This helps us personalize your experience and connect you with similar parents.',
    options: ROLE_OPTIONS,
    accent: '#B8A9C9',
    singleSelect: true,
  },
  {
    title: 'How are you\nfeeding?',
    subtitle: 'Select all that apply — you can change this any time.',
    options: FEEDING_OPTIONS,
    accent: '#B8A9C9',
  },
  {
    title: 'What topics\nhelp most?',
    subtitle: 'We\'ll surface the most relevant content for you.',
    options: TOPIC_OPTIONS,
    accent: '#A8B8A0',
  },
  {
    title: 'Join your\npatches',
    subtitle: 'Based on your answers, here are communities picked for you.',
    options: VILLAGE_OPTIONS,
    accent: '#E8B4B8',
  },
];

const TOTAL_STEPS = 5; // 0=Baby, 1=Role, 2=Feeding, 3=Topics, 4=Villages
const BABY_STEP_ACCENT = '#B8A9C9';

function getRelevantPatches(role: string[], feeding: string[], topics: string[]): Option[] {
  const result: Option[] = [];
  const seen = new Set<string>();
  function add(id: string, label: string, emoji: string) {
    if (!seen.has(id)) { seen.add(id); result.push({ id, label, emoji }); }
  }

  if (role.includes('Grandparent')) add('grandparent', 'Grandparent Caregivers', '🌻');

  if (feeding.includes('breast')) add('breastfeeding', 'Breastfeeding Support', '🤱');
  if (feeding.includes('bottle') || feeding.includes('formula')) add('formula_feeding', 'Formula Feeding', '🍼');
  if (feeding.includes('breast') && (feeding.includes('bottle') || feeding.includes('formula'))) add('combination_feeding', 'Combination Feeding', '🍼');
  if (feeding.includes('solids')) add('baby_led_weaning', 'Starting Solids / BLW', '🥦');

  if (topics.includes('feeding')) { add('breastfeeding', 'Breastfeeding Support', '🤱'); add('formula_feeding', 'Formula Feeding', '🍼'); add('exclusive_pumping', 'Exclusive Pumping', '🫙'); }
  if (topics.includes('sleep'))   { add('night_waking', 'Sleep-Deprived Parents', '😴'); add('sleep_training', 'Sleep Training', '😴'); add('sleep_regression', 'Sleep Regressions', '😩'); }
  if (topics.includes('mental_health') || topics.includes('postpartum')) { add('postpartum', 'Postpartum Support', '💛'); add('ppd_parents', 'Postpartum Depression (PPD)', '💛'); add('parent_mental_health_parents', 'Parental Mental Health', '💛'); }
  if (topics.includes('pumping'))           add('exclusive_pumping', 'Exclusive Pumping', '🫙');
  if (topics.includes('returning_to_work')) add('working_mom', 'Working Parents', '💼');
  if (topics.includes('development'))       { add('speech_delay', 'Speech Delay', '💬'); add('developmental_delay', 'Developmental Delay', '🌱'); }
  if (topics.includes('health'))            { add('autism', 'Autism Parents', '🧩'); add('nicu', 'NICU Families', '💪'); }

  // Always-present base patches
  add('first_time',    'First Time Parents',     '👶');
  add('night_waking',  'Sleep-Deprived Parents', '😴');
  add('working_mom',   'Working Parents',        '💼');
  add('sahp',          'Stay-at-Home Parents',   '🏡');
  add('nicu',          'NICU Families',          '💪');
  add('multiples',     'Twins & Multiples',      '👯');
  add('single_mom',    'Single Parents',         '⭐');
  add('breastfeeding', 'Breastfeeding Support',  '🤱');

  return result;
}

// ─── CheckCard ────────────────────────────────────────────────────────────────

function CheckCard({
  option,
  selected,
  onPress,
  accent,
  c,
}: {
  option: Option;
  selected: boolean;
  onPress: () => void;
  accent: string;
  c: Colors;
}) {
  const cc = useMemo(() => makeCheckCardStyles(c), [c]);
  return (
    <TouchableOpacity
      style={[cc.card, selected && { borderColor: accent, backgroundColor: accent + '14' }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={cc.emoji}>{option.emoji}</Text>
      <Text style={[cc.label, selected && { color: c.textPrimary }]}>{option.label}</Text>
      <View style={[cc.check, selected && { backgroundColor: accent, borderColor: accent }]}>
        {selected && <Text style={cc.checkmark}>✓</Text>}
      </View>
    </TouchableOpacity>
  );
}

function makeCheckCardStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      paddingVertical: 16,
      paddingHorizontal: 18,
      marginBottom: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
    emoji: {
      fontSize: 22,
      marginRight: 14,
    },
    label: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: c.textMuted,
    },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.inputBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkmark: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '800',
      lineHeight: 16,
    },
  });
}

// ─── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ current, total, c }: { current: number; total: number; c: Colors }) {
  const pd = useMemo(() => makeProgressDotStyles(c), [c]);
  return (
    <View style={pd.row}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            pd.dot,
            i < current
              ? pd.dotDone
              : i === current
              ? pd.dotActive
              : pd.dotInactive,
          ]}
        />
      ))}
    </View>
  );
}

function makeProgressDotStyles(c: Colors) {
  return StyleSheet.create({
    row:         { flexDirection: 'row', gap: 8, marginBottom: 36 },
    dot:         { height: 6, borderRadius: 3 },
    dotActive:   { width: 24, backgroundColor: c.lavender },
    dotDone:     { width: 24, backgroundColor: c.lavender, opacity: 0.4 },
    dotInactive: { width: 6,  backgroundColor: c.separator },
  });
}

// ─── Onboarding screen ────────────────────────────────────────────────────────

export default function Onboarding() {
  const { markOnboardingComplete } = useContext(AppContext);

  const [stepIndex, setStepIndex] = useState(0);
  // selections[0]=role, [1]=feeding, [2]=topics, [3]=villages (unchanged from before)
  const [selections, setSelections] = useState<string[][]>([[], [], [], []]);
  const [saving, setSaving] = useState(false);

  // Baby profile step (step 0) state
  const [babyName, setBabyName] = useState('');
  const [babyDOB, setBabyDOB] = useState('');
  const [isExpecting, setIsExpecting] = useState(false);
  const [babyGender, setBabyGender] = useState('');
  const [babyPhotoUri, setBabyPhotoUri] = useState<string | null>(null);
  const [babyId, setBabyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [moderating, setModerating] = useState(false);
  const [blockedContent, setBlockedContent] = useState<{
    severity: 'high' | 'extreme'; reason: string; contentType: ContentType;
  } | null>(null);

  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const isBabyStep = stepIndex === 0;
  const isLast = stepIndex === TOTAL_STEPS - 1;
  const step = isBabyStep ? null : STEPS[stepIndex - 1];
  const accent = isBabyStep ? BABY_STEP_ACCENT : step!.accent;

  const patchOptions = useMemo(
    () => getRelevantPatches(selections[0], selections[1], selections[2]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selections[0], selections[1], selections[2]]
  );
  const currentOptions = isLast ? patchOptions : (step?.options ?? []);

  function toggleOption(id: string) {
    setSelections(prev => {
      const selIdx = stepIndex - 1;
      const stepDef = STEPS[selIdx];
      if (stepDef.singleSelect) {
        return prev.map((s, i) => i === selIdx ? [id] : s);
      }
      const current = prev[selIdx];
      const updated = current.includes(id)
        ? current.filter(x => x !== id)
        : [...current, id];
      return prev.map((s, i) => (i === selIdx ? updated : s));
    });
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to add a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setModerating(true);
    const modResult = await moderateImage(result.assets[0].uri);
    setModerating(false);
    if (modResult.blocked) {
      setBlockedContent({ severity: modResult.severity, reason: modResult.reason, contentType: 'baby_photo' });
      return;
    }
    setBabyPhotoUri(result.assets[0].uri);
  }

  async function saveBabyAndContinue() {
    if (!babyName.trim()) {
      Alert.alert('Name required', "Please enter your baby's name.");
      return;
    }
    if (!isExpecting && !babyDOB.trim()) {
      Alert.alert('Date required', 'Please enter a date of birth.');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      let photoUrl: string | null = null;
      if (babyPhotoUri) {
        photoUrl = await uploadPhoto(babyPhotoUri, user.id);
      }

      const parsedDOB = (!isExpecting && babyDOB.trim()) ? parseDateInput(babyDOB) : null;

      if (babyId) {
        // User went back and is re-confirming — update the existing record
        await supabase.from('babies').update({
          name: babyName.trim(),
          birth_date: parsedDOB,
          is_expecting: isExpecting,
          gender: babyGender || null,
          ...(photoUrl ? { photo_url: photoUrl } : {}),
        }).eq('id', babyId);
      } else {
        const { data: baby, error } = await supabase
          .from('babies')
          .insert({
            user_id: user.id,
            name: babyName.trim(),
            birth_date: parsedDOB,
            is_expecting: isExpecting,
            gender: babyGender || null,
            photo_url: photoUrl,
          } as any)
          .select()
          .single();
        if (error) throw error;
        const insertedBaby = baby as { id: string } | null;
        if (!insertedBaby) throw new Error('Baby insert returned no data.');
        setBabyId(insertedBaby.id);
      }

      setStepIndex(1);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save baby profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    setSaving(true);
    const [roleSelection, feedingMethods, helpfulTopics, villages] = selections;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            onboarding_complete: true,
            ...(roleSelection.length > 0 ? { preferred_term: roleSelection[0] } : {}),
          } as any,
          { onConflict: 'id' }
        );

      // Use babyId stored from step 0; fall back to a lookup for edge cases
      let targetBabyId = babyId;
      if (!targetBabyId) {
        const { data } = await supabase
          .from('babies')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        targetBabyId = (data as any)?.id ?? null;
      }

      if (targetBabyId) {
        const { error } = await supabase
          .from('babies')
          .update({ feeding_methods: feedingMethods, helpful_topics: helpfulTopics, villages })
          .eq('id', targetBabyId);
        if (error) throw error;
      }

      if (villages.length > 0) {
        await supabase
          .from('user_villages')
          .upsert(
            villages.map(village_id => ({ user_id: user.id, village_id })) as any,
            { onConflict: 'user_id,village_id' }
          );
      }
    } catch (err: any) {
      console.warn('Onboarding DB save error (non-blocking):', err.message);
    }

    await markOnboardingComplete();
    setSaving(false);
  }

  const babyStepValid = babyName.trim().length > 0 && (isExpecting || babyDOB.trim().length > 0);
  const isNextDisabled = saving || (isBabyStep && !babyStepValid);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.inner}>
        <ProgressDots current={stepIndex} total={TOTAL_STEPS} c={c} />

        <Text style={styles.title}>
          {isBabyStep ? 'Tell us about\nyour baby' : step!.title}
        </Text>
        <Text style={styles.subtitle}>
          {isBabyStep
            ? 'This helps us personalize your content and track milestones.'
            : step!.subtitle}
        </Text>
      </View>

      {isBabyStep ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Photo picker */}
            <View style={styles.photoWrapper}>
              <TouchableOpacity style={styles.photoCircle} onPress={pickPhoto} activeOpacity={0.75}>
                {babyPhotoUri ? (
                  <Image source={{ uri: babyPhotoUri }} style={styles.photoImage} />
                ) : (
                  <Text style={styles.photoPlaceholder}>📷</Text>
                )}
                <View style={styles.photoBadge}>
                  <Text style={styles.photoBadgeText}>+</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.photoHint}>Add a photo (optional)</Text>
            </View>

            {/* Name */}
            <Text style={styles.fieldLabel}>Baby's name *</Text>
            <TextInput
              style={styles.textInput}
              value={babyName}
              onChangeText={setBabyName}
              placeholder="e.g. Oliver, Emma…"
              placeholderTextColor={c.textMuted}
              autoCapitalize="words"
              returnKeyType="next"
            />

            {/* Expecting toggle */}
            <View style={styles.expectingRow}>
              <Text style={styles.fieldLabel}>Not born yet / expecting</Text>
              <TouchableOpacity
                style={[styles.togglePill, isExpecting && styles.togglePillOn]}
                onPress={() => setIsExpecting(v => !v)}
              >
                <Text style={[styles.togglePillText, isExpecting && styles.togglePillTextOn]}>
                  {isExpecting ? 'Yes' : 'No'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Date of birth / due date */}
            <Text style={styles.fieldLabel}>
              {isExpecting ? 'Due date *' : 'Date of birth *'}
            </Text>
            <TextInput
              style={styles.textInput}
              value={babyDOB}
              onChangeText={t => setBabyDOB(autoFormatDate(t))}
              placeholder="MM/DD/YYYY"
              placeholderTextColor={c.textMuted}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />

            {/* Gender */}
            <Text style={styles.fieldLabel}>Gender (optional)</Text>
            <View style={styles.genderRow}>
              {['Boy', 'Girl', 'Prefer not to say'].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderChip, babyGender === g && styles.genderChipActive]}
                  onPress={() => setBabyGender(prev => prev === g ? '' : g)}
                >
                  <Text style={[styles.genderChipText, babyGender === g && styles.genderChipTextActive]}>
                    {g === 'Boy' ? '👦 Boy' : g === 'Girl' ? '👧 Girl' : '🤍 Prefer not to say'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.scrollPad} />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {currentOptions.map(opt => (
            <CheckCard
              key={opt.id}
              option={opt}
              selected={selections[stepIndex - 1].includes(opt.id)}
              onPress={() => toggleOption(opt.id)}
              accent={step!.accent}
              c={c}
            />
          ))}
          <View style={styles.scrollPad} />
        </ScrollView>
      )}

      <View style={styles.footer}>
        {stepIndex > 0 ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (isLast) setSelections(prev => prev.map((s, i) => i === 3 ? [] : s));
              setStepIndex(i => i - 1);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}

        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: accent }, isNextDisabled && styles.nextBtnOff]}
          onPress={isBabyStep ? saveBabyAndContinue : isLast ? handleComplete : () => setStepIndex(i => i + 1)}
          disabled={isNextDisabled}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.nextBtnText}>
              {isLast ? 'Get Started!' : 'Continue'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Content moderation overlay */}
      {moderating && (
        <View style={styles.moderatingOverlay}>
          <View style={styles.moderatingCard}>
            <ActivityIndicator size="large" />
            <Text style={styles.moderatingText}>Scanning content…</Text>
          </View>
        </View>
      )}

      {blockedContent && userId && (
        <ContentBlockedModal
          visible={!!blockedContent}
          severity={blockedContent.severity}
          reason={blockedContent.reason}
          contentType={blockedContent.contentType}
          userId={userId}
          onClose={() => setBlockedContent(null)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.bg,
    },
    inner: {
      paddingHorizontal: 28,
      paddingTop: 28,
    },
    title: {
      fontSize: 34,
      fontWeight: '800',
      color: c.textPrimary,
      lineHeight: 42,
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 15,
      color: c.textMuted,
      lineHeight: 22,
      marginBottom: 28,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 28,
    },
    scrollPad: {
      height: 16,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 28,
      paddingVertical: 20,
      gap: 14,
      borderTopWidth: 1,
      borderTopColor: c.separator,
      backgroundColor: c.bg,
    },
    backBtn: {
      width: 72,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    backBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textMuted,
    },
    nextBtn: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 17,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
    nextBtnOff: {
      opacity: 0.45,
    },
    nextBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.3,
    },

    // ── Baby step: photo
    photoWrapper: {
      alignItems: 'center',
      marginBottom: 24,
    },
    photoCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: c.avatarBg,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
      overflow: 'hidden',
    },
    photoImage: {
      width: 88,
      height: 88,
      borderRadius: 44,
    },
    photoPlaceholder: {
      fontSize: 32,
    },
    photoBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    photoBadgeText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 22,
    },
    photoHint: {
      fontSize: 13,
      color: c.textMuted,
      fontWeight: '500',
    },

    // ── Baby step: form fields
    fieldLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      marginBottom: 8,
      marginTop: 4,
    },
    textInput: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: c.textPrimary,
      fontWeight: '500',
      marginBottom: 20,
    },
    expectingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
      marginTop: -4,
    },
    togglePill: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: c.cardHoney,
    },
    togglePillOn: {
      backgroundColor: c.primary,
    },
    togglePillText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
    },
    togglePillTextOn: {
      color: '#fff',
    },
    genderRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 20,
    },
    genderChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
    },
    genderChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    genderChipText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textMuted,
    },
    genderChipTextActive: {
      color: '#fff',
    },

    // ── Content moderation overlay
    moderatingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    moderatingCard: {
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      gap: 12,
    },
    moderatingText: {
      fontSize: 14,
      fontWeight: '600',
    },
  });
}
