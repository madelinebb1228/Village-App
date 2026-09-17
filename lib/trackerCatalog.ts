// Canonical registry of every tracker in Parent Patch — combines the
// always-free set (never gated) with the existing PREMIUM_TRACKERS list, and
// adds the category metadata Track.tsx's own filter chips already use
// (BABY_NAV_GROUPS / YOU_NAV_GROUPS / PREGNANCY_NAV_GROUP), so MoreTrackers
// organizes trackers the same way the app already does — nothing invented.
//
// `id` for premium entries matches the exact `feature` key already passed to
// PaywallGate in Track.tsx (and therefore also what's stored in
// useSubscription().freeTrackerPicks). Free entries get a stable id of their
// own since they were never gated and never had one.

import { Ionicons } from '@expo/vector-icons';
import { PREMIUM_TRACKERS } from './premiumTrackers';

export type TrackerSection = 'Baby' | 'You';
export type IoniconName = keyof typeof Ionicons.glyphMap;

export interface TrackerCatalogEntry {
  id: string;
  label: string;
  description: string;
  /** @deprecated UI chrome now renders `icon` (an Ionicon) instead — kept only for any remaining non-UI/data uses. */
  emoji: string;
  icon: IoniconName;
  access: 'free' | 'premium';
  section: TrackerSection;
  category: string;
}

const ALWAYS_FREE_TRACKERS: TrackerCatalogEntry[] = [
  { id: 'baby_food_tracker', label: 'Baby Food Tracker', description: 'Log foods tried and how your baby reacted to each one.', emoji: '🥣', icon: 'restaurant-outline', access: 'free', section: 'Baby', category: 'Feeding' },
  { id: 'baby_food_chart', label: "What Can My Baby Eat?", description: 'Age-by-age reference guide for introducing new foods safely.', emoji: '📖', icon: 'book-outline', access: 'free', section: 'Baby', category: 'Feeding' },
  { id: 'milestone_tracker', label: 'Development Tracker', description: 'Track motor, language, and social milestones by age.', emoji: '🌱', icon: 'trending-up-outline', access: 'free', section: 'Baby', category: 'Sleep & Development' },
  { id: 'activity_tracker', label: 'Activities & Play', description: 'Age-appropriate activity ideas and a log of what you tried.', emoji: '🧩', icon: 'game-controller-outline', access: 'free', section: 'Baby', category: 'Sleep & Development' },
  { id: 'baby_med_tracker', label: 'Baby Medications', description: "Log your baby's medications and dosages.", emoji: '💊', icon: 'medical-outline', access: 'free', section: 'Baby', category: 'Health' },
  { id: 'allergen_tracker', label: 'Allergen Tracker', description: 'Track common allergens tried and any reactions.', emoji: '🥜', icon: 'warning-outline', access: 'free', section: 'Baby', category: 'Health' },
  { id: 'kick_counter', label: 'Kick Counter', description: "Time your baby's movements during pregnancy.", emoji: '👣', icon: 'footsteps-outline', access: 'free', section: 'You', category: 'Pregnancy' },
  { id: 'contraction_timer', label: 'Contraction Timer', description: 'Time contractions and their frequency.', emoji: '⏱️', icon: 'timer-outline', access: 'free', section: 'You', category: 'Pregnancy' },
  { id: 'postpartum_mental_health', label: 'Mental Health Check-in', description: 'A quick, private postpartum mood check-in.', emoji: '💭', icon: 'happy-outline', access: 'free', section: 'You', category: 'Wellness Check-ins' },
  { id: 'postpartum_recovery', label: 'Postpartum Recovery', description: 'Track physical recovery milestones after birth.', emoji: '🌸', icon: 'bandage-outline', access: 'free', section: 'You', category: 'Body & Recovery' },
];

// Icon for each PREMIUM_TRACKERS entry — kept alongside (not inside)
// premiumTrackers.ts so that file's `emoji` field can stay as-is for any
// other consumers while all UI chrome here reads from this map.
const PREMIUM_ICON: Record<string, IoniconName> = {
  sleep_tracker:        'moon-outline',
  growth_tracker:        'stats-chart-outline',
  health_tracker:        'pulse-outline',
  vaccines:              'shield-checkmark-outline',
  baby_journal:          'journal-outline',
  nutrition_tracker:     'water-outline',
  meds_tracker:          'medical-outline',
  mood_energy_tracker:   'flash-outline',
  mom_sleep_tracker:     'bed-outline',
  period_tracker:        'calendar-outline',
  movement_tracker:      'walk-outline',
  pregnancy_log:         'body-outline',
  expense_tracker:       'wallet-outline',
  kudos_tracker:         'heart-outline',
  us_time_tracker:       'people-outline',
};

// Maps each PREMIUM_TRACKERS key to where it lives in Track.tsx's existing
// category structure — same groups, not new ones.
const PREMIUM_CATEGORY: Record<string, { section: TrackerSection; category: string }> = {
  sleep_tracker:        { section: 'Baby', category: 'Sleep & Development' },
  baby_journal:         { section: 'Baby', category: 'Sleep & Development' },
  vaccines:             { section: 'Baby', category: 'Health' },
  growth_tracker:       { section: 'Baby', category: 'Health' },
  health_tracker:       { section: 'Baby', category: 'Health' },
  expense_tracker:      { section: 'Baby', category: 'Expenses' },
  pregnancy_log:        { section: 'You',  category: 'Pregnancy' },
  nutrition_tracker:    { section: 'You',  category: 'Daily Care' },
  meds_tracker:         { section: 'You',  category: 'Daily Care' },
  mood_energy_tracker:  { section: 'You',  category: 'Wellness Check-ins' },
  mom_sleep_tracker:    { section: 'You',  category: 'Wellness Check-ins' },
  period_tracker:       { section: 'You',  category: 'Body & Recovery' },
  movement_tracker:     { section: 'You',  category: 'Body & Recovery' },
  kudos_tracker:        { section: 'You',  category: 'Relationship' },
  us_time_tracker:      { section: 'You',  category: 'Relationship' },
};

const PREMIUM_ENTRIES: TrackerCatalogEntry[] = PREMIUM_TRACKERS.map(t => ({
  id: t.key,
  label: t.label,
  description: t.description,
  emoji: t.emoji,
  icon: PREMIUM_ICON[t.key] ?? 'sparkles-outline',
  access: 'premium' as const,
  section: PREMIUM_CATEGORY[t.key]?.section ?? 'Baby',
  category: PREMIUM_CATEGORY[t.key]?.category ?? 'Health',
}));

export const TRACKER_CATALOG: TrackerCatalogEntry[] = [...ALWAYS_FREE_TRACKERS, ...PREMIUM_ENTRIES];

export function trackerById(id: string): TrackerCatalogEntry | undefined {
  return TRACKER_CATALOG.find(t => t.id === id);
}

// Category display order within each section — mirrors Track.tsx's existing
// BABY_NAV_GROUPS / YOU_NAV_GROUPS ordering.
export const BABY_CATEGORY_ORDER = ['Feeding', 'Sleep & Development', 'Health', 'Expenses'];
export const YOU_CATEGORY_ORDER = ['Pregnancy', 'Daily Care', 'Wellness Check-ins', 'Body & Recovery', 'Relationship'];

export const CATEGORY_ICON: Record<string, IoniconName> = {
  'Feeding': 'restaurant-outline',
  'Sleep & Development': 'moon-outline',
  'Health': 'medical-outline',
  'Expenses': 'wallet-outline',
  'Pregnancy': 'body-outline',
  'Daily Care': 'water-outline',
  'Wellness Check-ins': 'happy-outline',
  'Body & Recovery': 'bandage-outline',
  'Relationship': 'heart-outline',
};

// A sensible, fixed "most useful first" default order for the compact "Your
// Trackers" grid on Track's landing — not a new preferences system, just a
// deliberate constant ordering (per-tracker favoriting/reordering is out of
// scope for this phase).
export const DEFAULT_TRACKER_ORDER = [
  'milestone_tracker', 'sleep_tracker', 'activity_tracker', 'growth_tracker',
  'baby_med_tracker', 'meds_tracker', 'vaccines', 'health_tracker', 'allergen_tracker',
  'baby_food_tracker', 'baby_food_chart', 'baby_journal', 'expense_tracker',
  'kick_counter', 'contraction_timer', 'pregnancy_log',
  'postpartum_mental_health', 'mood_energy_tracker', 'mom_sleep_tracker',
  'postpartum_recovery', 'period_tracker', 'movement_tracker', 'nutrition_tracker',
  'kudos_tracker', 'us_time_tracker',
];

export function sortByDefaultOrder(entries: TrackerCatalogEntry[]): TrackerCatalogEntry[] {
  return [...entries].sort((a, b) => {
    const ai = DEFAULT_TRACKER_ORDER.indexOf(a.id);
    const bi = DEFAULT_TRACKER_ORDER.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}
