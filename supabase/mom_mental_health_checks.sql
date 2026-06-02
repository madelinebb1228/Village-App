-- Mom Mental Health Checks table
-- Stores EPDS check-in results for postpartum depression/anxiety/psychosis screening

create table if not exists mom_mental_health_checks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  epds_score       integer not null check (epds_score between 0 and 30),
  responses        integer[] not null,           -- 10 EPDS answers (0–3 each)
  anxiety_subscale integer not null,             -- sum of Q3+Q4+Q5
  ppp_flags        boolean[] not null,           -- one bool per PPP symptom
  has_ppp_flag     boolean not null default false,
  risk_level       text not null check (risk_level in ('low', 'monitoring', 'high', 'urgent')),
  created_at       timestamptz not null default now()
);

-- Index for fast user history queries
create index if not exists mom_mental_health_checks_user_id_idx
  on mom_mental_health_checks (user_id, created_at desc);

-- Row-level security: users can only read/write their own records
alter table mom_mental_health_checks enable row level security;

create policy "Users can insert own checks"
  on mom_mental_health_checks for insert
  with check (auth.uid() = user_id);

create policy "Users can select own checks"
  on mom_mental_health_checks for select
  using (auth.uid() = user_id);

create policy "Users can delete own checks"
  on mom_mental_health_checks for delete
  using (auth.uid() = user_id);
