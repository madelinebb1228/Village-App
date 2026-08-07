-- Two tables that finish out the smart-notification system started in
-- notification_preferences.sql:
--
-- notification_history: a durable log of every notification the app decided
-- to deliver, hold, or batch — backs the "What did I miss?" screen. This is
-- separate from the social `notifications` table (likes/comments/kudos/
-- handoff), which is a different, older feed with its own schema.
--
-- notification_digest_queue: items held back when the user has "Batch into
-- one digest" enabled (see notification_settings.digest_enabled), to be
-- summarized into a single daily notification instead of firing one at a
-- time.
--
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

create table if not exists public.notification_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category     text not null check (category in ('critical', 'reminders', 'community', 'insights', 'marketing')),
  title        text not null,
  body         text not null,
  delivered    boolean not null default true,   -- false = held (quiet hours/DND/baby asleep/category off)
  hold_reason  text,                             -- set when delivered = false
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists idx_notification_history_user on public.notification_history (user_id, created_at desc);

alter table public.notification_history enable row level security;

drop policy if exists "users manage own notification history" on public.notification_history;
create policy "users manage own notification history" on public.notification_history
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.notification_digest_queue (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  category   text not null check (category in ('community', 'insights')),
  title      text not null,
  body       text not null,
  delivered  boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_digest_queue_user_pending on public.notification_digest_queue (user_id, delivered);

alter table public.notification_digest_queue enable row level security;

drop policy if exists "users manage own digest queue" on public.notification_digest_queue;
create policy "users manage own digest queue" on public.notification_digest_queue
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
