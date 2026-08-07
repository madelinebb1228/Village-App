// Smart notification delivery: per-category preferences, quiet hours, and
// context-aware holds (do-not-disturb, baby currently asleep). This is the
// gatekeeper other reminder features (feed/diaper/vaccine/etc.) should call
// before firing a notification — it doesn't schedule notifications itself
// (see feedNotifications.ts, diaperNotifications.ts, notifications.ts for
// that), it decides whether one should go out right now.
//
// A plain module (not a class) to match every other lib/*.ts in this repo —
// see feedNotifications.ts, diaperNotifications.ts for the same shape.

import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { ensureNotificationPermission } from './notifications';
import { isWithinQuietHours } from './reminderUtils';
import { queueDigestItem } from './digestService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationCategory = 'critical' | 'reminders' | 'community' | 'insights' | 'marketing';
export type DeliveryMethod = 'push' | 'email' | 'sms' | 'in_app_only';

export interface CategoryPreference {
  category: NotificationCategory;
  enabled: boolean;
  delivery_method: DeliveryMethod;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
}

export interface NotificationSettings {
  do_not_disturb: boolean;
  digest_enabled: boolean;
  digest_time: string; // 'HH:MM', local device time
}

export type DeliveryHoldReason = 'category_disabled' | 'do_not_disturb' | 'quiet_hours' | 'baby_sleeping';

export interface DeliveryDecision {
  deliver: boolean;
  reason?: DeliveryHoldReason;
}

// ─── Category metadata ────────────────────────────────────────────────────────

export interface CategoryMeta {
  id: NotificationCategory;
  label: string;
  description: string;
  icon: string;
  bypassQuietHours: boolean; // critical always gets through
  defaultEnabled: boolean;
}

export const NOTIFICATION_CATEGORIES: CategoryMeta[] = [
  {
    id: 'critical',
    label: 'Critical Alerts',
    description: 'Medication reminders, vaccine due dates, safety alerts — always delivered',
    icon: '🚨',
    bypassQuietHours: true,
    defaultEnabled: true,
  },
  {
    id: 'reminders',
    label: 'Helpful Reminders',
    description: 'Feed/diaper check-ins, wake windows — respects quiet hours',
    icon: '⏰',
    bypassQuietHours: false,
    defaultEnabled: true,
  },
  {
    id: 'community',
    label: 'Community',
    description: 'Replies, direct messages, group activity',
    icon: '💬',
    bypassQuietHours: false,
    defaultEnabled: true,
  },
  {
    id: 'insights',
    label: 'Insights',
    description: 'Pattern detections, weekly summaries, milestone predictions',
    icon: '📊',
    bypassQuietHours: false,
    defaultEnabled: true,
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Product news and offers',
    icon: '📣',
    bypassQuietHours: false,
    defaultEnabled: false,
  },
];

const DEFAULT_SETTINGS: NotificationSettings = {
  do_not_disturb: false,
  digest_enabled: false,
  digest_time: '09:00',
};

function defaultPreference(category: NotificationCategory): CategoryPreference {
  const meta = NOTIFICATION_CATEGORIES.find(c => c.id === category)!;
  return {
    category,
    enabled: meta.defaultEnabled,
    delivery_method: 'push',
    quiet_hours_start: null,
    quiet_hours_end: null,
  };
}

// ─── Preferences: read + lazy-seed ────────────────────────────────────────────

export async function getPreferences(userId: string): Promise<Record<NotificationCategory, CategoryPreference>> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('category, enabled, delivery_method, quiet_hours_start, quiet_hours_end')
    .eq('user_id', userId);
  if (error) throw error;

  const byCategory = {} as Record<NotificationCategory, CategoryPreference>;
  for (const meta of NOTIFICATION_CATEGORIES) {
    byCategory[meta.id] = defaultPreference(meta.id);
  }
  for (const row of (data ?? []) as CategoryPreference[]) {
    byCategory[row.category] = row;
  }

  // Seed any categories the user has never touched (new account, or a
  // category added after they signed up) so future rows are explicit.
  const missing = NOTIFICATION_CATEGORIES.map(m => m.id).filter(
    id => !(data ?? []).some((r: any) => r.category === id),
  );
  if (missing.length > 0) {
    await (supabase.from('notification_preferences') as any).upsert(
      missing.map(category => ({ user_id: userId, ...defaultPreference(category) })),
      { onConflict: 'user_id,category', ignoreDuplicates: true },
    );
  }

  return byCategory;
}

export async function updatePreference(
  userId: string,
  category: NotificationCategory,
  patch: Partial<Pick<CategoryPreference, 'enabled' | 'delivery_method' | 'quiet_hours_start' | 'quiet_hours_end'>>,
): Promise<void> {
  const { error } = await (supabase.from('notification_preferences') as any)
    .upsert({ user_id: userId, ...defaultPreference(category), ...patch, category }, { onConflict: 'user_id,category' });
  if (error) throw error;
}

// ─── Settings: DND + digest ────────────────────────────────────────────────────

export async function getSettings(userId: string): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from('notification_settings')
    .select('do_not_disturb, digest_enabled, digest_time')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? (data as NotificationSettings) : DEFAULT_SETTINGS;
}

export async function updateSettings(userId: string, patch: Partial<NotificationSettings>): Promise<void> {
  const { error } = await (supabase.from('notification_settings') as any)
    .upsert({ user_id: userId, ...DEFAULT_SETTINGS, ...patch }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function setDoNotDisturb(userId: string, enabled: boolean): Promise<void> {
  await updateSettings(userId, { do_not_disturb: enabled });
}

// ─── Context checks ────────────────────────────────────────────────────────────

// True if the given baby has an open sleep session (a sleep_logs row with no end_time).
export async function isBabySleeping(babyId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('sleep_logs')
    .select('id')
    .eq('baby_id', babyId)
    .is('end_time', null)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[notificationService] isBabySleeping check failed:', error.message);
    return false;
  }
  return !!data;
}

// ─── The gate: should this notification go out right now? ─────────────────────

export interface ShouldDeliverParams {
  userId: string;
  category: NotificationCategory;
  babyId?: string | null; // when set, holds non-critical notifications while baby is asleep
  at?: Date; // defaults to now — override in tests
}

export async function shouldDeliver(params: ShouldDeliverParams): Promise<DeliveryDecision> {
  const { userId, category, babyId, at = new Date() } = params;
  const meta = NOTIFICATION_CATEGORIES.find(c => c.id === category)!;

  if (meta.bypassQuietHours) return { deliver: true };

  const [prefs, settings] = await Promise.all([getPreferences(userId), getSettings(userId)]);
  const pref = prefs[category];

  if (!pref.enabled) return { deliver: false, reason: 'category_disabled' };
  if (settings.do_not_disturb) return { deliver: false, reason: 'do_not_disturb' };

  if (pref.quiet_hours_start !== null && pref.quiet_hours_end !== null) {
    if (isWithinQuietHours(at, pref.quiet_hours_start, pref.quiet_hours_end)) {
      return { deliver: false, reason: 'quiet_hours' };
    }
  }

  if (babyId) {
    const asleep = await isBabySleeping(babyId);
    if (asleep) return { deliver: false, reason: 'baby_sleeping' };
  }

  return { deliver: true };
}

// ─── Delivery ───────────────────────────────────────────────────────────────────

export interface CategorizedNotification {
  userId: string;
  category: NotificationCategory;
  babyId?: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  identifier?: string;
}

async function logHistory(n: CategorizedNotification, decision: DeliveryDecision): Promise<void> {
  try {
    await (supabase.from('notification_history') as any).insert({
      user_id: n.userId,
      category: n.category,
      title: n.title,
      body: n.body,
      delivered: decision.deliver,
      hold_reason: decision.reason ?? null,
    });
  } catch (err: any) {
    console.warn('[notificationService] logHistory failed:', err?.message);
  }
}

const DIGEST_CATEGORIES: NotificationCategory[] = ['community', 'insights'];

// Checks shouldDeliver() and, if it passes, either presents the notification
// immediately or — when the user has digest batching on for a batchable
// category (community/insights) — queues it for the next daily summary
// instead. Every outcome (delivered, held, or batched) is logged to
// notification_history so "What did I miss?" has the full picture. Returns
// the hold reason when suppressed by a preference (not by digest batching).
export async function deliverCategorizedNotification(
  n: CategorizedNotification,
): Promise<DeliveryDecision> {
  const decision = await shouldDeliver({ userId: n.userId, category: n.category, babyId: n.babyId });
  await logHistory(n, decision);
  if (!decision.deliver) return decision;

  if (DIGEST_CATEGORIES.includes(n.category)) {
    const settings = await getSettings(n.userId);
    if (settings.digest_enabled) {
      await queueDigestItem(n.userId, n.category as 'community' | 'insights', n.title, n.body);
      return decision;
    }
  }

  const ok = await ensureNotificationPermission();
  if (!ok) return { deliver: false };

  await Notifications.scheduleNotificationAsync({
    identifier: n.identifier,
    content: { title: n.title, body: n.body, data: { category: n.category, ...n.data }, sound: true },
    trigger: null, // fire immediately
  });
  return decision;
}
