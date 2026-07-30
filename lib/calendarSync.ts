import { useCallback, useState } from 'react';
import { supabase } from './supabase';

export type CalendarSourceType = 'appointment' | 'vaccine' | 'medication';
export type CalendarKind = 'personal' | 'shared';

export interface CalendarSyncDetails {
  title: string;
  startsAt: Date;
  notes?: string | null;
  allDay?: boolean;
  sourceType: CalendarSourceType;
  sourceId: string;
}

const CALENDAR_NAMES: Record<CalendarKind, string> = {
  personal: 'My Calendar',
  shared: 'Our Calendar',
};

// Finds the user's calendar of the given type, creating it if it doesn't
// exist yet — mirrors the auto-create-on-first-use behavior in SharedCalendar.
export async function ensureCalendar(userId: string, kind: CalendarKind): Promise<string> {
  const db: any = supabase;
  const { data: existing } = await db
    .from('calendars')
    .select('id')
    .eq('owner_id', userId)
    .eq('calendar_type', kind)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await db
    .from('calendars')
    .insert({ owner_id: userId, name: CALENDAR_NAMES[kind], calendar_type: kind })
    .select('id')
    .single();
  if (error) throw error;
  return created.id as string;
}

// Prompts the user to add a tracker entry (an appointment, a vaccine dose,
// a medication) to their Personal or Shared calendar, and tags the created
// event with source_type/source_id so the calendar can link back to it.
export function useCalendarSyncPrompt() {
  const [pending, setPending] = useState<CalendarSyncDetails | null>(null);
  const [saving, setSaving] = useState(false);

  const promptAddToCalendar = useCallback((details: CalendarSyncDetails) => {
    setPending(details);
  }, []);

  const dismiss = useCallback(() => setPending(null), []);

  const addTo = useCallback(async (kind: CalendarKind) => {
    if (!pending) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const calendarId = await ensureCalendar(user.id, kind);
      const db: any = supabase;
      await db.from('calendar_events').insert({
        calendar_id: calendarId,
        created_by: user.id,
        title: pending.title,
        notes: pending.notes ?? null,
        starts_at: pending.startsAt.toISOString(),
        all_day: pending.allDay ?? false,
        source_type: pending.sourceType,
        source_id: pending.sourceId,
      });
    } finally {
      setSaving(false);
      setPending(null);
    }
  }, [pending]);

  return { pending, saving, promptAddToCalendar, dismiss, addTo };
}
