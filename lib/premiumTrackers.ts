// Canonical list of trackers gated by PaywallGate with isTracker — kept in
// sync with the `feature` keys used in screens/Track.tsx. Used by the
// onboarding free-tracker picker so free users can unlock a few of these
// without subscribing.

export interface PremiumTrackerOption {
  key: string;
  label: string;
  description: string;
  emoji: string;
}

export const PREMIUM_TRACKERS: PremiumTrackerOption[] = [
  { key: 'sleep_tracker', label: 'Sleep Tracker', description: "Log and review your baby's naps and night sleep.", emoji: '🌙' },
  { key: 'growth_tracker', label: 'Growth Tracker', description: 'Track weight and height with WHO growth curve percentiles.', emoji: '📈' },
  { key: 'health_tracker', label: 'Health Tracker', description: 'Log fevers, symptoms, and illness episodes with medication given.', emoji: '🩺' },
  { key: 'vaccines', label: 'Vaccines & Appointments', description: "Track your baby's vaccine schedule and upcoming appointments.", emoji: '💉' },
  { key: 'baby_journal', label: 'Baby Journal', description: 'Write memories and notes to look back on someday.', emoji: '📓' },
  { key: 'nutrition_tracker', label: 'Nutrition & Hydration', description: 'Track your water intake, meals, and vitamins each day.', emoji: '💧' },
  { key: 'meds_tracker', label: 'Meds & Supplements', description: 'Log your own medications and supplements with dosage reminders.', emoji: '💊' },
  { key: 'mood_energy_tracker', label: 'Mood & Energy', description: 'Log your daily mood and energy levels to spot patterns over time.', emoji: '🌈' },
  { key: 'mom_sleep_tracker', label: 'Your Sleep', description: "Track how much sleep you're getting and how rested you feel.", emoji: '🌙' },
  { key: 'period_tracker', label: 'Period Return', description: 'Track the return of your menstrual cycle after birth.', emoji: '🩸' },
  { key: 'movement_tracker', label: 'Movement', description: 'Log exercise, walks, and physical activity during your recovery.', emoji: '🏃' },
  { key: 'pregnancy_log', label: 'Symptoms & Weight', description: 'Track weight and symptoms throughout your pregnancy.', emoji: '📝' },
];
