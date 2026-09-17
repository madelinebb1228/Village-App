import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useColors, Colors } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';
import { hitSlopFor } from '../lib/accessibility';
import { screenView } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { useBaby } from '../lib/babyContext';
import { useSubscription, MAX_FREE_TRACKER_PICKS } from '../lib/subscriptionContext';
import {
  TRACKER_CATALOG, TrackerCatalogEntry, BABY_CATEGORY_ORDER, YOU_CATEGORY_ORDER, CATEGORY_ICON,
} from '../lib/trackerCatalog';

import MilestoneTracker from './MilestoneTracker';
import ActivityTracker from './ActivityTracker';
import VaccineTracker from './VaccineTracker';
import GrowthTracker from './GrowthTracker';
import AllergenTracker from './AllergenTracker';
import HealthTracker from './HealthTracker';
import SleepTracker from './SleepTracker';
import BabyJournal from './BabyJournal';
import BabyFoodChart from './BabyFoodChart';
import BabyFoodTracker from './BabyFoodTracker';
import NutritionTracker from './NutritionTracker';
import PostpartumMentalHealthTracker from './PostpartumMentalHealthTracker';
import MoodEnergyTracker from './MoodEnergyTracker';
import MomSleepTracker from './MomSleepTracker';
import MedTracker from './MedTracker';
import ExpenseTracker from './ExpenseTracker';
import KudosTracker from './KudosTracker';
import UsTimeTracker from './UsTimeTracker';
import PostpartumRecoveryTracker from './PostpartumRecoveryTracker';
import PeriodReturnTracker from './PeriodReturnTracker';
import MovementTracker from './MovementTracker';
import KickCounterTracker from './KickCounterTracker';
import ContractionTimerTracker from './ContractionTimerTracker';
import PregnancyLogTracker from './PregnancyLogTracker';

interface Props {
  route?: any;
  navigation?: any;
}

export default function MoreTrackersScreen({ route, navigation }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { isSubscribed, freeTrackerPicks, setFreeTrackerPicks, openPaywall } = useSubscription();
  const { activeBaby } = useBaby();

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openTrackerId, setOpenTrackerId] = useState<string | null>(route?.params?.openTracker ?? null);
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);

  useEffect(() => { screenView('MoreTrackers'); }, []);

  // This screen stays mounted as a tab-navigator route, so re-navigating to
  // it with a new openTracker param (e.g. tapping a different "Your Trackers"
  // card on Track) doesn't remount it — only re-render with new route.params.
  // Re-sync local state to that param whenever it changes.
  useEffect(() => {
    setOpenTrackerId(route?.params?.openTracker ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      setUserName(user.user_metadata?.name ?? user.email?.split('@')[0] ?? null);
    });
  }, []);

  const babyId = activeBaby?.id ?? null;
  const babyName = activeBaby?.name ?? null;
  const babyBirthDate = activeBaby?.birth_date ?? null;
  const babyGender = activeBaby?.gender ?? null;
  const babyWeightLbs = activeBaby?.current_weight ?? null;

  function isAccessible(entry: TrackerCatalogEntry): boolean {
    return entry.access === 'free' || isSubscribed || freeTrackerPicks.includes(entry.id);
  }

  function goBack() {
    const origin = route?.params?.origin;
    if (origin) navigation?.navigate?.(origin);
    else navigation?.goBack?.();
  }

  function handlePress(entry: TrackerCatalogEntry) {
    if (isAccessible(entry)) {
      setOpenTrackerId(entry.id);
      return;
    }
    // Premium, not yet selected, not subscribed.
    if (freeTrackerPicks.length < MAX_FREE_TRACKER_PICKS) {
      const doChoose = () => setFreeTrackerPicks([...freeTrackerPicks, entry.id]);
      const message = `Add ${entry.label} to your ${MAX_FREE_TRACKER_PICKS} free tracker choices? You can change this anytime — your data is never lost.`;
      if (Platform.OS === 'web') {
        if (window.confirm(message)) doChoose();
      } else {
        Alert.alert('Choose this tracker?', message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add it', onPress: doChoose },
        ]);
      }
      return;
    }
    // All free picks used — offer to swap or upgrade.
    Alert.alert(
      `You've chosen ${MAX_FREE_TRACKER_PICKS} of ${MAX_FREE_TRACKER_PICKS}`,
      `Swap one of your current picks for ${entry.label}, or unlock every tracker with Parent Patch Premium.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Swap a Tracker', onPress: () => setSwapTargetId(entry.id) },
        { text: 'Upgrade', onPress: () => openPaywall('tracker_limit') },
      ],
    );
  }

  function performSwap(removeId: string) {
    if (!swapTargetId) return;
    const next = freeTrackerPicks.filter(id => id !== removeId).concat(swapTargetId);
    setFreeTrackerPicks(next);
    setSwapTargetId(null);
    setOpenTrackerId(swapTargetId);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TRACKER_CATALOG;
    return TRACKER_CATALOG.filter(t =>
      t.label.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    );
  }, [query]);

  // ─── Tracker detail view ───

  if (openTrackerId) {
    const entry = TRACKER_CATALOG.find(t => t.id === openTrackerId);
    return (
      <SafeAreaView style={s.container}>
        <View style={s.detailHeader}>
          <TouchableOpacity onPress={() => setOpenTrackerId(null)} hitSlop={hitSlopFor(24)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            accessibilityRole="button" accessibilityLabel="Back to More Trackers">
            <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
            <Text style={s.backArrow}>More Trackers</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.detailScroll} keyboardShouldPersistTaps="handled">
          {renderTracker(openTrackerId, {
            userId, userName, babyId, babyName, babyBirthDate, babyGender, babyWeightLbs,
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={goBack} hitSlop={hitSlopFor(24)} style={{ width: 24 }}
          accessibilityRole="button" accessibilityLabel="Back to Track">
          <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>More Trackers</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search trackers"
          placeholderTextColor={c.textMuted}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Search trackers"
          returnKeyType="search"
        />
      </View>

      {isSubscribed ? (
        <View style={s.premiumBanner}>
          <Text style={s.premiumBannerText}>✨ Premium is active — every tracker below is unlocked.</Text>
        </View>
      ) : (
        <View style={s.freePicksBanner}>
          <Text style={s.freePicksBannerText}>
            You've chosen {freeTrackerPicks.length} of {MAX_FREE_TRACKER_PICKS} free tracker picks.
          </Text>
        </View>
      )}

      {swapTargetId && (
        <View style={s.swapCard}>
          <Text style={s.swapCardTitle}>Choose a tracker to remove</Text>
          <Text style={s.swapCardSubtitle}>to make room for {TRACKER_CATALOG.find(t => t.id === swapTargetId)?.label}</Text>
          {freeTrackerPicks.map(id => {
            const t = trackerLabel(id);
            return (
              <TouchableOpacity key={id} style={s.swapRow} onPress={() => performSwap(id)}
                hitSlop={hitSlopFor(34)}
                accessibilityRole="button" accessibilityLabel={`Remove ${t} to add the new tracker`}>
                <Text style={s.swapRowText}>{t}</Text>
                <Text style={s.swapRowAction}>Remove →</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={() => setSwapTargetId(null)} style={{ marginTop: 8 }}
            hitSlop={hitSlopFor(18)}
            accessibilityRole="button" accessibilityLabel="Cancel swap">
            <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {query.trim() ? (
          filtered.length === 0 ? (
            <Text style={s.emptyText}>No trackers match "{query}"</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {filtered.map(entry => (
                <TrackerRow key={entry.id} entry={entry} accessible={isAccessible(entry)} isSubscribed={isSubscribed}
                  selected={freeTrackerPicks.includes(entry.id)} onPress={() => handlePress(entry)} c={c} s={s} />
              ))}
            </View>
          )
        ) : (
          <>
            <Text style={s.sectionHeading}>👶 Baby</Text>
            {BABY_CATEGORY_ORDER.map(cat => (
              <CategoryGroup key={cat} category={cat} section="Baby" isSubscribed={isSubscribed}
                freeTrackerPicks={freeTrackerPicks} onPress={handlePress} isAccessible={isAccessible} c={c} s={s} />
            ))}

            <Text style={[s.sectionHeading, { marginTop: 8 }]}>🌷 You</Text>
            {YOU_CATEGORY_ORDER.map(cat => (
              <CategoryGroup key={cat} category={cat} section="You" isSubscribed={isSubscribed}
                freeTrackerPicks={freeTrackerPicks} onPress={handlePress} isAccessible={isAccessible} c={c} s={s} />
            ))}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function trackerLabel(id: string): string {
  return TRACKER_CATALOG.find(t => t.id === id)?.label ?? id;
}

function CategoryGroup({
  category, section, isSubscribed, freeTrackerPicks, onPress, isAccessible, c, s,
}: {
  category: string;
  section: 'Baby' | 'You';
  isSubscribed: boolean;
  freeTrackerPicks: string[];
  onPress: (entry: TrackerCatalogEntry) => void;
  isAccessible: (entry: TrackerCatalogEntry) => boolean;
  c: Colors;
  s: ReturnType<typeof makeStyles>;
}) {
  const entries = TRACKER_CATALOG.filter(t => t.section === section && t.category === category);
  if (entries.length === 0) return null;
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Ionicons name={CATEGORY_ICON[category] ?? 'list-outline'} size={15} color={c.textSecondary} />
        <Text style={[s.categoryHeading, { marginBottom: 0 }]}>{category}</Text>
      </View>
      <View style={{ gap: 10 }}>
        {entries.map(entry => (
          <TrackerRow key={entry.id} entry={entry} accessible={isAccessible(entry)} isSubscribed={isSubscribed}
            selected={freeTrackerPicks.includes(entry.id)} onPress={() => onPress(entry)} c={c} s={s} />
        ))}
      </View>
    </View>
  );
}

function TrackerRow({
  entry, accessible, isSubscribed, selected, onPress, c, s,
}: {
  entry: TrackerCatalogEntry;
  accessible: boolean;
  isSubscribed: boolean;
  selected: boolean;
  onPress: () => void;
  c: Colors;
  s: ReturnType<typeof makeStyles>;
}) {
  const badge = entry.access === 'free' ? 'Included'
    : isSubscribed ? 'Premium'
    : selected ? 'Selected'
    : 'Premium';
  const badgeStyle = entry.access === 'free' ? s.badgeIncluded
    : selected ? s.badgeSelected
    : accessible ? s.badgePremiumUnlocked
    : s.badgeLocked;
  const badgeTextStyle = entry.access === 'free' ? s.badgeTextIncluded
    : selected ? s.badgeTextSelected
    : accessible ? s.badgeTextPremiumUnlocked
    : s.badgeTextLocked;

  return (
    <TouchableOpacity
      style={[s.trackerRow, !accessible && s.trackerRowLocked]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${entry.label}${accessible ? '' : ', Premium'}. ${entry.description}`}
    >
      <View style={s.trackerIconWrap}>
        <Ionicons name={entry.icon} size={22} color={c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.trackerLabel}>{entry.label}</Text>
        <Text style={s.trackerDesc} numberOfLines={2}>{entry.description}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <View style={[s.badge, badgeStyle]}>
          <Text style={[s.badgeText, badgeTextStyle]}>{!accessible && entry.access === 'premium' ? '🔒 ' : ''}{badge}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Tracker mounting ───────────────────────────────────────────────────────
// Renders exactly the same component + props Track.tsx used to mount inline
// — no tracker's own implementation changes, only where it's displayed.

interface TrackerCtx {
  userId: string | null;
  userName: string | null;
  babyId: string | null;
  babyName: string | null;
  babyBirthDate: string | null;
  babyGender: string | null;
  babyWeightLbs: number | null;
}

function renderTracker(id: string, ctx: TrackerCtx): React.ReactNode {
  const { userId, userName, babyId, babyName, babyBirthDate, babyGender, babyWeightLbs } = ctx;
  switch (id) {
    case 'sleep_tracker': return <SleepTracker babyId={babyId} babyBirthDate={babyBirthDate} userId={userId} babyName={babyName} userName={userName} />;
    case 'milestone_tracker': return <MilestoneTracker userId={userId} babyBirthDate={babyBirthDate} />;
    case 'activity_tracker': return <ActivityTracker userId={userId} babyId={babyId} babyName={babyName} babyBirthDate={babyBirthDate} />;
    case 'baby_journal': return <BabyJournal userId={userId} babyId={babyId} babyName={babyName} />;
    case 'vaccines': return <VaccineTracker userId={userId} />;
    case 'baby_med_tracker': return <MedTracker type="baby" userId={userId} babyId={babyId} babyName={babyName} babyWeightLbs={babyWeightLbs} userName={userName} />;
    case 'growth_tracker': return <GrowthTracker userId={userId} babyId={babyId} babyBirthDate={babyBirthDate} babyGender={babyGender} />;
    case 'allergen_tracker': return <AllergenTracker userId={userId} babyId={babyId} babyBirthDate={babyBirthDate} />;
    case 'health_tracker': return <HealthTracker userId={userId} babyId={babyId} />;
    case 'baby_food_tracker': return <BabyFoodTracker userId={userId} babyId={babyId} babyName={babyName} babyBirthDate={babyBirthDate} />;
    case 'baby_food_chart': return <BabyFoodChart onBack={() => {}} babyId={babyId} />;
    case 'expense_tracker': return <ExpenseTracker userId={userId} babyId={babyId} babyName={babyName} />;
    case 'kick_counter': return <KickCounterTracker userId={userId} />;
    case 'contraction_timer': return <ContractionTimerTracker userId={userId} />;
    case 'pregnancy_log': return <PregnancyLogTracker userId={userId} />;
    case 'nutrition_tracker': return <NutritionTracker userId={userId} />;
    case 'meds_tracker': return <MedTracker type="parent" userId={userId} babyId={babyId} babyName={babyName} userName={userName} />;
    case 'postpartum_mental_health': return <PostpartumMentalHealthTracker userId={userId} onStatusChange={() => {}} />;
    case 'mood_energy_tracker': return <MoodEnergyTracker userId={userId} onSuggestCheckIn={() => {}} />;
    case 'mom_sleep_tracker': return <MomSleepTracker userId={userId} />;
    case 'postpartum_recovery': return <PostpartumRecoveryTracker userId={userId} babyBirthDate={babyBirthDate} />;
    case 'period_tracker': return <PeriodReturnTracker userId={userId} />;
    case 'movement_tracker': return <MovementTracker userId={userId} />;
    case 'kudos_tracker': return <KudosTracker userId={userId} />;
    case 'us_time_tracker': return <UsTimeTracker userId={userId} />;
    default: return null;
  }
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    backArrow: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
    title: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    detailHeader: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.separator },
    detailScroll: { padding: 20, paddingBottom: 40 },

    searchWrap: { paddingHorizontal: 20, marginBottom: 10 },
    searchInput: {
      backgroundColor: c.inputBg, borderWidth: 1.5, borderColor: c.inputBorder, borderRadius: 14,
      paddingHorizontal: 16, paddingVertical: 11, fontSize: 15, color: c.textPrimary,
    },

    premiumBanner: { marginHorizontal: 20, marginBottom: 12, backgroundColor: c.cardSage, borderRadius: 12, padding: 12 },
    premiumBannerText: { fontSize: 13, fontWeight: '700', color: c.sage },
    freePicksBanner: { marginHorizontal: 20, marginBottom: 12, backgroundColor: c.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.separator },
    freePicksBannerText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },

    swapCard: { marginHorizontal: 20, marginBottom: 14, backgroundColor: c.cardLavender, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: c.lavender },
    swapCardTitle: { fontSize: 14, fontWeight: '800', color: c.textPrimary },
    swapCardSubtitle: { fontSize: 12.5, color: c.textSecondary, marginBottom: 10, marginTop: 2 },
    swapRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.separator },
    swapRowText: { fontSize: 13.5, fontWeight: '600', color: c.textPrimary },
    swapRowAction: { fontSize: 12.5, fontWeight: '700', color: c.primary },

    scroll: { paddingHorizontal: 20, paddingBottom: 40 },
    sectionHeading: { fontSize: 18, fontWeight: '800', color: c.textPrimary, marginBottom: 10 },
    categoryHeading: { fontSize: 13.5, fontWeight: '700', color: c.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 },
    emptyText: { fontSize: 14, color: c.textMuted, textAlign: 'center', marginTop: 32 },

    trackerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.separator, padding: 14,
    },
    trackerRowLocked: { opacity: 0.85 },
    trackerIconWrap: { width: 30, alignItems: 'center' },
    trackerLabel: { fontSize: 14.5, fontWeight: '700', color: c.textPrimary },
    trackerDesc: { fontSize: 12.5, color: c.textMuted, marginTop: 2, lineHeight: 17 },

    badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    badgeIncluded: { backgroundColor: c.cardSage },
    badgeTextIncluded: { color: c.sage },
    badgeSelected: { backgroundColor: c.cardBlue },
    badgeTextSelected: { color: c.blue },
    badgePremiumUnlocked: { backgroundColor: c.cardHoney },
    badgeTextPremiumUnlocked: { color: c.honey },
    badgeLocked: { backgroundColor: c.cardSlate },
    badgeTextLocked: { color: c.textMuted },
  });
