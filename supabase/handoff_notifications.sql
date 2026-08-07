-- Partner coordination: widens the existing in-app notifications table
-- (see notifications.sql, widened once already by relationship_connection.sql
-- for 'kudos') to support 'handoff' notifications — pings between caregivers
-- sharing a baby (baby_caregivers), e.g. "Madeline just fed Baby" or
-- "Baby's asleep — quiet mode is on."
--
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'mention', 'kudos', 'handoff'));

alter table public.notifications add column if not exists handoff_note text;
alter table public.notifications add column if not exists baby_id uuid references public.babies(id) on delete cascade;
