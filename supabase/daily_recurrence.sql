-- Daily recurrence: groups an event's occurrences so they can be managed
-- together (e.g. "delete this and all future"). Occurrences are ordinary
-- calendar_events rows materialized ~90 days ahead at creation time — every
-- existing feature (nap-shifting, day generation, display) keeps working
-- unmodified since each occurrence is just a normal event.
-- Run this in the Supabase SQL editor AFTER day_planner.sql.

alter table public.calendar_events
  add column if not exists recurrence_id uuid;

create index if not exists idx_calendar_events_recurrence
  on public.calendar_events (recurrence_id);
