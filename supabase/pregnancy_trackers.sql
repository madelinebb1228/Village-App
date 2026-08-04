-- Pregnancy trackers for expecting parents: kick counts, contraction timing,
-- and a symptom/weight log. Run once in the Supabase SQL editor.

-- ── Kick Counter ──────────────────────────────────────────────────────────────
create table if not exists mom_kick_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  kick_count       int not null default 0,
  duration_seconds int,
  notes            text
);

-- ── Contraction Timer ─────────────────────────────────────────────────────────
create table if not exists mom_contraction_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds int,
  notes            text
);

-- ── Pregnancy Symptom & Weight Log ────────────────────────────────────────────
create table if not exists mom_pregnancy_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  logged_date date not null default current_date,
  weight_lbs  numeric,
  symptoms    text[] default '{}',
  notes       text,
  created_at  timestamptz not null default now(),
  unique(user_id, logged_date)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists mom_kick_user         on mom_kick_sessions(user_id, started_at desc);
create index if not exists mom_contraction_user   on mom_contraction_logs(user_id, started_at desc);
create index if not exists mom_pregnancy_user_date on mom_pregnancy_logs(user_id, logged_date desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table mom_kick_sessions   enable row level security;
alter table mom_contraction_logs enable row level security;
alter table mom_pregnancy_logs   enable row level security;

create policy "kick_own"         on mom_kick_sessions    for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contraction_own"  on mom_contraction_logs for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pregnancy_log_own" on mom_pregnancy_logs  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
