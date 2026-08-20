import { supabase } from './supabase';
import { ensureCalendar } from './calendarSync';
import { predictDayNapWindows } from './napSchedule';

export interface ScheduleResult {
  placed: number;
  unplaced: { id: string; title: string }[];
}

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 21;
const DEFAULT_DURATION_MIN = 30;

interface Slot { start: Date; end: Date; kind: 'nap' | 'awake' }
interface BusyBlock { id: string; start: Date; end: Date }
interface MovableBlock extends BusyBlock { durationMs: number; kind: 'nap' | 'awake' }
interface NapWindow { start: Date; end: Date }

function subtractBusyFromSlots(slots: Slot[], busy: BusyBlock[]): Slot[] {
  let result = slots;
  for (const b of busy) {
    const next: Slot[] = [];
    for (const s of result) {
      if (b.end <= s.start || b.start >= s.end) { next.push(s); continue; }
      if (b.start > s.start) next.push({ start: s.start, end: b.start, kind: s.kind });
      if (b.end < s.end) next.push({ start: b.end, end: s.end, kind: s.kind });
    }
    result = next;
  }
  return result.filter(s => s.end.getTime() > s.start.getTime());
}

function kindAt(time: Date, napWindows: NapWindow[]): 'nap' | 'awake' {
  return napWindows.some(w => time.getTime() >= w.start.getTime() && time.getTime() < w.end.getTime()) ? 'nap' : 'awake';
}

// Places today's pending (is_scheduled = false) flexible tasks into the open
// gaps around already-scheduled events and predicted nap windows. Nap-friendly
// tasks prefer nap windows first, falling back to awake gaps if no nap slot
// fits; non-nap-friendly tasks only ever use awake gaps.
//
// A first greedy pass never moves anything already placed. A bounded second
// pass then tries, for each task that still didn't fit, shifting exactly one
// already-placed flexible event (that the user hasn't manually dragged) later
// by the stuck task's own duration — freeing its original slot — as long as
// the shift keeps that event within the same nap/awake territory it started
// in and doesn't collide with anything else. Fixed events, shared-calendar
// events, and anything manually_scheduled are never candidates for this and
// are never moved by generateDaySchedule.
export async function generateDaySchedule(userId: string, forDate: Date): Promise<ScheduleResult> {
  const db: any = supabase;
  const calendarId = await ensureCalendar(userId, 'personal');

  const { data: baby } = await db
    .from('babies')
    .select('id, birth_date')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  const dayBoundStart = new Date(forDate); dayBoundStart.setHours(0, 0, 0, 0);
  const dayBoundEnd = new Date(forDate); dayBoundEnd.setHours(23, 59, 59, 999);
  const dayStart = new Date(forDate); dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
  const dayEnd = new Date(forDate); dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);

  const { data: busyRows } = await db
    .from('calendar_events')
    .select('id, starts_at, ends_at, estimated_minutes, all_day, is_flexible, manually_scheduled')
    .eq('calendar_id', calendarId)
    .eq('is_scheduled', true)
    .gte('starts_at', dayBoundStart.toISOString())
    .lte('starts_at', dayBoundEnd.toISOString());

  const { data: pendingRows } = await db
    .from('calendar_events')
    .select('id, title, estimated_minutes, nap_ok')
    .eq('calendar_id', calendarId)
    .eq('is_scheduled', false)
    .gte('starts_at', dayBoundStart.toISOString())
    .lte('starts_at', dayBoundEnd.toISOString())
    .order('created_at', { ascending: true });
  const pending = pendingRows ?? [];

  const napWindows: NapWindow[] = baby?.id ? await predictDayNapWindows(baby.id, baby.birth_date ?? null, forDate) : [];

  const busy: BusyBlock[] = (busyRows ?? [])
    .filter((r: any) => !r.all_day)
    .map((r: any) => {
      const start = new Date(r.starts_at);
      const end = r.ends_at ? new Date(r.ends_at) : new Date(start.getTime() + (r.estimated_minutes ?? DEFAULT_DURATION_MIN) * 60000);
      return { id: r.id, start, end };
    })
    .sort((a: BusyBlock, b: BusyBlock) => a.start.getTime() - b.start.getTime());

  // Already-placed flexible events the user hasn't manually dragged — the
  // only rows the bounded rebalancing pass (below) is ever allowed to move.
  const movable: MovableBlock[] = (busyRows ?? [])
    .filter((r: any) => !r.all_day && r.is_flexible && !r.manually_scheduled)
    .map((r: any) => {
      const start = new Date(r.starts_at);
      const end = r.ends_at ? new Date(r.ends_at) : new Date(start.getTime() + (r.estimated_minutes ?? DEFAULT_DURATION_MIN) * 60000);
      return { id: r.id, start, end, durationMs: end.getTime() - start.getTime(), kind: kindAt(start, napWindows) };
    })
    .sort((a: MovableBlock, b: MovableBlock) => a.start.getTime() - b.start.getTime());

  // Nap slots: nap windows clipped to day bounds, minus any real busy-event
  // overlap.
  let napSlots: Slot[] = [];
  for (const w of napWindows) {
    const s = new Date(Math.max(w.start.getTime(), dayStart.getTime()));
    const e = new Date(Math.min(w.end.getTime(), dayEnd.getTime()));
    if (e.getTime() > s.getTime()) napSlots.push({ start: s, end: e, kind: 'nap' });
  }
  napSlots = subtractBusyFromSlots(napSlots, busy);

  // Awake gaps must exclude nap-window time too — otherwise a nap-friendly
  // task placed via a nap slot and a non-nap-friendly task placed via an
  // "awake" gap that happens to cover the same clock time would collide.
  const unavailableForAwake: BusyBlock[] = [...busy, ...napWindows.map(w => ({ id: '', start: w.start, end: w.end }))]
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const awakeSlots: Slot[] = [];
  let cursor = dayStart;
  for (const b of unavailableForAwake) {
    const s = new Date(Math.max(b.start.getTime(), dayStart.getTime()));
    const e = new Date(Math.min(b.end.getTime(), dayEnd.getTime()));
    if (s.getTime() > cursor.getTime()) awakeSlots.push({ start: cursor, end: s, kind: 'awake' });
    if (e.getTime() > cursor.getTime()) cursor = e;
  }
  if (dayEnd.getTime() > cursor.getTime()) awakeSlots.push({ start: cursor, end: dayEnd, kind: 'awake' });

  const slots: Slot[] = [...napSlots, ...awakeSlots]
    .filter(s => s.end.getTime() > s.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const now = new Date();
  const unplaced: { id: string; title: string }[] = [];

  type PendingUpdate = { kind: 'task' | 'move'; id: string; title?: string; promise: Promise<any> };
  const updates: PendingUpdate[] = [];
  let placed = 0;

  // ── Pass 1: greedy first-fit, exactly as before — never moves anything
  // already placed, only decides where pending tasks land. ─────────────────
  for (const task of pending) {
    const duration = task.estimated_minutes ?? DEFAULT_DURATION_MIN;
    const order: Array<'nap' | 'awake'> = task.nap_ok ? ['nap', 'awake'] : ['awake'];
    let didPlace = false;

    for (const kind of order) {
      for (const slot of slots) {
        if (slot.kind !== kind) continue;
        const usableStart = slot.start.getTime() < now.getTime() ? now : slot.start;
        if (slot.end.getTime() - usableStart.getTime() < duration * 60000) continue;

        const start = usableStart;
        const end = new Date(start.getTime() + duration * 60000);
        updates.push({
          kind: 'task',
          id: task.id,
          title: task.title,
          promise: db.from('calendar_events').update({
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            is_scheduled: true,
          }).eq('id', task.id),
        });

        slot.start = end; // consume the slot
        placed++;
        didPlace = true;
        break;
      }
      if (didPlace) break;
    }

    if (!didPlace) unplaced.push({ id: task.id, title: task.title });
  }

  // ── Pass 2: bounded rebalancing. For each task that still doesn't fit,
  // try shifting exactly one already-placed movable event later by the
  // task's own duration, freeing its original slot. One swap attempt per
  // unplaced task — no cascades, no backtracking. ─────────────────────────
  const stillUnplaced: { id: string; title: string }[] = [];
  for (const task of unplaced) {
    const original = pending.find((p: any) => p.id === task.id);
    const duration = original?.estimated_minutes ?? DEFAULT_DURATION_MIN;
    const durationMs = duration * 60000;
    const acceptableKinds: Array<'nap' | 'awake'> = original?.nap_ok !== false ? ['nap', 'awake'] : ['awake'];

    let rebalanced = false;
    for (const m of movable) {
      if (!acceptableKinds.includes(m.kind)) continue;

      // The task takes m's original slot (clamped to "now" if that slot is
      // already in the past); m moves to right after where the task ends.
      const candidateStart = m.start.getTime() < now.getTime() ? now : m.start;
      const newStart = new Date(candidateStart.getTime() + durationMs);
      const newEnd = new Date(newStart.getTime() + m.durationMs);
      if (newEnd.getTime() > dayEnd.getTime()) continue;

      if (m.kind === 'nap') {
        const w = napWindows.find(w => m.start.getTime() >= w.start.getTime() && m.start.getTime() < w.end.getTime());
        if (!w || newEnd.getTime() > w.end.getTime()) continue;
      }

      // The shifted block must not collide with any other busy block.
      const collides = busy.some(b => b.id !== m.id && newStart.getTime() < b.end.getTime() && newEnd.getTime() > b.start.getTime());
      if (collides) continue;

      // Success — move m later, place the task in m's freed original slot.
      updates.push({
        kind: 'move',
        id: m.id,
        promise: db.from('calendar_events').update({
          starts_at: newStart.toISOString(),
          ends_at: newEnd.toISOString(),
        }).eq('id', m.id),
      });
      updates.push({
        kind: 'task',
        id: task.id,
        title: task.title,
        promise: db.from('calendar_events').update({
          starts_at: candidateStart.toISOString(),
          ends_at: new Date(candidateStart.getTime() + durationMs).toISOString(),
          is_scheduled: true,
        }).eq('id', task.id),
      });

      // Reflect the move in-memory so later unplaced tasks in this same
      // pass see the updated occupancy and don't double-book the same gap.
      const bIdx = busy.findIndex(b => b.id === m.id);
      if (bIdx >= 0) { busy[bIdx].start = newStart; busy[bIdx].end = newEnd; }
      m.start = newStart; m.end = newEnd;

      placed++;
      rebalanced = true;
      break;
    }

    if (!rebalanced) stillUnplaced.push(task);
  }

  // ── Flush all writes in one batch instead of N sequential round-trips. ──
  const settled = await Promise.allSettled(updates.map(u => u.promise));
  settled.forEach((result, i) => {
    const u = updates[i];
    const failed = result.status === 'rejected' || (result.status === 'fulfilled' && (result.value as any)?.error);
    if (failed && u.kind === 'task') {
      placed--;
      stillUnplaced.push({ id: u.id, title: u.title ?? '' });
    }
  });

  return { placed, unplaced: stillUnplaced };
}
