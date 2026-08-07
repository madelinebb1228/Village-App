// Daily digest batching: holds community/insights notifications instead of
// firing them one at a time, and summarizes them into a single local
// notification at the user's preferred time (notification_settings.
// digest_time). Critical and reminders never batch — see
// notificationService.ts's deliverCategorizedNotification for that split.
//
// Local notifications can't run app code at the exact moment they fire in
// the background, so this can't reset the queue at the literal instant
// digest_time hits. Instead: every time an item is queued, the scheduled
// digest notification is rescheduled with a fresh summary (so its content is
// always current up to the last thing that happened); and the next time the
// app opens at or after digest_time, checkAndDeliverDueDigest "settles" the
// queue — marks the due items delivered and rolls the schedule to tomorrow.
// That's the same best-effort model the rest of this app's local reminders
// already use (see feedNotifications.ts, napSchedule.ts).

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { ensureNotificationPermission } from './notifications';

export type DigestCategory = 'community' | 'insights';

function digestNotifId(userId: string) {
  return `daily-digest-${userId}`;
}

function nextDigestFireDate(digestTime: string): Date {
  const [h, m] = digestTime.split(':').map(Number);
  const fireAt = new Date();
  fireAt.setHours(h, m, 0, 0);
  if (fireAt.getTime() <= Date.now()) fireAt.setDate(fireAt.getDate() + 1);
  return fireAt;
}

async function rescheduleDigestNotification(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const identifier = digestNotifId(userId);
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  const { data: settings } = await supabase
    .from('notification_settings')
    .select('digest_enabled, digest_time')
    .eq('user_id', userId)
    .maybeSingle();
  if (!settings || !(settings as any).digest_enabled) return;

  const { data: pending } = await supabase
    .from('notification_digest_queue')
    .select('title')
    .eq('user_id', userId)
    .eq('delivered', false);
  const items = pending ?? [];
  if (items.length === 0) return; // nothing to summarize yet — schedule once the first item queues

  const ok = await ensureNotificationPermission();
  if (!ok) return;

  const preview = items.slice(0, 3).map((i: any) => i.title).join(', ');
  const extra = items.length > 3 ? ` +${items.length - 3} more` : '';

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: `${items.length} thing${items.length === 1 ? '' : 's'} for you`,
      body: `${preview}${extra}`,
      sound: true,
      data: { category: 'digest' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextDigestFireDate((settings as any).digest_time || '09:00'),
    },
  });
}

// Adds an item to the queue and refreshes the scheduled digest notification
// so its summary reflects the current pending count.
export async function queueDigestItem(
  userId: string,
  category: DigestCategory,
  title: string,
  body: string,
): Promise<void> {
  await (supabase.from('notification_digest_queue') as any).insert({ user_id: userId, category, title, body });
  await rescheduleDigestNotification(userId).catch(() => {});
}

// Call on app open. If today's digest time has passed, marks the items that
// were queued before it as delivered (they're now visible in Notification
// History) and reschedules tomorrow's digest around whatever queues up next.
export async function checkAndDeliverDueDigest(userId: string): Promise<void> {
  try {
    const { data: settings } = await supabase
      .from('notification_settings')
      .select('digest_enabled, digest_time')
      .eq('user_id', userId)
      .maybeSingle();
    if (!settings || !(settings as any).digest_enabled) return;

    const [h, m] = ((settings as any).digest_time || '09:00').split(':').map(Number);
    const todayFireTime = new Date();
    todayFireTime.setHours(h, m, 0, 0);
    if (Date.now() < todayFireTime.getTime()) return; // not due yet today

    const { data: pending } = await supabase
      .from('notification_digest_queue')
      .select('id')
      .eq('user_id', userId)
      .eq('delivered', false)
      .lt('created_at', todayFireTime.toISOString());
    const ids = (pending ?? []).map((r: any) => r.id);
    if (ids.length === 0) return;

    await (supabase.from('notification_digest_queue') as any).update({ delivered: true }).in('id', ids);
    await rescheduleDigestNotification(userId);
  } catch (err: any) {
    console.warn('[digestService] checkAndDeliverDueDigest failed:', err?.message);
  }
}

export async function getPendingDigestCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('notification_digest_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('delivered', false);
  return count ?? 0;
}
