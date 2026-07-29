import { supabase } from './supabase';

export interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_log_date: string | null;
  freeze_count: number;
}

export interface RecordLogResult {
  newStreak: number;
  milestone: number | null;
  usedFreeze: boolean;
}

const MILESTONES = [3, 7, 14, 30, 60, 100];

export function getTodayDateStr(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local time
}

function daysDiff(newer: string, older: string): number {
  const a = new Date(newer + 'T12:00:00');
  const b = new Date(older + 'T12:00:00');
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

// current_streak in the DB is only recomputed when recordLog() runs (i.e. when
// something is actually logged) — it's a write-time cache, not a live value. If
// days have passed with no log since, the stored number is stale and would just
// sit there unchanged forever if displayed as-is. This derives the true streak
// as of today without writing anything, mirroring recordLog's own reset rules.
function effectiveStreak(data: StreakData): number {
  if (!data.last_log_date) return data.current_streak;
  const today = getTodayDateStr();
  if (data.last_log_date === today) return data.current_streak;

  const diff = daysDiff(today, data.last_log_date);
  if (diff <= 1) return data.current_streak;                     // still within grace, hasn't missed a day yet
  if (diff === 2 && data.freeze_count > 0) return data.current_streak; // one skipped day, freeze can still save it
  return 0; // streak has lapsed
}

export async function getStreak(userId: string): Promise<StreakData> {
  const { data } = await supabase
    .from('logging_streaks')
    .select('current_streak, longest_streak, last_log_date, freeze_count')
    .eq('user_id', userId)
    .maybeSingle();

  const raw = (data as StreakData | null) ?? {
    current_streak: 0,
    longest_streak: 0,
    last_log_date: null,
    freeze_count: 1,
  };

  return { ...raw, current_streak: effectiveStreak(raw) };
}

export async function recordLog(userId: string): Promise<RecordLogResult> {
  const today = getTodayDateStr();
  const existing = await getStreak(userId);
  const { current_streak, longest_streak, last_log_date, freeze_count } = existing;

  // Already logged today — nothing to update
  if (last_log_date === today) {
    return { newStreak: current_streak, milestone: null, usedFreeze: false };
  }

  let newStreak = 1;
  let newFreezeCount = freeze_count;
  let usedFreeze = false;

  if (last_log_date) {
    const diff = daysDiff(today, last_log_date);
    if (diff === 1) {
      // Consecutive day — extend streak
      newStreak = current_streak + 1;
    } else if (diff === 2 && freeze_count > 0) {
      // Missed exactly one day and have a freeze — use it
      newStreak = current_streak + 1;
      newFreezeCount = freeze_count - 1;
      usedFreeze = true;
    } else {
      // More than one day missed, or missed one without freeze — reset
      newStreak = 1;
    }
  }

  const newLongest = Math.max(longest_streak, newStreak);
  const milestone = MILESTONES.includes(newStreak) ? newStreak : null;

  await (supabase.from('logging_streaks') as any).upsert(
    {
      user_id: userId,
      current_streak: newStreak,
      longest_streak: newLongest,
      last_log_date: today,
      freeze_count: newFreezeCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  return { newStreak, milestone, usedFreeze };
}
