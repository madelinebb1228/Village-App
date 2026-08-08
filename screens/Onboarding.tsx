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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../lib/supabase';
import { AppContext } from '../lib/AppContext';
import { useColors, Colors } from '../lib/theme';
import { moderateImage } from '../lib/contentModeration';
import ContentBlockedModal, { ContentType } from '../components/ContentBlockedModal';
import { useSubscription, MAX_FREE_TRACKER_PICKS } from '../lib/subscriptionContext';
import { PREMIUM_TRACKERS } from '../lib/premiumTrackers';
import { PARENT_TERM_OPTIONS, CUSTOM_TERM_ID } from '../lib/inclusiveLanguage';

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

// Local breadcrumb until a real analytics SDK is wired up — no PostHog/Segment
// exists in this codebase yet, so these events currently only reach the dev console.
function track(event: string, props?: Record<string, any>) {
  if (__DEV__) console.log('[analytics]', event, props ?? {});
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

const ROLE_OPTIONS: Option[] = PARENT_TERM_OPTIONS;

const TOPIC_OPTIONS: Option[] = [
  { id: 'feeding',           label: 'Feeding',             emoji: '🍼' },
  { id: 'sleep',             label: 'Sleep',               emoji: '😴' },
  { id: 'sleep_training',    label: 'Sleep Training',      emoji: '🌜' },
  { id: 'development',       label: 'Development',         emoji: '🌱' },
  { id: 'milestones_play',   label: 'Milestones & Play',   emoji: '🧸' },
  { id: 'health',            label: 'Health & Wellness',   emoji: '💊' },
  { id: 'mental_health',     label: 'Mental Health',       emoji: '🧠' },
  { id: 'pumping',           label: 'Pumping',             emoji: '🤱' },
  { id: 'returning_to_work', label: 'Returning to Work',   emoji: '💼' },
  { id: 'postpartum',        label: 'Postpartum Recovery', emoji: '🌸' },
  { id: 'multiples',         label: 'Twins & Multiples',   emoji: '👯' },
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

// Every feeding option that can ever be selected, regardless of the baby's current
// age — used to resolve ids back to labels (e.g. on the Review screen) even when the
// age-gated getFeedingOptions() below wouldn't currently offer that option.
const ALL_FEEDING_OPTIONS: Option[] = [
  { id: 'breast',            label: 'Breastfeeding',        emoji: '🤱' },
  { id: 'bottle',            label: 'Bottle Feeding',       emoji: '🍼' },
  { id: 'formula',           label: 'Formula',              emoji: '🧪' },
  { id: 'combo',             label: 'Combination Feeding',  emoji: '🔄' },
  { id: 'exclusive_pumping', label: 'Exclusively Pumping',  emoji: '🫙' },
  { id: 'tube_feeding',      label: 'Tube Feeding',         emoji: '🏥' },
  { id: 'solids_starting',   label: 'Starting Solids',      emoji: '🥄' },
  { id: 'solids',            label: 'Solid Foods',          emoji: '🥣' },
];

function feedingLabel(id: string): string {
  return ALL_FEEDING_OPTIONS.find(o => o.id === id)?.label ?? id;
}

// Age-gated: babies under 4 months don't see solid-food options.
function getFeedingOptions(ageMonths: number): Option[] {
  const base = ALL_FEEDING_OPTIONS.filter(o => o.id !== 'solids_starting' && o.id !== 'solids');
  if (ageMonths >= 4) base.push(ALL_FEEDING_OPTIONS.find(o => o.id === 'solids_starting')!);
  if (ageMonths >= 6) base.push(ALL_FEEDING_OPTIONS.find(o => o.id === 'solids')!);
  return base;
}

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
    options: [], // computed dynamically from baby's age, see getFeedingOptions()
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

// 0=Baby, 1=Role, 2=Feeding, 3=Topics, 4=Patches, 5=Free Trackers, 6=Partner Invite, 7=Review
const TOTAL_STEPS = 8;
const BABY_STEP_ACCENT = '#B8A9C9';
const TRACKERS_STEP_ACCENT = '#8B7FD6';
const STEP_NAMES = ['Baby Profile', 'Role', 'Feeding', 'Topics', 'Patches', 'Free Trackers', 'Partner Invite', 'Review'];
const OPTIONAL_STEPS = [2, 3, 4, 5];
const isOptionalStep = (idx: number) => OPTIONAL_STEPS.includes(idx);

function getRelevantPatches(role: string[], feeding: string[], topics: string[]): Option[] {
  const result: Option[] = [];
  const seen = new Set<string>();
  function add(id: string, label: string, emoji: string) {
    if (!seen.has(id)) { seen.add(id); result.push({ id, label, emoji }); }
  }

  if (role.includes('Grandparent')) add('grandparent', 'Grandparent Caregivers', '🌻');
  if (role.includes('Nanny')) add('professional_caregiver', 'Professional Caregivers', '🧑‍🍼');

  const nursing = feeding.includes('breast') || feeding.includes('combo');
  const formulaOrBottle = feeding.includes('bottle') || feeding.includes('formula') || feeding.includes('combo');
  if (nursing) add('breastfeeding', 'Breastfeeding Support', '🤱');
  if (formulaOrBottle) add('formula_feeding', 'Formula Feeding', '🍼');
  if (nursing && formulaOrBottle) add('combination_feeding', 'Combination Feeding', '🍼');
  if (feeding.includes('exclusive_pumping')) add('exclusive_pumping', 'Exclusive Pumping', '🫙');
  if (feeding.includes('solids') || feeding.includes('solids_starting')) add('baby_led_weaning', 'Starting Solids / BLW', '🥦');

  if (topics.includes('feeding')) { add('breastfeeding', 'Breastfeeding Support', '🤱'); add('formula_feeding', 'Formula Feeding', '🍼'); add('exclusive_pumping', 'Exclusive Pumping', '🫙'); }
  if (topics.includes('sleep') || topics.includes('sleep_training')) { add('night_waking', 'Sleep-Deprived Parents', '😴'); add('sleep_training', 'Sleep Training', '😴'); add('sleep_regression', 'Sleep Regressions', '😩'); }
  if (topics.includes('mental_health') || topics.includes('postpartum')) { add('postpartum', 'Postpartum Support', '💛'); add('ppd_parents', 'Postpartum Depression (PPD)', '💛'); add('parent_mental_health_parents', 'Parental Mental Health', '💛'); }
  if (topics.includes('pumping'))           add('exclusive_pumping', 'Exclusive Pumping', '🫙');
  if (topics.includes('returning_to_work')) add('working_mom', 'Working Parents', '💼');
  if (topics.includes('development') || topics.includes('milestones_play')) { add('speech_delay', 'Speech Delay', '💬'); add('developmental_delay', 'Developmental Delay', '🌱'); }
  if (topics.includes('health'))            { add('autism', 'Autism Parents', '🧩'); add('nicu', 'NICU Families', '💪'); }
  if (topics.includes('multiples'))         add('multiples', 'Twins & Multiples', '👯');

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

function ProgressDots({
  current,
  total,
  onDotPress,
  c,
}: {
  current: number;
  total: number;
  onDotPress: (index: number) => void;
  c: Colors;
}) {
  const pd = useMemo(() => makeProgressDotStyles(c), [c]);
  return (
    <View style={pd.row}>
      {Array.from({ length: total }, (_, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => (i < current ? onDotPress(i) : undefined)}
          disabled={i >= current}
          hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
          accessibilityLabel={`Go to step ${i + 1} of ${total}`}
          accessibilityRole="button"
          accessibilityState={{ selected: i === current, disabled: i >= current }}
        >
          <View
            style={[
              pd.dot,
              i < current
                ? pd.dotDone
                : i === current
                ? pd.dotActive
                : pd.dotInactive,
            ]}
          />
        </TouchableOpacity>
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

// ─── Review step ──────────────────────────────────────────────────────────────

type Styles = ReturnType<typeof makeStyles>;

function ReviewStep({
  babyName,
  babyDOB,
  isExpecting,
  role,
  feeding,
  topics,
  patches,
  trackerPicks,
  customRoleText,
  onEdit,
  styles,
}: {
  babyName: string;
  babyDOB: string;
  isExpecting: boolean;
  role: string[];
  feeding: string[];
  topics: string[];
  patches: string[];
  trackerPicks: string[];
  customRoleText: string;
  onEdit: (stepIndex: number) => void;
  styles: Styles;
}) {
  const roleDisplay = role
    .map(r => (r === CUSTOM_TERM_ID ? (customRoleText.trim() || 'Something else') : r))
    .join(', ');
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity style={styles.reviewRow} onPress={() => onEdit(0)} activeOpacity={0.7}>
        <View style={styles.reviewRowText}>
          <Text style={styles.reviewLabel}>Baby</Text>
          <Text style={styles.reviewValue}>
            {babyName || 'Not set'} • {isExpecting ? 'Expecting' : babyDOB ? `Born ${babyDOB}` : '—'}
          </Text>
        </View>
        <Text style={styles.reviewEdit}>Edit ›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.reviewRow} onPress={() => onEdit(1)} activeOpacity={0.7}>
        <View style={styles.reviewRowText}>
          <Text style={styles.reviewLabel}>Your role</Text>
          <Text style={styles.reviewValue}>{role.length ? roleDisplay : 'Not set'}</Text>
        </View>
        <Text style={styles.reviewEdit}>Edit ›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.reviewRow} onPress={() => onEdit(2)} activeOpacity={0.7}>
        <View style={styles.reviewRowText}>
          <Text style={styles.reviewLabel}>Feeding</Text>
          <Text style={styles.reviewValue}>
            {feeding.length ? feeding.map(feedingLabel).join(', ') : 'Skipped'}
          </Text>
        </View>
        <Text style={styles.reviewEdit}>Edit ›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.reviewRow} onPress={() => onEdit(3)} activeOpacity={0.7}>
        <View style={styles.reviewRowText}>
          <Text style={styles.reviewLabel}>Topics</Text>
          <Text style={styles.reviewValue}>{topics.length ? `${topics.length} selected` : 'Skipped'}</Text>
        </View>
        <Text style={styles.reviewEdit}>Edit ›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.reviewRow} onPress={() => onEdit(4)} activeOpacity={0.7}>
        <View style={styles.reviewRowText}>
          <Text style={styles.reviewLabel}>Patches</Text>
          <Text style={styles.reviewValue}>{patches.length ? `${patches.length} joined` : 'Skipped'}</Text>
        </View>
        <Text style={styles.reviewEdit}>Edit ›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.reviewRow} onPress={() => onEdit(5)} activeOpacity={0.7}>
        <View style={styles.reviewRowText}>
          <Text style={styles.reviewLabel}>Free trackers</Text>
          <Text style={styles.reviewValue}>{trackerPicks.length ? `${trackerPicks.length} unlocked` : 'None picked'}</Text>
        </View>
        <Text style={styles.reviewEdit}>Edit ›</Text>
      </TouchableOpacity>

      <Text style={styles.reviewFooter}>You can change any of this later in Settings.</Text>
      <View style={styles.scrollPad} />
    </ScrollView>
  );
}

// ─── Partner invite step ──────────────────────────────────────────────────────

function PartnerInviteStep({
  userId,
  onNext,
  onSkip,
  styles,
  c,
}: {
  userId: string | null;
  onNext: () => void;
  onSkip: () => void;
  styles: Styles;
  c: Colors;
}) {
  const [inviteMethod, setInviteMethod] = useState<'sms' | 'email' | 'copy' | null>(null);
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const inviteLink = `https://parentpatch.app/join?ref=${userId ?? ''}`;
  const inviteMessage = `I'm using Parent Patch to track our baby's feeding, sleep, and milestones. Join me! ${inviteLink}`;

  async function handleSend() {
    if (!inviteMethod) return;

    if (inviteMethod === 'copy') {
      setSending(true);
      try {
        await Clipboard.setStringAsync(inviteLink);
        track('partner_invite_sent', { method: 'copy' });
        setCopied(true);
        setTimeout(onNext, 900);
      } catch {
        Alert.alert('Could not copy', 'Please try inviting your co-parent from Profile → Family Sharing instead.');
        setSending(false);
      }
      return;
    }

    if (!contact.trim()) return;
    setSending(true);
    try {
      if (inviteMethod === 'sms') {
        await Linking.openURL(`sms:${contact.trim()}?body=${encodeURIComponent(inviteMessage)}`);
      } else {
        await Linking.openURL(
          `mailto:${contact.trim()}?subject=${encodeURIComponent('Join me on Parent Patch')}&body=${encodeURIComponent(inviteMessage)}`
        );
      }
      track('partner_invite_sent', { method: inviteMethod });
      onNext();
    } catch {
      Alert.alert('Could not open', 'Please try inviting your co-parent from Profile → Family Sharing instead.');
    } finally {
      setSending(false);
    }
  }

  const canSend = !sending && (inviteMethod === 'copy' || (!!inviteMethod && contact.trim().length > 0));

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.inviteMethodRow}>
        <TouchableOpacity
          onPress={() => setInviteMethod('sms')}
          style={[styles.methodChip, inviteMethod === 'sms' && styles.methodChipActive]}
        >
          <Text style={[styles.genderChipText, inviteMethod === 'sms' && styles.genderChipTextActive]}>
            📱 SMS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setInviteMethod('email')}
          style={[styles.methodChip, inviteMethod === 'email' && styles.methodChipActive]}
        >
          <Text style={[styles.genderChipText, inviteMethod === 'email' && styles.genderChipTextActive]}>
            ✉️ Email
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setInviteMethod('copy')}
          style={[styles.methodChip, inviteMethod === 'copy' && styles.methodChipActive]}
        >
          <Text style={[styles.genderChipText, inviteMethod === 'copy' && styles.genderChipTextActive]}>
            🔗 Copy Link
          </Text>
        </TouchableOpacity>
      </View>

      {inviteMethod === 'sms' || inviteMethod === 'email' ? (
        <TextInput
          style={styles.textInput}
          placeholder={inviteMethod === 'sms' ? 'Phone number' : 'Email address'}
          placeholderTextColor={c.textMuted}
          value={contact}
          onChangeText={setContact}
          keyboardType={inviteMethod === 'sms' ? 'phone-pad' : 'email-address'}
          autoCapitalize="none"
        />
      ) : inviteMethod === 'copy' ? (
        <View style={styles.linkBox}>
          <Text style={styles.linkBoxText} numberOfLines={1}>{inviteLink}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.nextBtn, { backgroundColor: c.primary }, !canSend && styles.nextBtnOff]}
        onPress={handleSend}
        disabled={!canSend}
        activeOpacity={0.85}
      >
        {sending && !copied ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.nextBtnText}>
            {inviteMethod === 'copy' ? (copied ? 'Copied! ✓' : 'Copy Link') : 'Send Invite'}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={onSkip} style={styles.skipLarge}
        accessibilityRole="button" accessibilityLabel="Skip — I'll invite them later">
        <Text style={styles.skipLargeText}>Skip — I'll invite them later</Text>
      </TouchableOpacity>

      <Text style={styles.inviteFooter}>
        You can always invite your co-parent later from Profile → Family Sharing.
      </Text>
      <View style={styles.scrollPad} />
    </ScrollView>
  );
}

// ─── Onboarding screen ────────────────────────────────────────────────────────

function progressKey(userId: string) {
  return `onboarding_progress:${userId}`;
}

export default function Onboarding() {
  const { markOnboardingComplete } = useContext(AppContext);

  const [stepIndex, setStepIndex] = useState(0);
  // selections[0]=role, [1]=feeding, [2]=topics, [3]=patches
  const [selections, setSelections] = useState<string[][]>([[], [], [], []]);
  // Free-text entry when the Role step's "Something else" chip is selected.
  const [customRoleText, setCustomRoleText] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // When true, the user jumped here from the Review step to edit an answer —
  // the next Continue/Skip should return them to Review instead of advancing normally.
  const [editFromReview, setEditFromReview] = useState(false);

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

  // Free tracker picks step
  const { freeTrackerPicks, setFreeTrackerPicks } = useSubscription();
  const [trackerPicks, setTrackerPicks] = useState<string[]>(freeTrackerPicks);

  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // Restore in-progress onboarding (e.g. app was force-quit mid-flow). Keyed by user id
  // so a second account signing up on the same device doesn't inherit a stale, half-filled
  // draft (wrong baby name, wrong step) left behind by a previous account.
  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(progressKey(userId))
      .then(saved => {
        if (saved) {
          try {
            const data = JSON.parse(saved);
            if (typeof data.stepIndex === 'number') setStepIndex(data.stepIndex);
            if (typeof data.babyName === 'string') setBabyName(data.babyName);
            if (typeof data.babyDOB === 'string') setBabyDOB(data.babyDOB);
            if (typeof data.babyGender === 'string') setBabyGender(data.babyGender);
            if (typeof data.isExpecting === 'boolean') setIsExpecting(data.isExpecting);
            if (typeof data.babyPhotoUri === 'string') setBabyPhotoUri(data.babyPhotoUri);
            if (typeof data.babyId === 'string') setBabyId(data.babyId);
            if (Array.isArray(data.selections)) setSelections(data.selections);
            if (typeof data.customRoleText === 'string') setCustomRoleText(data.customRoleText);
          } catch (err) {
            console.warn('Could not restore onboarding progress:', err);
          }
        }
      })
      .finally(() => setHydrated(true));
  }, [userId]);

  // Persist progress after every change, once initial restore has finished
  // (so we don't immediately overwrite saved progress with blank initial state).
  useEffect(() => {
    if (!hydrated || !userId) return;
    AsyncStorage.setItem(
      progressKey(userId),
      JSON.stringify({ stepIndex, babyName, babyDOB, babyGender, isExpecting, babyPhotoUri, babyId, selections, customRoleText })
    ).catch(() => {});
  }, [hydrated, userId, stepIndex, babyName, babyDOB, babyGender, isExpecting, babyPhotoUri, babyId, selections, customRoleText]);

  const babyAgeMonths = useMemo(() => {
    if (isExpecting || !babyDOB.trim()) return 0;
    const diff = Date.now() - new Date(parseDateInput(babyDOB)).getTime();
    if (diff < 0 || isNaN(diff)) return 0;
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 30.44));
  }, [babyDOB, isExpecting]);

  // Babies under 4 months shouldn't keep a solids selection if the DOB changes after picking one.
  useEffect(() => {
    if (babyAgeMonths >= 4) return;
    setSelections(prev => {
      if (!prev[1].some(id => id === 'solids' || id === 'solids_starting')) return prev;
      const next = [...prev];
      next[1] = next[1].filter(id => id !== 'solids' && id !== 'solids_starting');
      return next;
    });
  }, [babyAgeMonths]);

  const isBabyStep = stepIndex === 0;
  const isRoleStep = stepIndex === 1;
  const isRoleTopicStep = stepIndex >= 1 && stepIndex <= 4;
  const isFeedingStep = stepIndex === 2;
  const isPatchesStep = stepIndex === 4;
  const isTrackersStep = stepIndex === 5;
  const isPartnerStep = stepIndex === 6;
  const isReviewStep = stepIndex === TOTAL_STEPS - 1;

  const step = isRoleTopicStep ? STEPS[stepIndex - 1] : null;
  const accent = isBabyStep ? BABY_STEP_ACCENT : isTrackersStep ? TRACKERS_STEP_ACCENT : step ? step.accent : BABY_STEP_ACCENT;

  const feedingOptions = useMemo(() => getFeedingOptions(babyAgeMonths), [babyAgeMonths]);
  const patchOptions = useMemo(
    () => getRelevantPatches(selections[0], selections[1], selections[2]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selections[0], selections[1], selections[2]]
  );
  const currentOptions = isPatchesStep ? patchOptions : isFeedingStep ? feedingOptions : (step?.options ?? []);

  const headerTitle = isBabyStep
    ? 'Tell us about\nyour baby'
    : isTrackersStep
    ? 'Try some premium\ntrackers free'
    : isPartnerStep
    ? 'Share tracking with\nyour co-parent?'
    : isReviewStep
    ? 'Looks good?'
    : step!.title;

  const headerSubtitle = isBabyStep
    ? 'This helps us personalize your content and track milestones.'
    : isTrackersStep
    ? `Pick up to ${MAX_FREE_TRACKER_PICKS} to unlock for free — no subscription needed. You can change these later in Settings.`
    : isPartnerStep
    ? 'Both parents see the same data in real-time. No more "did you feed the baby?" texts.'
    : isReviewStep
    ? 'Review your answers — tap any section to edit.'
    : step!.subtitle;

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

  function toggleTracker(key: string) {
    setTrackerPicks(prev => {
      const isSelected = prev.includes(key);
      if (!isSelected && prev.length >= MAX_FREE_TRACKER_PICKS) {
        Alert.alert('Pick up to ' + MAX_FREE_TRACKER_PICKS, `Deselect one to swap in another — you can always change these later in Settings.`);
        return prev;
      }
      const next = isSelected ? prev.filter(k => k !== key) : [...prev, key];
      setFreeTrackerPicks(next);
      return next;
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

  // Advances to the next step, unless the user is editing from the Review
  // screen — in that case, return them to Review instead of stepping forward.
  function goNext() {
    if (editFromReview) {
      setEditFromReview(false);
      setStepIndex(TOTAL_STEPS - 1);
    } else {
      setStepIndex(i => i + 1);
    }
  }

  function advance(eventName: 'onboarding_step_completed' | 'onboarding_step_skipped') {
    track(eventName, { step: stepIndex, step_name: STEP_NAMES[stepIndex] });
    goNext();
  }

  function handleNext() {
    advance('onboarding_step_completed');
  }

  function handleSkip() {
    if (isTrackersStep) {
      setTrackerPicks([]);
      setFreeTrackerPicks([]);
    } else {
      setSelections(prev => {
        const next = [...prev];
        next[stepIndex - 1] = [];
        return next;
      });
    }
    advance('onboarding_step_skipped');
  }

  function handleBack() {
    if (stepIndex === 4) {
      // Leaving Patches backward — clear its selections since the recommended
      // set is recomputed from Role/Feeding/Topics and may no longer match.
      setSelections(prev => prev.map((s, i) => i === 3 ? [] : s));
    }
    setStepIndex(i => i - 1);
  }

  function handleEditFromReview(targetStep: number) {
    setEditFromReview(true);
    setStepIndex(targetStep);
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
      const parsedDueDate = (isExpecting && babyDOB.trim()) ? parseDateInput(babyDOB) : null;

      if (babyId) {
        // User went back and is re-confirming — update the existing record
        await supabase.from('babies').update({
          name: babyName.trim(),
          birth_date: parsedDOB,
          due_date: parsedDueDate,
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
            due_date: parsedDueDate,
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

      advance('onboarding_step_completed');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save baby profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    setSaving(true);
    const [roleSelection, feedingMethods, helpfulTopics, villages] = selections;
    const preferredTerm = roleSelection[0] === CUSTOM_TERM_ID
      ? (customRoleText.trim() || 'Parent')
      : roleSelection[0];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            onboarding_complete: true,
            ...(roleSelection.length > 0 ? { preferred_term: preferredTerm } : {}),
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

    track('onboarding_completed', {});
    if (userId) await AsyncStorage.removeItem(progressKey(userId));
    await markOnboardingComplete();
    setSaving(false);
  }

  const canContinue = useMemo(() => {
    if (stepIndex === 0) return babyName.trim().length > 0 && (isExpecting || babyDOB.trim().length > 0);
    if (stepIndex === 1) return selections[0].length > 0;
    return true;
  }, [stepIndex, babyName, babyDOB, isExpecting, selections]);

  const isNextDisabled = saving || !canContinue;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.inner}>
        <ProgressDots current={stepIndex} total={TOTAL_STEPS} onDotPress={idx => setStepIndex(idx)} c={c} />

        <Text style={styles.title}>{headerTitle}</Text>
        <Text style={styles.subtitle}>{headerSubtitle}</Text>
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
            <Text style={styles.timeEstimate}>
              ⏱ Takes about 2 minutes • {TOTAL_STEPS} quick steps
            </Text>

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
              accessibilityLabel="Baby's name"
            />

            {/* Expecting toggle */}
            <View style={styles.expectingRow}>
              <Text style={styles.fieldLabel}>Not born yet / expecting</Text>
              <TouchableOpacity
                style={[styles.togglePill, isExpecting && styles.togglePillOn]}
                onPress={() => setIsExpecting(v => !v)}
                accessibilityRole="switch"
                accessibilityLabel="Not born yet / expecting"
                accessibilityState={{ checked: isExpecting }}
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
              accessibilityLabel={isExpecting ? 'Due date' : "Date of birth"}
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
      ) : isTrackersStep ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.trackerPickCount}>
            {trackerPicks.length} / {MAX_FREE_TRACKER_PICKS} selected
          </Text>
          {PREMIUM_TRACKERS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.trackerCard, trackerPicks.includes(t.key) && { borderColor: accent, backgroundColor: accent + '14' }]}
              onPress={() => toggleTracker(t.key)}
              activeOpacity={0.75}
              accessibilityRole="button" accessibilityLabel={t.label}
            >
              <Text style={styles.trackerCardEmoji}>{t.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.trackerCardLabel, trackerPicks.includes(t.key) && { color: c.textPrimary }]}>{t.label}</Text>
                <Text style={styles.trackerCardDesc}>{t.description}</Text>
              </View>
              <View style={[styles.trackerCardCheck, trackerPicks.includes(t.key) && { backgroundColor: accent, borderColor: accent }]}>
                {trackerPicks.includes(t.key) && <Text style={styles.trackerCardCheckmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          ))}
          <View style={styles.scrollPad} />
        </ScrollView>
      ) : isPartnerStep ? (
        <PartnerInviteStep
          userId={userId}
          onNext={() => advance('onboarding_step_completed')}
          onSkip={() => advance('onboarding_step_skipped')}
          styles={styles}
          c={c}
        />
      ) : isReviewStep ? (
        <ReviewStep
          babyName={babyName}
          babyDOB={babyDOB}
          isExpecting={isExpecting}
          role={selections[0]}
          feeding={selections[1]}
          topics={selections[2]}
          patches={selections[3]}
          trackerPicks={trackerPicks}
          customRoleText={customRoleText}
          onEdit={handleEditFromReview}
          styles={styles}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isFeedingStep && babyAgeMonths < 4 && (
            <Text style={styles.ageNote}>
              💡 Most pediatricians recommend waiting until 4-6 months to introduce solid foods. Always consult your pediatrician first.
            </Text>
          )}
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
          {isRoleStep && selections[0].includes(CUSTOM_TERM_ID) && (
            <TextInput
              style={styles.textInput}
              placeholder="What should we call you?"
              placeholderTextColor={c.textMuted}
              value={customRoleText}
              onChangeText={setCustomRoleText}
              autoCapitalize="words"
            />
          )}
          <View style={styles.scrollPad} />
        </ScrollView>
      )}

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {stepIndex > 0 && (
            <TouchableOpacity onPress={handleBack} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel="Back">
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
          )}
          {isOptionalStep(stepIndex) && (
            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}
              accessibilityRole="button" accessibilityLabel="Skip for now">
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </View>

        {!isPartnerStep && (
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: accent }, isNextDisabled && styles.nextBtnOff]}
            onPress={isBabyStep ? saveBabyAndContinue : isReviewStep ? handleComplete : handleNext}
            disabled={isNextDisabled}
            accessibilityRole="button"
            accessibilityLabel={canContinue ? 'Continue to next step' : 'Complete required fields to continue'}
            accessibilityState={{ disabled: isNextDisabled, busy: saving }}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.nextBtnText}>
                {isReviewStep ? "Finish — Let's Go! 🎉" : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
        )}
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
    footerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textMuted,
    },
    skipButton: {
      marginLeft: 16,
    },
    skipText: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '500',
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

    // ── Baby step: time estimate
    timeEstimate: {
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
      marginBottom: 20,
      fontWeight: '500',
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

    // ── Feeding step: age note
    ageNote: {
      fontSize: 13,
      color: c.textMuted,
      backgroundColor: c.cardHoney,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
      lineHeight: 19,
    },

    // ── Review step
    // ── Free trackers step
    trackerPickCount: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      marginBottom: 12,
    },
    trackerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    trackerCardEmoji: {
      fontSize: 22,
      marginRight: 14,
    },
    trackerCardLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textMuted,
      marginBottom: 2,
    },
    trackerCardDesc: {
      fontSize: 12,
      color: c.textMuted,
    },
    trackerCardCheck: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.inputBorder,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 10,
    },
    trackerCardCheckmark: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '800',
      lineHeight: 16,
    },

    reviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      paddingVertical: 16,
      paddingHorizontal: 18,
      marginBottom: 10,
    },
    reviewRowText: {
      flex: 1,
    },
    reviewLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      marginBottom: 4,
    },
    reviewValue: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textPrimary,
    },
    reviewEdit: {
      fontSize: 14,
      fontWeight: '700',
      color: c.primary,
      marginLeft: 12,
    },
    reviewFooter: {
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: 12,
      marginBottom: 8,
    },

    // ── Partner invite step
    inviteMethodRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
    },
    methodChip: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      alignItems: 'center',
    },
    methodChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    linkBox: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 20,
    },
    linkBoxText: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '500',
    },
    skipLarge: {
      alignItems: 'center',
      paddingVertical: 16,
      marginTop: 12,
    },
    skipLargeText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textMuted,
    },
    inviteFooter: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: 16,
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
