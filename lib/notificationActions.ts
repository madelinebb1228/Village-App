// Interactive notification action buttons — "Log feeding" and "Start timer"
// from the original spec. Fully on-device: expo-notifications supports
// action buttons on local notifications without any push server, which is
// this app's whole notification model (see notificationService.ts's header
// comment). Register once at app startup (App.tsx).

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { safeInsert } from './syncService';
import { scheduleWakePredictionNow } from './napSchedule';
import { FEED_REMINDER_CATEGORY, NAP_WINDOW_CATEGORY } from './notificationCategoryIds';

const LOG_FEED_ACTION = 'LOG_FEED';
const START_TIMER_ACTION = 'START_TIMER';

// Must match BabyProvider's own key in babyContext.tsx so this resolves the
// same "currently active baby" the app itself would show.
function activeBabyStorageKey(userId: string) {
  return `active_baby_id_${userId}`;
}

export async function registerNotificationCategories(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setNotificationCategoryAsync(FEED_REMINDER_CATEGORY, [
      { identifier: LOG_FEED_ACTION, buttonTitle: 'Log feeding', options: { opensAppToForeground: false } },
    ]);
    await Notifications.setNotificationCategoryAsync(NAP_WINDOW_CATEGORY, [
      { identifier: START_TIMER_ACTION, buttonTitle: 'Start timer', options: { opensAppToForeground: false } },
    ]);
  } catch (err: any) {
    console.warn('[notificationActions] registerNotificationCategories failed:', err?.message);
  }
}

interface ActiveBaby {
  userId: string;
  babyId: string;
  babyName: string;
  birthDate: string | null;
}

async function resolveActiveBaby(): Promise<ActiveBaby | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const savedId = await AsyncStorage.getItem(activeBabyStorageKey(user.id));
  const pickBaby = async (id: string | null) => {
    const query = supabase.from('babies').select('id, name, birth_date');
    const { data } = id
      ? await query.eq('id', id).maybeSingle()
      : await query.eq('user_id', user.id).order('birth_date', { ascending: true }).limit(1).maybeSingle();
    return data as { id: string; name: string | null; birth_date: string | null } | null;
  };

  const baby = (savedId && await pickBaby(savedId)) || await pickBaby(null);
  if (!baby) return null;

  return { userId: user.id, babyId: baby.id, babyName: baby.name || 'Baby', birthDate: baby.birth_date };
}

// Minimal default log — a bottle feed logged right now, with no amount. The
// user can open the app afterward to fill in details; the point of a
// notification action is a zero-friction "yes, this happened" tap, not the
// full logging form.
async function handleLogFeedAction(): Promise<void> {
  const active = await resolveActiveBaby();
  if (!active) return;
  await safeInsert('feeds', {
    baby_id: active.babyId,
    feed_type: 'bottle',
    logged_at: new Date().toISOString(),
  });
}

async function handleStartTimerAction(): Promise<void> {
  const active = await resolveActiveBaby();
  if (!active) return;
  const napStart = new Date();
  await safeInsert('sleep_logs', {
    baby_id: active.babyId,
    sleep_type: 'nap',
    start_time: napStart.toISOString(),
  });
  await scheduleWakePredictionNow(active.babyId, active.babyName, active.birthDate, napStart);
}

let responseSubscription: { remove: () => void } | null = null;

export function registerNotificationResponseListener(): void {
  if (Platform.OS === 'web' || responseSubscription) return;
  responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
    const actionId = response.actionIdentifier;
    if (actionId === LOG_FEED_ACTION) {
      handleLogFeedAction().catch(err => console.warn('[notificationActions] log feed action failed:', err?.message));
    } else if (actionId === START_TIMER_ACTION) {
      handleStartTimerAction().catch(err => console.warn('[notificationActions] start timer action failed:', err?.message));
    }
  });
}
