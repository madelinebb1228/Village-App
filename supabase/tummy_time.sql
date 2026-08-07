-- Tummy Time tracker: lets caregivers log tummy-time sessions so the app can
-- show a running daily total and nudge when it's been a while. Baby-scoped
-- and shared with every linked caregiver via is_baby_member(), same pattern
-- as sleep_logs.sql — run baby_sharing.sql first if it hasn't been run yet.
--
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

create table if not exists public.tummy_time_logs (
  id               uuid primary key default gen_random_uuid(),
  baby_id          uuid not null references public.babies(id) on delete cascade,
  started_at       timestamptz not null default now(),
  duration_minutes integer not null check (duration_minutes > 0),
  notes            text,
  logged_by        uuid not null references auth.users(id) on delete cascade,
  logged_at        timestamptz not null default now()
);

create index if not exists idx_tummy_time_baby_started on public.tummy_time_logs (baby_id, started_at desc);

alter table public.tummy_time_logs enable row level security;

drop policy if exists tummy_time_baby_members on public.tummy_time_logs;
create policy tummy_time_baby_members on public.tummy_time_logs
  for all using (public.is_baby_member(baby_id))
  with check (public.is_baby_member(baby_id));
