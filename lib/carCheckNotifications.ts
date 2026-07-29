import * as Notifications from 'expo-notifications';
import { ensureNotificationPermission } from './notifications';
import { adjustForQuietHours } from './reminderUtils';

// One notification identifier per device — there's only ever one baby and one
// "active drive" concept in this app's current data model.
const NOTIF_ID = 'car-check-reminder';

// Direct, serious tone — unlike the diaper reminder's playful copy, this is a
// safety check and shouldn't read as a joke.
const MESSAGES = [
  (babyName: string) => `Did you get ${babyName} out of the car?`,
  (babyName: string) => `Quick check: is ${babyName} still in their car seat?`,
  (babyName: string) => `Before you walk away — is ${babyName} out of the car?`,
];

function buildMessage(babyName: string): { title: string; body: string } {
  const body = MESSAGES[Math.floor(Math.random() * MESSAGES.length)](babyName);
  return { title: 'Car check', body };
}

interface QuietHours {
  quietStart: number | null;
  quietEnd: number | null;
}

// Fires as soon as a drive-then-stop is confirmed — unless quiet hours are
// active, in which case it's deferred to quietEnd rather than dropped.
// Silently skipping a safety notification is worse than a late one.
export async function fireCarCheckNotification(
  babyName: string,
  quiet: QuietHours,
): Promise<void> {
  const ok = await ensureNotificationPermission();
  if (!ok) return;

  const { title, body } = buildMessage(babyName);

  await Notifications.cancelScheduledNotificationAsync(NOTIF_ID).catch(() => {});

  const now = new Date();
  const deferredAt =
    quiet.quietStart != null && quiet.quietEnd != null
      ? adjustForQuietHours(now, quiet.quietStart, quiet.quietEnd)
      : now;

  if (deferredAt.getTime() > now.getTime()) {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: { title, body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: deferredAt,
      },
    });
    return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_ID,
    content: { title, body, sound: true },
    trigger: null,
  });
}

// Phase 2 (snooze action) hook — kept here so the notification module owns all
// car-check notification content in one place. Not wired to a UI action yet.
export async function scheduleSnoozeReminder(babyName: string, minutes: number): Promise<void> {
  const ok = await ensureNotificationPermission();
  if (!ok) return;
  const { title, body } = buildMessage(babyName);
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_ID,
    content: { title, body, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + minutes * 60_000),
    },
  });
}
