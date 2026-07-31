import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ensureNotificationPermission } from './notifications';
import { adjustForQuietHours } from './reminderUtils';

export interface NursingReminderSettings {
  enabled: boolean;
  intervalHours: number;
  quietStart: number | null;
  quietEnd: number | null;
}

const DEFAULT_SETTINGS: NursingReminderSettings = {
  enabled: false,
  intervalHours: 2,
  quietStart: null,
  quietEnd: null,
};

function storageKey(userId: string, babyId: string) {
  return `nursing_reminder_${userId}_${babyId}`;
}

export async function getNursingReminderSettings(
  userId: string,
  babyId: string,
): Promise<NursingReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId, babyId));
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveNursingReminderSettings(
  userId: string,
  babyId: string,
  settings: NursingReminderSettings,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId, babyId), JSON.stringify(settings));
}

function buildMessage(babyName: string, intervalHours: number): { title: string; body: string } {
  const variants = [
    {
      title: `Nursing time for ${babyName}? 🤱`,
      body: `It's been ${intervalHours} hour${intervalHours !== 1 ? 's' : ''} — check if they're ready to nurse!`,
    },
    {
      title: `Time to nurse ${babyName}`,
      body: `${intervalHours}h has passed since the last nursing session. You know your baby best!`,
    },
    {
      title: `Nursing check-in 💕`,
      body: `${babyName} may be ready to nurse again — ${intervalHours}h since the last session.`,
    },
    {
      title: `Patchy says it's nursing time 🐻`,
      body: `Just a gentle nudge — it's been ${intervalHours}h since ${babyName} last nursed.`,
    },
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

const NOTIF_ID = (babyId: string) => `nursing-reminder-${babyId}`;

export async function cancelNursingReminder(babyId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIF_ID(babyId)).catch(() => {});
}

export async function scheduleNextNursingReminder(
  babyId: string,
  babyName: string,
  lastNursedAt: Date,
  settings: NursingReminderSettings,
): Promise<void> {
  await cancelNursingReminder(babyId);
  if (!settings.enabled || !settings.intervalHours) return;
  const ok = await ensureNotificationPermission();
  if (!ok) return;

  let fireAt = new Date(lastNursedAt.getTime() + settings.intervalHours * 3_600_000);
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
