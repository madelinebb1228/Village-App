-- Day task planner + auto-scheduler: lets a flexible task be entered with
-- no specific time yet (just a duration and a nap-friendly preference),
-- parked on its intended date until "Generate Schedule" places it.
--
-- starts_at stays NOT NULL (it holds the intended date at midnight for a
-- pending task, so day-grouping keeps working unmodified) — is_scheduled
-- is what actually distinguishes "has a real placement" from "time TBD".
-- Run this in the Supabase SQL editor AFTER nap_aware_calendar.sql.

alter table public.calendar_events
  add column if not exists is_scheduled boolean not null default true;

alter table public.calendar_events
  add column if not exists estimated_minutes integer;

alter table public.calendar_events
  add column if not exists nap_ok boolean not null default true;
