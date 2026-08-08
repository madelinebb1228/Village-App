// Partner/caregiver coordination for a shared baby (baby_caregivers — see
// baby_sharing.sql). Distinct from relationshipUtil.ts's couples/
// couple_members, which is the separate relationship-health feature; baby
// logging is shared via caregiver membership, not couple membership, so
// that's what "don't double-notify" and handoff pings key off of.
//
// This app has no push-token/server-push infrastructure (confirmed: no
// supabase/functions, no EAS projectId), so "notifying a partner" here means
// two things that actually work without one: (1) an in-app notification row
// the partner sees next time they open the app (existing notifications
// table + NotificationsScreen), and (2) a live Supabase Realtime subscription
// that reschedules a caregiver's own locally-scheduled reminder when someone
// else logs — realtime only helps while that caregiver's app is open/
// connected, not a background push to a closed app.

import { supabase } from './supabase';

export interface Caregiver {
  user_id: string;
  name: string;
}

export async function getOtherCaregivers(babyId: string, userId: string): Promise<Caregiver[]> {
  const { data: memberRows } = await supabase
    .from('baby_caregivers')
    .select('user_id')
    .eq('baby_id', babyId)
    .neq('user_id', userId);

  const otherIds = (memberRows ?? []).map((r: any) => r.user_id as string);
  if (otherIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, username')
    .in('id', otherIds);

  return otherIds.map(id => {
    const p = (profiles ?? []).find((row: any) => row.id === id) as any;
    return {
      user_id: id,
      name: p?.display_name || (p?.username ? `@${p.username}` : 'Your co-parent'),
    };
  });
}

// ─── Handoff notifications (in-app) ────────────────────────────────────────────

export type HandoffKind = 'fed' | 'changed' | 'asleep';

const HANDOFF_MESSAGES: Record<HandoffKind, (actor: string, baby: string) => string> = {
  fed:     (actor, baby) => `${actor} just fed ${baby} — no need to double up.`,
  changed: (actor, baby) => `${actor} just changed ${baby}'s diaper.`,
  asleep:  (actor, baby) => `${actor} marked ${baby} asleep — quiet mode is on for both of you.`,
};

// Best-effort: never blocks the caller's own save flow on failure.
export async function notifyHandoff(
  babyId: string,
  actorId: string,
  actorName: string,
  babyName: string,
  kind: HandoffKind,
): Promise<void> {
  try {
    const others = await getOtherCaregivers(babyId, actorId);
    if (others.length === 0) return;

    const note = HANDOFF_MESSAGES[kind](actorName, babyName);
    const rows = others.map(o => ({
      user_id: o.user_id,
      actor_id: actorId,
      type: 'handoff',
      baby_id: babyId,
      handoff_note: note,
    }));
    await (supabase.from('notifications') as any).insert(rows);
  } catch (err: any) {
    console.warn('[partnerCoordination] notifyHandoff failed:', err?.message);
  }
}

// ─── Live reminder rescheduling ────────────────────────────────────────────────

// Subscribes to inserts on the shared-baby logging tables so a caregiver's
// own already-scheduled local reminder (feed/diaper) can be recomputed off
// the freshest "last logged" time as soon as anyone — including a partner —
// logs, instead of only recomputing the next time this device opens the
// screen. Returns an unsubscribe function; call it on unmount.
//
// Multiple cards (DiaperReminderCard, FeedReminderCard, ...) call this for
// the same babyId at once. Supabase's realtime client reuses an existing
// channel object when asked for the same topic name, so a shared
// `baby-activity-${babyId}` topic meant the second caller's .on() calls hit
// a channel that was already subscribed and threw. A per-call random suffix
// keeps every subscriber on its own channel.
export function subscribeToBabyActivity(
  babyId: string,
  handlers: { onFeed?: () => void; onDiaper?: () => void; onSleepStart?: () => void },
): () => void {
  const instanceId = Math.random().toString(36).slice(2, 10);
  const channel = supabase
    .channel(`baby-activity-${babyId}-${instanceId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'feeds', filter: `baby_id=eq.${babyId}` },
      () => handlers.onFeed?.(),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'diaper_logs', filter: `baby_id=eq.${babyId}` },
      () => handlers.onDiaper?.(),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sleep_logs', filter: `baby_id=eq.${babyId}` },
      () => handlers.onSleepStart?.(),
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
