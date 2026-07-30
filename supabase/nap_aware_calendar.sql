-- Nap-aware personal calendar: lets an event be marked "flexible" so it can
-- be auto-shifted when a nap ends earlier or later than typical.
-- Run this in the Supabase SQL editor AFTER calendar_smart_features.sql.

alter table public.calendar_events
  add column if not exists is_flexible boolean not null default false;
