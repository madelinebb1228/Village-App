-- Drag-to-reschedule on the day timeline: marks an event as having been
-- manually placed by the user, so the automatic nap-drift shifter
-- (shiftFlexibleEvents in lib/napSchedule.ts) and the auto-scheduler's
-- rebalancing pass (generateDaySchedule in lib/daySchedule.ts) both leave it
-- alone instead of silently moving it again.
-- Run this in the Supabase SQL editor AFTER daily_recurrence.sql.

alter table public.calendar_events
  add column if not exists manually_scheduled boolean not null default false;
