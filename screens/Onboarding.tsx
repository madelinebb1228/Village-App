import React, { useContext, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { AppContext } from '../lib/AppContext';

// ─── Option data ──────────────────────────────────────────────────────────────

type Option = { id: string; label: string; emoji: string };

const FEEDING_OPTIONS: Option[] = [
  { id: 'breast',  label: 'Breastfeeding',  emoji: '🤱' },
  { id: 'bottle',  label: 'Bottle Feeding', emoji: '🍼' },
  { id: 'formula', label: 'Formula',        emoji: '🧪' },
  { id: 'solids',  label: 'Solid Foods',    emoji: '🥣' },
];

const TOPIC_OPTIONS: Option[] = [
  { id: 'feeding',           label: 'Feeding',            emoji: '🍼' },
  { id: 'sleep',             label: 'Sleep',              emoji: '😴' },
  { id: 'development',       label: 'Development',        emoji: '🌱' },
  { id: 'health',            label: 'Health & Wellness',  emoji: '💊' },
  { id: 'mental_health',     label: 'Mental Health',      emoji: '🧠' },
  { id: 'pumping',           label: 'Pumping',            emoji: '🤱' },
  { id: 'returning_to_work', label: 'Returning to Work',  emoji: '💼' },
  { id: 'postpartum',        label: 'Postpartum Recovery',emoji: '🌸' },
];

const VILLAGE_OPTIONS: Option[] = [
  { id: 'new_moms',          label: 'New Moms Circle',        emoji: '👶' },
  { id: 'breastfeeding',     label: 'Breastfeeding Support',  emoji: '🤱' },
  { id: 'sleep_deprived',    label: 'Sleep-Deprived Parents', emoji: '😴' },
  { id: 'working_parents',   label: 'Working Parents',        emoji: '💼' },
  { id: 'stay_at_home',      label: 'Stay-at-Home Parents',   emoji: '🏡' },
  { id: 'nicu_families',     label: 'NICU Families',          emoji: '💪' },
  { id: 'multiples',         label: 'Twins & Multiples',      emoji: '👯' },
  { id: 'single_parents',    label: 'Single Parents',         emoji: '⭐' },
];

const STEPS = [
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
    title: 'Join your\nvillages',
    subtitle: 'Connect with parents on the same journey.',
    options: VILLAGE_OPTIONS,
    accent: '#E8B4B8',
  },
];

// ─── CheckCard ────────────────────────────────────────────────────────────────

function CheckCard({
  option,
  selected,
  onPress,
  accent,
}: {
  option: Option;
  selected: boolean;
  onPress: () => void;
  accent: string;
}) {
  return (
    <TouchableOpacity
      style={[cc.card, selected && { borderColor: accent, backgroundColor: accent + '14' }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={cc.emoji}>{option.emoji}</Text>
      <Text style={[cc.label, selected && { color: '#3D3530' }]}>{option.label}</Text>
      <View style={[cc.check, selected && { backgroundColor: accent, borderColor: accent }]}>
        {selected && <Text style={cc.checkmark}>✓</Text>}
      </View>
    </TouchableOpacity>
  );
}

const cc = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8E3DC',
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
    color: '#8A7E78',
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D8D0C8',
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

// ─── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ current, total }: { current: number; total: number }) {
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

const pd = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 8, marginBottom: 36 },
  dot:        { height: 6, borderRadius: 3 },
  dotActive:  { width: 24, backgroundColor: '#B8A9C9' },
  dotDone:    { width: 24, backgroundColor: '#B8A9C9', opacity: 0.4 },
  dotInactive:{ width: 6,  backgroundColor: '#E0D8D0' },
});

// ─── Onboarding screen ────────────────────────────────────────────────────────

export default function Onboarding() {
  const { markOnboardingComplete } = useContext(AppContext);

  const [stepIndex, setStepIndex] = useState(0);
  const [selections, setSelections] = useState<string[][]>([[], [], []]);
  const [saving, setSaving] = useState(false);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  function toggleOption(id: string) {
    setSelections(prev => {
      const current = prev[stepIndex];
      const updated = current.includes(id)
        ? current.filter(x => x !== id)
        : [...current, id];
      return prev.map((s, i) => (i === stepIndex ? updated : s));
    });
  }

  async function handleComplete() {
    setSaving(true);
    const [feedingMethods, helpfulTopics, villages] = selections;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: baby } = await supabase
          .from('babies')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (baby) {
          await supabase
            .from('babies')
            .update({ feeding_methods: feedingMethods, helpful_topics: helpfulTopics, villages })
            .eq('id', baby.id);
        }
      }
    } catch (err: any) {
      console.warn('Onboarding DB save error (non-blocking):', err.message);
    }

    await markOnboardingComplete();
    setSaving(false);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.inner}>
        <ProgressDots current={stepIndex} total={STEPS.length} />

        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.subtitle}>{step.subtitle}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {step.options.map(opt => (
          <CheckCard
            key={opt.id}
            option={opt}
            selected={selections[stepIndex].includes(opt.id)}
            onPress={() => toggleOption(opt.id)}
            accent={step.accent}
          />
        ))}
        <View style={styles.scrollPad} />
      </ScrollView>

      <View style={styles.footer}>
        {stepIndex > 0 ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setStepIndex(i => i - 1)}
            activeOpacity={0.7}
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}

        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: step.accent }, saving && styles.nextBtnOff]}
          onPress={isLast ? handleComplete : () => setStepIndex(i => i + 1)}
          disabled={saving}
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
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FEFCF8',
  },
  inner: {
    paddingHorizontal: 28,
    paddingTop: 28,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#3D3530',
    lineHeight: 42,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: '#B0A89E',
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
    borderTopColor: '#F0EBE4',
    backgroundColor: '#FEFCF8',
  },
  backBtn: {
    width: 72,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#B0A89E',
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
    opacity: 0.65,
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
