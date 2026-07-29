import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ensureNotificationPermission } from './notifications';
import { adjustForQuietHours } from './reminderUtils';

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface VaccineReminderSettings {
  enabled: boolean;
  quietStart: number | null;
  quietEnd: number | null;
}

const DEFAULT_SETTINGS: VaccineReminderSettings = { enabled: false, quietStart: null, quietEnd: null };

function settingsKey(userId: string, babyId: string) {
  return `vaccine_reminders_${userId}_${babyId}`;
}

export async function getVaccineReminderSettings(
  userId: string,
  babyId: string,
): Promise<VaccineReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(settingsKey(userId, babyId));
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveVaccineReminderSettings(
  userId: string,
  babyId: string,
  settings: VaccineReminderSettings,
): Promise<void> {
  await AsyncStorage.setItem(settingsKey(userId, babyId), JSON.stringify(settings));
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

interface ScheduleItem {
  key: string;
  name: string;
  dose: string;
  ageMonths: number;
}

interface RecordLike {
  vaccine_key: string;
  given_date: string | null;
}

function notifId(babyId: string, vaccineKey: string) {
  return `vaccine-${babyId}-${vaccineKey}`;
}

function addMonths(dateStr: string, months: number): Date {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d;
}

// A due/overdue vaccine's "natural" fire time has already passed — nudge at the
// next reasonable morning hour instead of firing immediately or silently skipping.
function nextNineAM(from: Date): Date {
  const d = new Date(from);
  d.setHours(9, 0, 0, 0);
  if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

// Cancels/reschedules one notification per not-yet-given vaccine in `schedule`.
// Given vaccines have their reminder cancelled. Safe to call after every load —
// each notification is identified per baby+vaccine so this never disturbs other
// reminder features (diaper, car check, etc).
export async function rescheduleVaccineReminders(
  babyId: string,
  birthDate: string | null,
  records: RecordLike[],
  schedule: readonly ScheduleItem[],
  settings: VaccineReminderSettings,
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!birthDate) return;

  if (!settings.enabled) {
    for (const v of schedule) {
      await Notifications.cancelScheduledNotificationAsync(notifId(babyId, v.key)).catch(() => {});
    }
    return;
  }

  const ok = await ensureNotificationPermission();
  if (!ok) return;

  const givenKeys = new Set(records.filter(r => r.given_date).map(r => r.vaccine_key));
  const now = new Date();

  for (const v of schedule) {
    const identifier = notifId(babyId, v.key);
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

    if (givenKeys.has(v.key)) continue;

    let fireAt = addMonths(birthDate, v.ageMonths);
    if (fireAt.getTime() <= now.getTime()) fireAt = nextNineAM(now);
    if (settings.quietStart != null && settings.quietEnd != null) {
      fireAt = adjustForQuietHours(fireAt, settings.quietStart, settings.quietEnd);
    }

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `${v.name} due`,
        body: `${v.dose} is due on your baby's vaccine schedule.`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  }
}
