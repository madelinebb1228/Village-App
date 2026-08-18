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
interface BusyBlock { start: Date; end: Date }

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

// Places today's pending (is_scheduled = false) flexible tasks into the open
// gaps around already-scheduled events and predicted nap windows. Already-
// scheduled events (fixed or flexible) are never moved by this pass — only
// new pending tasks get placed. Nap-friendly tasks prefer nap windows first,
// falling back to awake gaps if no nap slot fits; non-nap-friendly tasks
// only ever use awake gaps. Tasks that don't fit anywhere are left pending
// and reported back so the UI can flag them.
export async function generateDaySchedule(userId: string, forDate: Date, babyId?: string | null): Promise<ScheduleResult> {
  const db: any = supabase;
  const calendarId = await ensureCalendar(userId, 'personal');

  // Prefer the caller's active baby (relevant for households with more than
  // one child) — only fall back to an arbitrary owned baby if none is given.
  const babyQuery = db.from('babies').select('id, birth_date');
  const { data: baby } = babyId
    ? await babyQuery.eq('id', babyId).maybeSingle()
    : await babyQuery.eq('user_id', userId).limit(1).maybeSingle();

  const dayBoundStart = new Date(forDate); dayBoundStart.setHours(0, 0, 0, 0);
  const dayBoundEnd = new Date(forDate); dayBoundEnd.setHours(23, 59, 59, 999);
  const dayStart = new Date(forDate); dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
  const dayEnd = new Date(forDate); dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);

  // Already-scheduled events today are treated as fixed "busy" blocks,
  // regardless of their own flexible/fixed status — generation only fills
  // gaps, it never reshuffles what's already placed.
  const { data: busyRows } = await db
    .from('calendar_events')
    .select('starts_at, ends_at, estimated_minutes, all_day')
    .eq('calendar_id', calendarId)
    .eq('is_scheduled', true)
    .gte('starts_at', dayBoundStart.toISOString())
    .lte('starts_at', dayBoundEnd.toISOString());

  const busy: BusyBlock[] = (busyRows ?? [])
    .filter((r: any) => !r.all_day)
    .map((r: any) => {
      const start = new Date(r.starts_at);
      const end = r.ends_at ? new Date(r.ends_at) : new Date(start.getTime() + (r.estimated_minutes ?? DEFAULT_DURATION_MIN) * 60000);
      return { start, end };
    })
    .sort((a: BusyBlock, b: BusyBlock) => a.start.getTime() - b.start.getTime());

  const { data: pendingRows } = await db
    .from('calendar_events')
    .select('id, title, estimated_minutes, nap_ok')
    .eq('calendar_id', calendarId)
    .eq('is_scheduled', false)
    .gte('starts_at', dayBoundStart.toISOString())
    .lte('starts_at', dayBoundEnd.toISOString())
    .order('created_at', { ascending: true });
  const pending = pendingRows ?? [];

  const napWindows = baby?.id ? await predictDayNapWindows(baby.id, baby.birth_date ?? null, forDate) : [];

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
  const unavailableForAwake: BusyBlock[] = [...busy, ...napWindows]
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
  let placed = 0;

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
        await db.from('calendar_events').update({
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          is_scheduled: true,
        }).eq('id', task.id);

        slot.start = end; // consume the slot
        placed++;
        didPlace = true;
        break;
      }
      if (didPlace) break;
    }

    if (!didPlace) unplaced.push({ id: task.id, title: task.title });
  }

  return { placed, unplaced };
}
