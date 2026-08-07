import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { ensureNotificationPermission } from './notifications';
import { ensureCalendar } from './calendarSync';
import { NAP_WINDOW_CATEGORY } from './notificationCategoryIds';

// ─── Age-based norms (moved here from SleepTracker.tsx so both the tracker's
// live awake-timer and this module's nap prediction share one definition) ────

export type WakeRange = { maxWeeks: number; label: string; minMin: number; maxMin: number };
export type AgeGoal    = { maxWeeks: number; minHours: number; maxHours: number; minNaps: number; maxNaps: number };

export const WAKE_RANGES: WakeRange[] = [
  { maxWeeks: 4,    label: 'Newborn (0–4 weeks)',  minMin: 45,  maxMin: 60  },
  { maxWeeks: 8,    label: '1–2 months',            minMin: 60,  maxMin: 90  },
  { maxWeeks: 12,   label: '2–3 months',            minMin: 75,  maxMin: 90  },
  { maxWeeks: 16,   label: '3–4 months',            minMin: 90,  maxMin: 120 },
  { maxWeeks: 20,   label: '4–5 months',            minMin: 90,  maxMin: 120 },
  { maxWeeks: 24,   label: '5–6 months',            minMin: 90,  maxMin: 150 },
  { maxWeeks: 36,   label: '6–9 months',            minMin: 120, maxMin: 180 },
  { maxWeeks: 52,   label: '9–12 months',           minMin: 150, maxMin: 210 },
  { maxWeeks: 78,   label: '12–18 months',          minMin: 180, maxMin: 300 },
  { maxWeeks: 104,  label: '18–24 months',          minMin: 240, maxMin: 360 },
  { maxWeeks: 9999, label: '2+ years',              minMin: 300, maxMin: 480 },
];

export const AGE_SLEEP_GOALS: AgeGoal[] = [
  { maxWeeks: 4,    minHours: 14, maxHours: 17, minNaps: 4, maxNaps: 5 },
  { maxWeeks: 12,   minHours: 14, maxHours: 17, minNaps: 3, maxNaps: 5 },
  { maxWeeks: 24,   minHours: 12, maxHours: 15, minNaps: 3, maxNaps: 4 },
  { maxWeeks: 36,   minHours: 12, maxHours: 14, minNaps: 2, maxNaps: 3 },
  { maxWeeks: 52,   minHours: 12, maxHours: 14, minNaps: 2, maxNaps: 3 },
  { maxWeeks: 78,   minHours: 11, maxHours: 14, minNaps: 1, maxNaps: 2 },
  { maxWeeks: 104,  minHours: 11, maxHours: 14, minNaps: 1, maxNaps: 1 },
  { maxWeeks: 9999, minHours: 10, maxHours: 13, minNaps: 0, maxNaps: 1 },
];

export function getRange(birthDate: string | null): WakeRange {
  if (!birthDate) return WAKE_RANGES[1];
  const ageWeeks = Math.floor((Date.now() - new Date(birthDate).getTime()) / (7 * 24 * 3600 * 1000));
  return WAKE_RANGES.find(r => ageWeeks < r.maxWeeks) ?? WAKE_RANGES[WAKE_RANGES.length - 1];
}

export function getSleepGoal(birthDate: string | null): AgeGoal {
  if (!birthDate) return AGE_SLEEP_GOALS[2];
  const ageWeeks = Math.floor((Date.now() - new Date(birthDate).getTime()) / (7 * 24 * 3600 * 1000));
  return AGE_SLEEP_GOALS.find(g => ageWeeks < g.maxWeeks) ?? AGE_SLEEP_GOALS[AGE_SLEEP_GOALS.length - 1];
}

// ─── Nap prediction ───────────────────────────────────────────────────────────

const NOISE_THRESHOLD_MIN = 10;   // ignore shifts smaller than this
const WIND_DOWN_BUFFER_MIN = 20;  // notify this long before the predicted nap
const WAKE_PREP_BUFFER_MIN = 20;  // notify this long before the predicted wake-up
const LOOKAHEAD_HOURS = 4;        // only protect commitments this far out
const MIN_NAP_SAMPLES = 3;        // history required before trusting real averages

type SleepLogRow = { sleep_type: 'nap' | 'night'; start_time: string; end_time: string | null };

async function getNapStats(babyId: string, birthDate: string | null): Promise<{ avgNapMinutes: number; avgAwakeMinutes: number }> {
  const fallbackRange = getRange(birthDate);
  const fallbackGoal = getSleepGoal(birthDate);
  const fallbackAwake = (fallbackRange.minMin + fallbackRange.maxMin) / 2;
  const avgNapsPerDay = (fallbackGoal.minNaps + fallbackGoal.maxNaps) / 2 || 1;
  const fallbackDailyNapHours = Math.max(fallbackGoal.minHours + fallbackGoal.maxHours, 0) / 2 * 0.4; // naps are ~40% of daily sleep once night sleep consolidates
  const fallbackNap = Math.round((fallbackDailyNapHours * 60) / avgNapsPerDay) || 45;

  try {
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from('sleep_logs')
      .select('sleep_type, start_time, end_time')
      .eq('baby_id', babyId)
      .gte('start_time', since)
      .not('end_time', 'is', null)
      .order('start_time', { ascending: true });

    const logs = (data ?? []) as SleepLogRow[];
    const naps = logs.filter(l => l.sleep_type === 'nap');

    // Guard against corrupted/forgotten-open sessions (e.g. a nap logged for
    // days) skewing the average — anything past a generous ceiling is
    // treated as bad data, not a real long nap.
    const MAX_PLAUSIBLE_NAP_MIN = 240;   // 4 hours
    const MAX_PLAUSIBLE_AWAKE_MIN = 720; // 12 hours

    const napDurations = naps
      .map(n => (new Date(n.end_time!).getTime() - new Date(n.start_time).getTime()) / 60000)
      .filter(mins => mins > 0 && mins <= MAX_PLAUSIBLE_NAP_MIN);
    const awakeGaps: number[] = [];
    for (let i = 1; i < logs.length; i++) {
      const gapMin = (new Date(logs[i].start_time).getTime() - new Date(logs[i - 1].end_time!).getTime()) / 60000;
      if (gapMin > 0 && gapMin < MAX_PLAUSIBLE_AWAKE_MIN) awakeGaps.push(gapMin);
    }

    const avgNapMinutes = napDurations.length >= MIN_NAP_SAMPLES
      ? Math.round(napDurations.reduce((a, b) => a + b, 0) / napDurations.length)
      : fallbackNap;
    const avgAwakeMinutes = awakeGaps.length >= MIN_NAP_SAMPLES
      ? Math.round(awakeGaps.reduce((a, b) => a + b, 0) / awakeGaps.length)
      : fallbackAwake;

    return { avgNapMinutes, avgAwakeMinutes };
  } catch {
    return { avgNapMinutes: fallbackNap, avgAwakeMinutes: fallbackAwake };
  }
}

function predictNextNapStart(lastWakeTime: Date, avgAwakeMinutes: number): Date {
  return new Date(lastWakeTime.getTime() + avgAwakeMinutes * 60000);
}

// ─── Whole-day nap projection ─────────────────────────────────────────────────

export interface NapWindow { start: Date; end: Date }

const DEFAULT_DAY_START_HOUR = 7; // assumed wake time if no naps logged yet that day
const MAX_PROJECTED_NAPS = 4;     // sane ceiling regardless of age-table nap count

function defaultDayStart(forDate: Date): Date {
  const d = new Date(forDate);
  d.setHours(DEFAULT_DAY_START_HOUR, 0, 0, 0);
  return d;
}

// Projects the day's expected nap windows by cycling avgAwakeMinutes/
// avgNapMinutes (real history if available, age-based fallback otherwise)
// for the age-appropriate nap count. Anchors off the baby's actual last wake
// time today if a sleep session has already been logged for `forDate`;
// otherwise assumes a default day-start wake time.
export async function predictDayNapWindows(
  babyId: string,
  birthDate: string | null,
  forDate: Date,
): Promise<NapWindow[]> {
  const { avgNapMinutes, avgAwakeMinutes } = await getNapStats(babyId, birthDate);
  const goal = getSleepGoal(birthDate);
  const napCount = Math.min(Math.round((goal.minNaps + goal.maxNaps) / 2), MAX_PROJECTED_NAPS);
  if (napCount <= 0) return [];

  let anchor: Date;
  try {
    const dayStart = new Date(forDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(forDate); dayEnd.setHours(23, 59, 59, 999);
    const { data: lastToday } = await supabase
      .from('sleep_logs')
      .select('end_time')
      .eq('baby_id', babyId)
      .gte('start_time', dayStart.toISOString())
      .lte('start_time', dayEnd.toISOString())
      .not('end_time', 'is', null)
      .order('end_time', { ascending: false })
      .limit(1)
      .maybeSingle();
    const endTime = (lastToday as { end_time: string } | null)?.end_time;
    anchor = endTime ? new Date(endTime) : defaultDayStart(forDate);
  } catch {
    anchor = defaultDayStart(forDate);
  }

  const windows: NapWindow[] = [];
  let cursor = anchor;
  for (let i = 0; i < napCount; i++) {
    const start = new Date(cursor.getTime() + avgAwakeMinutes * 60000);
    const end = new Date(start.getTime() + avgNapMinutes * 60000);
    windows.push({ start, end });
    cursor = end;
  }
  return windows;
}

// ─── Flexible-event shifting ──────────────────────────────────────────────────

// Shifts today's not-yet-started flexible personal-calendar events by
// deltaMinutes (positive = later, negative = earlier), uniformly and clamped
// so nothing moves earlier than right now. No collision-avoidance with fixed
// events in v1.
export async function shiftFlexibleEvents(userId: string, deltaMinutes: number): Promise<number> {
  if (Math.abs(deltaMinutes) < NOISE_THRESHOLD_MIN) return 0;
  const db: any = supabase;

  const calendarId = await ensureCalendar(userId, 'personal');

  const now = new Date();
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);

  const { data: events } = await db
    .from('calendar_events')
    .select('id, starts_at, ends_at')
    .eq('calendar_id', calendarId)
    .eq('is_flexible', true)
    .eq('is_scheduled', true)
    .gte('starts_at', now.toISOString())
    .lte('starts_at', endOfDay.toISOString());

  const list = events ?? [];
  if (list.length === 0) return 0;

  let shifted = 0;
  for (const e of list) {
    const newStart = new Date(new Date(e.starts_at).getTime() + deltaMinutes * 60000);
    if (newStart.getTime() < now.getTime()) continue; // never push a flexible event into the past
    const newEnd = e.ends_at ? new Date(new Date(e.ends_at).getTime() + deltaMinutes * 60000) : null;
    const { error } = await db
      .from('calendar_events')
      .update({ starts_at: newStart.toISOString(), ends_at: newEnd ? newEnd.toISOString() : null })
      .eq('id', e.id);
    if (!error) shifted++;
  }
  return shifted;
}

// Called right after a nap's actual duration is known. Compares it against
// the typical nap length and, if the difference is meaningful, shifts today's
// flexible events to absorb it (woke up early → push later; napped long →
// pull earlier).
export async function handleNapEnded(
  userId: string | null,
  babyId: string | null,
  birthDate: string | null,
  actualDurationMinutes: number,
): Promise<{ shiftedCount: number; deltaMinutes: number } | null> {
  if (!userId || !babyId) return null;
  const { avgNapMinutes } = await getNapStats(babyId, birthDate);
  const deltaMinutes = avgNapMinutes - actualDurationMinutes; // positive = ended early, negative = ran long
  if (Math.abs(deltaMinutes) < NOISE_THRESHOLD_MIN) return { shiftedCount: 0, deltaMinutes };
  const shiftedCount = await shiftFlexibleEvents(userId, deltaMinutes);
  return { shiftedCount, deltaMinutes };
}

// ─── Wind-down notification ───────────────────────────────────────────────────

function notifId(babyId: string) {
  return `nap-winddown-${babyId}`;
}

async function scheduleWindDownCore(
  userId: string,
  babyId: string,
  babyName: string,
  birthDate: string | null,
  lastWakeTime: Date,
): Promise<void> {
  const identifier = notifId(babyId);
  if (Platform.OS === 'web') return;

  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  const { avgAwakeMinutes } = await getNapStats(babyId, birthDate);
  const predictedNapStart = predictNextNapStart(lastWakeTime, avgAwakeMinutes);

  const db: any = supabase;
  const calendarId = await ensureCalendar(userId, 'personal');

  const lookaheadEnd = new Date(Date.now() + LOOKAHEAD_HOURS * 3600 * 1000);
  const { data: events } = await db
    .from('calendar_events')
    .select('title, starts_at')
    .eq('calendar_id', calendarId)
    .eq('is_flexible', false)
    .gte('starts_at', new Date().toISOString())
    .lte('starts_at', lookaheadEnd.toISOString())
    .order('starts_at', { ascending: true })
    .limit(1);

  // A conflicting fixed event soon gets the more urgent "wind down because
  // of X" message; otherwise still give a general heads-up for the
  // predicted nap window itself rather than staying silent.
  const nextFixed = (events ?? [])[0];
  const hasConflict = !!nextFixed && new Date(nextFixed.starts_at).getTime() > predictedNapStart.getTime();

  const fireAt = new Date(predictedNapStart.getTime() - WIND_DOWN_BUFFER_MIN * 60000);
  if (fireAt.getTime() <= Date.now()) return;

  const ok = await ensureNotificationPermission();
  if (!ok) return;

  const body = hasConflict
    ? (() => {
        const when = new Date(nextFixed.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        return `Start winding ${babyName} down — you have "${nextFixed.title}" at ${when}.`;
      })()
    : `${babyName}'s next nap window is opening up soon, based on their recent sleep pattern.`;

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: 'Nap window coming up',
      body,
      sound: true,
      categoryIdentifier: NAP_WINDOW_CATEGORY,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
}

// Direct entry point for SleepTracker, which already has the baby info in
// scope and knows lastWakeTime = "now".
export async function scheduleWindDownNow(
  userId: string | null,
  babyId: string | null,
  babyName: string | null,
  birthDate: string | null,
): Promise<void> {
  if (!userId || !babyId) return;
  await scheduleWindDownCore(userId, babyId, babyName || 'baby', birthDate, new Date()).catch(() => {});
}

// Convenience wrapper for callers that only have userId (e.g. SharedCalendar,
// after a personal-calendar edit) — looks up the baby and current sleep
// state itself.
export async function recomputeWindDown(userId: string | null): Promise<void> {
  if (!userId) return;
  const db: any = supabase;
  try {
    const { data: baby } = await db
      .from('babies')
      .select('id, name, birth_date')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (!baby) return;

    const { data: active } = await db
      .from('sleep_logs')
      .select('id')
      .eq('baby_id', baby.id)
      .is('end_time', null)
      .limit(1)
      .maybeSingle();
    if (active) {
      // Baby is currently asleep — a wind-down reminder isn't relevant yet.
      if (Platform.OS !== 'web') await Notifications.cancelScheduledNotificationAsync(notifId(baby.id)).catch(() => {});
      return;
    }

    const { data: lastSleep } = await db
      .from('sleep_logs')
      .select('end_time')
      .eq('baby_id', baby.id)
      .not('end_time', 'is', null)
      .order('end_time', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastWakeTime = lastSleep?.end_time ? new Date(lastSleep.end_time) : new Date();

    await scheduleWindDownCore(userId, baby.id, baby.name || 'baby', baby.birth_date, lastWakeTime);
  } catch {
    // best-effort — never block the calendar save/delete flow on this
  }
}

// ─── Wake prediction ("prep bottle?") notification ─────────────────────────────
// The reverse of wind-down: fires while a nap is IN PROGRESS, ~20 min before
// the baby is predicted to wake, using the same avgNapMinutes history. Only
// makes sense for daytime naps, not night sleep.

function wakeNotifId(babyId: string) {
  return `nap-wake-prediction-${babyId}`;
}

// Called right when a nap starts (SleepTracker.startSleep). Predicts the wake
// time from recent nap-duration history and schedules a heads-up before it.
export async function scheduleWakePredictionNow(
  babyId: string | null,
  babyName: string | null,
  birthDate: string | null,
  napStartTime: Date,
): Promise<void> {
  if (!babyId || Platform.OS === 'web') return;
  const identifier = wakeNotifId(babyId);
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  try {
    const { avgNapMinutes } = await getNapStats(babyId, birthDate);
    const predictedWake = new Date(napStartTime.getTime() + avgNapMinutes * 60000);
    const fireAt = new Date(predictedWake.getTime() - WAKE_PREP_BUFFER_MIN * 60000);
    if (fireAt.getTime() <= Date.now()) return; // nap already shorter than the buffer — nothing useful to schedule

    const ok = await ensureNotificationPermission();
    if (!ok) return;

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `${babyName || 'Baby'} might wake soon`,
        body: `Based on recent naps, ${babyName || 'baby'} may wake in ~${WAKE_PREP_BUFFER_MIN} min. Prep a bottle?`,
        sound: true,
        data: { category: 'insights' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  } catch {
    // best-effort — never block the sleep tracker's start-nap flow on this
  }
}

// Called when the nap ends (actual wake already happened) so the predicted
// notification doesn't fire late and redundant.
export async function cancelWakePrediction(babyId: string | null): Promise<void> {
  if (!babyId || Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(wakeNotifId(babyId)).catch(() => {});
}
