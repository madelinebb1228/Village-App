import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ensureNotificationPermission } from './notifications';
import { adjustForQuietHours } from './reminderUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiaperReminderSettings {
  enabled: boolean;
  intervalHours: number;        // 0 = as-needed (reminder off even if enabled)
  quietStart: number | null;    // hour 0-23, null = no quiet hours
  quietEnd: number | null;
}

const DEFAULT_SETTINGS: DiaperReminderSettings = {
  enabled: false,
  intervalHours: 3,
  quietStart: null,
  quietEnd: null,
};

// ─── Storage ──────────────────────────────────────────────────────────────────

function storageKey(userId: string, babyId: string) {
  return `diaper_reminder_${userId}_${babyId}`;
}

export async function getDiaperReminderSettings(
  userId: string,
  babyId: string,
): Promise<DiaperReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId, babyId));
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveDiaperReminderSettings(
  userId: string,
  babyId: string,
  settings: DiaperReminderSettings,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId, babyId), JSON.stringify(settings));
}

// ─── Notification message rotation ────────────────────────────────────────────

function buildMessage(babyName: string, intervalHours: number): { title: string; body: string } {
  const variants = [
    {
      title: `${babyName}'s diaper check`,
      body: `It's been ${intervalHours} hour${intervalHours !== 1 ? 's' : ''} since the last change — time for a quick check!`,
    },
    {
      title: `Patchy has a feeling… 🐻`,
      body: `Something might be brewing for ${babyName}. Time for a diaper check!`,
    },
    {
      title: `Diaper check for ${babyName} 💕`,
      body: `Just a heads up — it's been ${intervalHours}h since the last change.`,
    },
    {
      title: `Something smells suspicious 💩`,
      body: `It might be time for a fresh diaper for ${babyName}!`,
    },
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

// ─── Schedule / cancel ────────────────────────────────────────────────────────

const NOTIF_ID = (babyId: string) => `diaper-reminder-${babyId}`;

export async function cancelDiaperReminder(babyId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIF_ID(babyId)).catch(() => {});
}

export async function scheduleNextDiaperReminder(
  babyId: string,
  babyName: string,
  lastLoggedAt: Date,
  settings: DiaperReminderSettings,
): Promise<void> {
  await cancelDiaperReminder(babyId);

  if (!settings.enabled || !settings.intervalHours) return;

  const ok = await ensureNotificationPermission();
  if (!ok) return;

  let fireAt = new Date(lastLoggedAt.getTime() + settings.intervalHours * 3_600_000);

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
