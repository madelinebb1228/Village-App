import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Show the reminder banner even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface ReminderEvent {
  id: string;
  title: string;
  starts_at: string;            // ISO timestamp
  reminder_minutes: number | null; // null = none, 0 = at start, else minutes before
  location?: string | null;
}

// Ask for notification permission. Returns true if granted. No-op on web.
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (err) {
    console.warn('Notification permission check failed:', err);
    return false;
  }
}

function reminderBody(e: ReminderEvent): string {
  const when = new Date(e.starts_at).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return e.location ? `${when} · ${e.location}` : when;
}

// Cancel all previously-scheduled reminders, then schedule one for every
// upcoming event that has a reminder set. Called whenever the calendar's
// events change. On-device only (mobile) — no-op on web.
export async function rescheduleEventReminders(events: ReminderEvent[]): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = Date.now();
    for (const e of events) {
      if (e.reminder_minutes == null) continue;
      const start = new Date(e.starts_at).getTime();
      if (Number.isNaN(start)) continue;
      const fireAt = start - e.reminder_minutes * 60_000;
      if (fireAt <= now) continue; // skip reminders in the past

      await Notifications.scheduleNotificationAsync({
        content: {
          title: e.title || 'Upcoming event',
          body: reminderBody(e),
          data: { eventId: e.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(fireAt),
        } as any,
      });
    }
  } catch (err) {
    console.warn('Failed to reschedule reminders:', err);
  }
}
