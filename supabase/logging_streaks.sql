create table if not exists logging_streaks (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  current_streak  int  not null default 0,
  longest_streak  int  not null default 0,
  last_log_date   date,
  freeze_count    int  not null default 1,
  updated_at  timestamptz not null default now()
);

alter table logging_streaks enable row level security;

create policy "Users manage own streak"
  on logging_streaks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
