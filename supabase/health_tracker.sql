-- Health Tracker: grouped illness episodes with temperature readings,
-- symptom entries, and medication doses (linked to the existing
-- medications/medication_logs tables). Baby-scoped, shared with every
-- linked caregiver via the is_baby_member() helper from baby_sharing.sql —
-- run that file first if it hasn't been run yet.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

-- ── illness_episodes: grouped health events for a baby ─────────────────────

create table if not exists public.illness_episodes (
  id         uuid primary key default gen_random_uuid(),
  baby_id    uuid not null references public.babies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title      text,
  start_date date not null default current_date,
  end_date   date,
  status     text not null default 'ongoing' check (status in ('ongoing','resolved')),
  notes      text,
  created_at timestamptz not null default now()
);

-- ── temperature_logs: readings under an episode ────────────────────────────

create table if not exists public.temperature_logs (
  id         uuid primary key default gen_random_uuid(),
  baby_id    uuid not null references public.babies(id) on delete cascade,
  episode_id uuid not null references public.illness_episodes(id) on delete cascade,
  value      numeric not null,
  unit       text not null default 'F' check (unit in ('F','C')),
  method     text,
  logged_at  timestamptz not null default now(),
  notes      text
);

-- ── symptom_logs: symptom + severity entries under an episode ──────────────

create table if not exists public.symptom_logs (
  id         uuid primary key default gen_random_uuid(),
  baby_id    uuid not null references public.babies(id) on delete cascade,
  episode_id uuid not null references public.illness_episodes(id) on delete cascade,
  symptom    text not null,
  severity   text not null default 'mild' check (severity in ('mild','moderate','severe')),
  photo_url  text,
  logged_at  timestamptz not null default now(),
  notes      text
);

-- ── medication_logs: optionally link an existing dose to an episode ────────

alter table public.medication_logs
  add column if not exists episode_id uuid references public.illness_episodes(id) on delete set null;

-- ── RLS: baby members can read/write everything for their baby ─────────────

alter table public.illness_episodes enable row level security;
alter table public.temperature_logs  enable row level security;
alter table public.symptom_logs      enable row level security;

create index if not exists idx_illness_episodes_baby     on public.illness_episodes (baby_id, start_date desc);
create index if not exists idx_temperature_logs_episode  on public.temperature_logs (episode_id, logged_at desc);
create index if not exists idx_symptom_logs_episode      on public.symptom_logs (episode_id, logged_at desc);

drop policy if exists illness_episodes_members on public.illness_episodes;
create policy illness_episodes_members on public.illness_episodes
  for all using (public.is_baby_member(baby_id))
  with check (public.is_baby_member(baby_id));

drop policy if exists temperature_logs_members on public.temperature_logs;
create policy temperature_logs_members on public.temperature_logs
  for all using (public.is_baby_member(baby_id))
  with check (public.is_baby_member(baby_id));

drop policy if exists symptom_logs_members on public.symptom_logs;
create policy symptom_logs_members on public.symptom_logs
  for all using (public.is_baby_member(baby_id))
  with check (public.is_baby_member(baby_id));
