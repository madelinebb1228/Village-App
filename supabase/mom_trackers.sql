-- Mom Trackers: all 6 tables in one migration
-- Run once in the Supabase SQL editor.

-- ── Mood & Energy ─────────────────────────────────────────────────────────────
create table if not exists mom_mood_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  logged_date  date not null default current_date,
  mood_score   int  not null check (mood_score  between 1 and 5),
  energy_score int  not null check (energy_score between 1 and 5),
  emotions     text[] default '{}',
  notes        text,
  created_at   timestamptz not null default now(),
  unique(user_id, logged_date)
);

-- ── Mom Sleep ─────────────────────────────────────────────────────────────────
create table if not exists mom_sleep_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  sleep_type       text not null default 'night', -- night | nap
  duration_minutes int,
  quality          text, -- poor | fair | good
  interruptions    int  default 0,
  notes            text,
  logged_at        timestamptz not null default now()
);

-- ── Medications & Supplements ─────────────────────────────────────────────────
create table if not exists mom_medications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null,
  dose        text,
  frequency   text, -- daily | twice_daily | as_needed | weekly
  color       text default 'lavender',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists mom_medication_logs (
  id       uuid primary key default gen_random_uuid(),
  med_id   uuid not null references mom_medications(id) on delete cascade,
  user_id  uuid not null references profiles(id) on delete cascade,
  taken_at timestamptz not null default now(),
  notes    text
);

-- ── Postpartum Recovery ───────────────────────────────────────────────────────
create table if not exists mom_recovery_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  logged_date     date not null default current_date,
  pain_level      int  check (pain_level  between 0 and 10),
  lochia          text, -- none | spotting | light | moderate | heavy
  incision_status text, -- healing | some_redness | concerning | na
  pf_symptoms     text[] default '{}',
  breast_pain     int  check (breast_pain between 0 and 5),
  other_symptoms  text[] default '{}',
  notes           text,
  created_at      timestamptz not null default now(),
  unique(user_id, logged_date)
);

-- ── Period Return ─────────────────────────────────────────────────────────────
create table if not exists mom_period_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  logged_date date not null default current_date,
  flow_level  text, -- none | spotting | light | moderate | heavy
  symptoms    text[] default '{}',
  notes       text,
  created_at  timestamptz not null default now()
);

-- ── Movement & Exercise ───────────────────────────────────────────────────────
create table if not exists mom_movement_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  activity_type    text not null, -- walk | yoga | pelvic_floor | stretching | swimming | other
  duration_minutes int,
  intensity        text, -- gentle | moderate | vigorous
  notes            text,
  logged_at        timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists mom_mood_user_date     on mom_mood_logs(user_id, logged_date desc);
create index if not exists mom_sleep_user         on mom_sleep_logs(user_id, logged_at desc);
create index if not exists mom_meds_user          on mom_medications(user_id);
create index if not exists mom_med_logs_user      on mom_medication_logs(user_id, taken_at desc);
create index if not exists mom_med_logs_med       on mom_medication_logs(med_id, taken_at desc);
create index if not exists mom_recovery_user_date on mom_recovery_logs(user_id, logged_date desc);
create index if not exists mom_period_user        on mom_period_logs(user_id, logged_date desc);
create index if not exists mom_movement_user      on mom_movement_logs(user_id, logged_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table mom_mood_logs       enable row level security;
alter table mom_sleep_logs      enable row level security;
alter table mom_medications     enable row level security;
alter table mom_medication_logs enable row level security;
alter table mom_recovery_logs   enable row level security;
alter table mom_period_logs     enable row level security;
alter table mom_movement_logs   enable row level security;

-- Each user sees and manages only their own data
create policy "mood_own"      on mom_mood_logs       for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sleep_own"     on mom_sleep_logs      for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "meds_own"      on mom_medications     for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "med_logs_own"  on mom_medication_logs for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recovery_own"  on mom_recovery_logs   for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "period_own"    on mom_period_logs     for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "movement_own"  on mom_movement_logs   for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
