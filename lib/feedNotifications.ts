import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ensureNotificationPermission } from './notifications';
import { adjustForQuietHours } from './reminderUtils';

export interface FeedReminderSettings {
  enabled: boolean;
  intervalHours: number;
  quietStart: number | null;
  quietEnd: number | null;
}

const DEFAULT_SETTINGS: FeedReminderSettings = {
  enabled: false,
  intervalHours: 3,
  quietStart: null,
  quietEnd: null,
};

function storageKey(userId: string, babyId: string) {
  return `feed_reminder_${userId}_${babyId}`;
}

export async function getFeedReminderSettings(
  userId: string,
  babyId: string,
): Promise<FeedReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId, babyId));
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveFeedReminderSettings(
  userId: string,
  babyId: string,
  settings: FeedReminderSettings,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId, babyId), JSON.stringify(settings));
}

function buildMessage(babyName: string, intervalHours: number): { title: string; body: string } {
  const variants = [
    {
      title: `Time to feed ${babyName}?`,
      body: `It's been ${intervalHours} hour${intervalHours !== 1 ? 's' : ''} since the last feed — check in if they're hungry!`,
    },
    {
      title: `Patchy's tummy is rumbling 🐻`,
      body: `${babyName} might be ready for another feed. You know best!`,
    },
    {
      title: `Feed check for ${babyName} 💕`,
      body: `Just a gentle nudge — ${intervalHours}h has passed since the last feed.`,
    },
    {
      title: `Hungry baby incoming? 🍼`,
      body: `${babyName}'s last feed was ${intervalHours}h ago. Time to check!`,
    },
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

const NOTIF_ID = (babyId: string) => `feed-reminder-${babyId}`;

export async function cancelFeedReminder(babyId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIF_ID(babyId)).catch(() => {});
}

export async function scheduleNextFeedReminder(
  babyId: string,
  babyName: string,
  lastFedAt: Date,
  settings: FeedReminderSettings,
): Promise<void> {
  await cancelFeedReminder(babyId);
  if (!settings.enabled || !settings.intervalHours) return;
  const ok = await ensureNotificationPermission();
  if (!ok) return;

  let fireAt = new Date(lastFedAt.getTime() + settings.intervalHours * 3_600_000);
  if (settings.quietStart !== null && settings.quietEnd !== null) {
    fireAt = adjustForQuietHours(fireAt, settings.quietStart, settings.quietEnd);
  }
  if (fireAt.getTime() <= Date.now()) return;

  const { title, body } = buildMessage(babyName, settings.intervalHours);
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_ID(babyId),
    content: { title, body, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
}
