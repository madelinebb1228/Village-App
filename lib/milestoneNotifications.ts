import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ensureNotificationPermission } from './notifications';
import { adjustForQuietHours } from './reminderUtils';

// ─── Settings ─────────────────────────────────────────────────────────────────
// Milestone completions are keyed by user_id only (this app supports one baby
// per user today), so reminder settings follow the same scoping.

export interface MilestoneReminderSettings {
  enabled: boolean;
  quietStart: number | null;
  quietEnd: number | null;
}

const DEFAULT_SETTINGS: MilestoneReminderSettings = { enabled: false, quietStart: null, quietEnd: null };

function settingsKey(userId: string) {
  return `milestone_reminders_${userId}`;
}

export async function getMilestoneReminderSettings(userId: string): Promise<MilestoneReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(settingsKey(userId));
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveMilestoneReminderSettings(
  userId: string,
  settings: MilestoneReminderSettings,
): Promise<void> {
  await AsyncStorage.setItem(settingsKey(userId), JSON.stringify(settings));
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

interface MilestoneLike {
  key: string;
  label: string;
  emoji: string;
  ageWeeksMin?: number;
  ageWeeksMax?: number;
}

function notifId(userId: string, milestoneKey: string) {
  return `milestone-${userId}-${milestoneKey}`;
}

function addWeeks(date: Date, weeks: number): Date {
  return new Date(date.getTime() + weeks * 7 * 86_400_000);
}

function nextNineAM(from: Date): Date {
  const d = new Date(from);
  d.setHours(9, 0, 0, 0);
  if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

// One notification per not-yet-logged milestone with an age window, fired 2 weeks
// before the window opens (matching the "Coming up" UI cue). Milestones whose
// window has fully closed are left alone — that's normal variation, not urgent.
export async function rescheduleMilestoneReminders(
  userId: string,
  birthDate: string | null,
  entries: Record<string, unknown>,
  allMilestones: readonly MilestoneLike[],
  settings: MilestoneReminderSettings,
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!birthDate) return;

  const windowed = allMilestones.filter(m => m.ageWeeksMin != null && m.ageWeeksMax != null);

  if (!settings.enabled) {
    for (const m of windowed) {
      await Notifications.cancelScheduledNotificationAsync(notifId(userId, m.key)).catch(() => {});
    }
    return;
  }

  const ok = await ensureNotificationPermission();
  if (!ok) return;

  const birth = new Date(birthDate);
  const now = new Date();
  const ageWeeksNow = (now.getTime() - birth.getTime()) / (7 * 86_400_000);

  for (const m of windowed) {
    const identifier = notifId(userId, m.key);
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

    if (entries[m.key]) continue;               // already logged
    if (ageWeeksNow > m.ageWeeksMax!) continue;  // typical window fully passed — not urgent

    let fireAt = addWeeks(birth, m.ageWeeksMin! - 2);
    if (fireAt.getTime() <= now.getTime()) fireAt = nextNineAM(now);
    if (settings.quietStart != null && settings.quietEnd != null) {
      fireAt = adjustForQuietHours(fireAt, settings.quietStart, settings.quietEnd);
    }

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: 'Milestone coming up',
        body: `${m.emoji} ${m.label} is typical around now — tap to log it when it happens!`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  }
}
