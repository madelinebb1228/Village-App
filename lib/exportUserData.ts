import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';

// GDPR/data-portability export: a JSON dump of everything tied to the
// signed-in user across the app's tables. Tables with both a baby_id and a
// user/creator column are scoped by the latter (this user's own entries,
// even on a shared baby) rather than by baby, to match how account deletion
// scopes ownership. A few tracker tables (feeds, diaper_logs, sleep_logs)
// have no user column at all — those are scoped by the babies this user
// owns instead, since that's the only ownership signal the schema has.
async function fetchTable(table: string, column: string, value: string | string[]): Promise<any[]> {
  try {
    const query = Array.isArray(value)
      ? supabase.from(table as any).select('*').in(column, value)
      : supabase.from(table as any).select('*').eq(column, value);
    const { data, error } = await query;
    if (error) {
      console.warn(`Export: ${table} failed:`, error.message);
      return [];
    }
    return data ?? [];
  } catch (err: any) {
    console.warn(`Export: ${table} threw:`, err?.message);
    return [];
  }
}

export async function exportAndShareUserData(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const uid = user.id;

  const [profileRes, babiesRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    fetchTable('babies', 'user_id', uid),
  ]);
  const babies = babiesRes;
  const babyIds = babies.map((b: any) => b.id);

  const byUser = (table: string, column = 'user_id') => fetchTable(table, column, uid);
  const byOwnedBabies = (table: string) => (babyIds.length ? fetchTable(table, 'baby_id', babyIds) : Promise.resolve([]));

  const [
    // Baby tracking data this user logged
    feeds, diaperLogs, sleepLogs, growthLogs, babyFoodLogs, babyJournal,
    medicationLogs, medications, vaccineRecords, illnessEpisodes,
    milestones, milestonePhotos, pediatricAppointments, provider_shares,
    tummyTimeLogs, allergenRecords, baby_caregivers,
    // Mom health trackers
    momPeriodLogs, momPregnancyLogs, momMoodLogs, momMentalHealthChecks,
    momMovementLogs, momContractionLogs, momRecoveryLogs, momSleepLogs,
    // Household / logistics
    expenses, budgets, shoppingLists, calendarEvents, handoffNotes,
    patchTasks, supplyItems, pumpingSessions, milkStash, pumpParts,
    nutritionLogs, nutritionProfiles, nutritionSavedFoods,
    // Community content
    posts, comments, stories, directMessages, marketplaceListings,
    marketplaceMessages, qaQuestions, qaAnswers, qaReplies, recipes,
    savedPosts, savedRecipes,
    // Settings
    notificationPreferences, notificationSettings, userIntegrations,
  ] = await Promise.all([
    byOwnedBabies('feeds'), byOwnedBabies('diaper_logs'), byOwnedBabies('sleep_logs'),
    byUser('growth_logs'), byUser('baby_food_logs'), byUser('baby_journal'),
    byUser('medication_logs'), byUser('medications'), byUser('vaccine_records'), byUser('illness_episodes', 'created_by'),
    byUser('milestones'), byUser('milestone_photos'), byUser('pediatric_appointments'), byUser('provider_shares'),
    byUser('tummy_time_logs', 'logged_by'), byOwnedBabies('allergen_records'), byUser('baby_caregivers'),
    byUser('mom_period_logs'), byUser('mom_pregnancy_logs'), byUser('mom_mood_logs'), byUser('mom_mental_health_checks'),
    byUser('mom_movement_logs'), byUser('mom_contraction_logs'), byUser('mom_recovery_logs'), byUser('mom_sleep_logs'),
    byUser('expenses'), byUser('budgets'), byUser('shopping_lists'), byUser('calendar_events', 'created_by'), byUser('handoff_notes', 'author_id'),
    byUser('patch_tasks', 'creator_id'), byUser('supply_items'), byUser('pumping_sessions'), byUser('milk_stash'), byUser('pump_parts'),
    byUser('nutrition_logs'), byUser('nutrition_profiles'), byUser('nutrition_saved_foods'),
    byUser('posts'), byUser('comments'), byUser('stories'), byUser('direct_messages', 'sender_id'), byUser('marketplace_listings'),
    byUser('marketplace_messages', 'sender_id'), byUser('qa_questions'), byUser('qa_answers'), byUser('qa_replies'), byUser('recipes'),
    byUser('saved_posts'), byUser('saved_recipes'),
    byUser('notification_preferences'), byUser('notification_settings'), byUser('user_integrations'),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    account: { id: uid, email: user.email, createdAt: user.created_at },
    profile: profileRes.data ?? null,
    babies,
    babyTracking: {
      feeds, diaperLogs, sleepLogs, growthLogs, babyFoodLogs, babyJournal,
      medicationLogs, medications, vaccineRecords, illnessEpisodes,
      milestones, milestonePhotos, pediatricAppointments, providerShares: provider_shares,
      tummyTimeLogs, allergenRecords, babyCaregivers: baby_caregivers,
    },
    momHealthTrackers: {
      periodLogs: momPeriodLogs, pregnancyLogs: momPregnancyLogs, moodLogs: momMoodLogs,
      mentalHealthChecks: momMentalHealthChecks, movementLogs: momMovementLogs,
      contractionLogs: momContractionLogs, recoveryLogs: momRecoveryLogs, sleepLogs: momSleepLogs,
    },
    household: {
      expenses, budgets, shoppingLists, calendarEvents, handoffNotes,
      patchTasks, supplyItems, pumpingSessions, milkStash, pumpParts,
      nutritionLogs, nutritionProfiles, nutritionSavedFoods,
    },
    community: {
      posts, comments, stories, directMessages, marketplaceListings, marketplaceMessages,
      qaQuestions, qaAnswers, qaReplies, recipes, savedPosts, savedRecipes,
    },
    settings: { notificationPreferences, notificationSettings, userIntegrations },
  };

  const json = JSON.stringify(exportData, null, 2);
  const fileUri = `${FileSystem.cacheDirectory}parent-patch-export-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    try {
      await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Your Parent Patch Data' });
    } catch (err: any) {
      // The export itself (writing the file above) already succeeded — the share
      // sheet is just the delivery step, and the user closing it without picking
      // a target rejects with AbortError/"Share canceled". That's not a failure.
      const isCancel = err?.name === 'AbortError' || /cancel/i.test(err?.message ?? '');
      if (!isCancel) throw err;
    }
  }
}
