// Tummy Time tracker: logging + the "it's been N days" predictive nudge.
// A plain module, matching every other lib/*.ts tracker helper (see
// activitiesUtil.ts, relationshipUtil.ts).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { safeInsert } from './syncService';
import { deliverCategorizedNotification } from './notificationService';

export interface TummyTimeLog {
  id: string;
  baby_id: string;
  started_at: string;
  duration_minutes: number;
  notes: string | null;
}

export async function logTummyTime(
  babyId: string,
  userId: string,
  durationMinutes: number,
  startedAt: Date = new Date(),
  notes?: string,
): Promise<void> {
  await safeInsert('tummy_time_logs', {
    baby_id: babyId,
    logged_by: userId,
    started_at: startedAt.toISOString(),
    duration_minutes: durationMinutes,
    ...(notes?.trim() ? { notes: notes.trim() } : {}),
  });
}

// Sum of today's sessions (local calendar day) plus the most recent session,
// used together by TummyTimeCard for the "Xm today · last Yh ago" summary.
export async function getTummyTimeSummary(babyId: string): Promise<{
  todayMinutes: number;
  todaySessions: number;
  lastSession: TummyTimeLog | null;
}> {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);

  const [{ data: todayRows }, { data: lastRows }] = await Promise.all([
    supabase
      .from('tummy_time_logs')
      .select('id, baby_id, started_at, duration_minutes, notes')
      .eq('baby_id', babyId)
      .gte('started_at', dayStart.toISOString()),
    supabase
      .from('tummy_time_logs')
      .select('id, baby_id, started_at, duration_minutes, notes')
      .eq('baby_id', babyId)
      .order('started_at', { ascending: false })
      .limit(1),
  ]);

  const today = (todayRows ?? []) as TummyTimeLog[];
  return {
    todayMinutes: today.reduce((sum, r) => sum + r.duration_minutes, 0),
    todaySessions: today.length,
    lastSession: ((lastRows ?? [])[0] as TummyTimeLog | undefined) ?? null,
  };
}

export async function getDaysSinceLastSession(babyId: string): Promise<number | null> {
  const { data } = await supabase
    .from('tummy_time_logs')
    .select('started_at')
    .eq('baby_id', babyId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const diffMs = Date.now() - new Date((data as any).started_at).getTime();
  return Math.floor(diffMs / 86_400_000);
}

// ─── Predictive nudge ──────────────────────────────────────────────────────────

const REMIND_AFTER_DAYS = 5;

function lastCheckedKey(babyId: string) {
  return `tummy_time_reminder_checked_${babyId}`;
}

// Pattern matching, not ML: if it's been REMIND_AFTER_DAYS+ since the last
// logged session (or none ever logged for a baby old enough to do it),
// suggest a session — at most once per day, and gated by the smart
// notification preferences (category 'insights') so quiet hours/DND/baby-
// asleep are respected like every other notification in the app.
export async function checkTummyTimeReminder(
  userId: string,
  babyId: string,
  babyName: string,
): Promise<void> {
  const today = new Date().toDateString();
  const lastChecked = await AsyncStorage.getItem(lastCheckedKey(babyId));
  if (lastChecked === today) return;

  const daysSince = await getDaysSinceLastSession(babyId);
  const stale = daysSince === null || daysSince >= REMIND_AFTER_DAYS;
  await AsyncStorage.setItem(lastCheckedKey(babyId), today);
  if (!stale) return;

  const body = daysSince === null
    ? `Try a 5-minute tummy time session with ${babyName} today.`
    : `It's been ${daysSince} days since ${babyName}'s last tummy time → 5-minute session?`;

  await deliverCategorizedNotification({
    userId,
    category: 'insights',
    babyId,
    title: 'Tummy time check-in',
    body,
    identifier: `tummy-time-reminder-${babyId}`,
  });
}
