create table if not exists sleep_logs (
  id               uuid primary key default gen_random_uuid(),
  baby_id          uuid references babies(id) on delete cascade not null,
  sleep_type       text not null default 'nap' check (sleep_type in ('nap', 'night')),
  start_time       timestamptz not null,
  end_time         timestamptz,
  duration_minutes integer,
  quality          text check (quality in ('great', 'good', 'fair', 'poor')),
  notes            text,
  logged_at        timestamptz default now() not null
);

alter table sleep_logs enable row level security;

create policy "users manage own baby sleep logs" on sleep_logs
  for all using (
    baby_id in (select id from babies where user_id = auth.uid())
  );

create index sleep_logs_baby_start on sleep_logs (baby_id, start_time desc);
