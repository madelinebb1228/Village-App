-- Activity tracking: lets caregivers mark a developmental activity (see
-- supabase/activities.sql) as tried for a baby and rate how it went. Baby-
-- scoped and shared with every linked caregiver via is_baby_member(), same
-- as illness_episodes in health_tracker.sql — run baby_sharing.sql first if
-- it hasn't been run yet.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

create table if not exists public.activity_tries (
  id          uuid primary key default gen_random_uuid(),
  baby_id     uuid not null references public.babies(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  created_by  uuid not null references auth.users(id) on delete cascade,
  rating      text check (rating in ('loved', 'too_hard', 'not_interested')),
  notes       text,
  tried_at    timestamptz not null default now()
);

create index if not exists idx_activity_tries_baby     on public.activity_tries (baby_id, tried_at desc);
create index if not exists idx_activity_tries_activity on public.activity_tries (baby_id, activity_id);

alter table public.activity_tries enable row level security;

drop policy if exists activity_tries_members on public.activity_tries;
create policy activity_tries_members on public.activity_tries
  for all using (public.is_baby_member(baby_id))
  with check (public.is_baby_member(baby_id));
