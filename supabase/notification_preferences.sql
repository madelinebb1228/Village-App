-- Smart notification preferences: per-category opt-in/out + quiet hours,
-- plus a per-user do-not-disturb toggle and digest settings. Builds on
-- notifications.sql (in-app notification feed) — this table controls
-- *delivery* (push/quiet-hours/DND), not the feed itself.
--
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

-- ── notification_preferences: one row per user per category ────────────────

create table if not exists public.notification_preferences (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  category           text not null check (category in ('critical', 'reminders', 'community', 'insights', 'marketing')),
  enabled            boolean not null default true,
  delivery_method    text not null default 'push' check (delivery_method in ('push', 'email', 'sms', 'in_app_only')),
  quiet_hours_start  int check (quiet_hours_start between 0 and 23),
  quiet_hours_end    int check (quiet_hours_end between 0 and 23),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, category)
);

create index if not exists idx_notification_prefs_user on public.notification_preferences (user_id);

alter table public.notification_preferences enable row level security;

drop policy if exists "users manage own notification prefs" on public.notification_preferences;
create policy "users manage own notification prefs" on public.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── notification_settings: one row per user, global switches ───────────────

create table if not exists public.notification_settings (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  do_not_disturb    boolean not null default false,
  digest_enabled    boolean not null default false,
  digest_time       text not null default '09:00',   -- 'HH:MM', 24h, local device time
  updated_at        timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

drop policy if exists "users manage own notification settings" on public.notification_settings;
create policy "users manage own notification settings" on public.notification_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── keep updated_at fresh ───────────────────────────────────────────────────

create or replace function public.touch_notification_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_notification_prefs on public.notification_preferences;
create trigger trg_touch_notification_prefs
  before update on public.notification_preferences
  for each row execute function public.touch_notification_updated_at();

drop trigger if exists trg_touch_notification_settings on public.notification_settings;
create trigger trg_touch_notification_settings
  before update on public.notification_settings
  for each row execute function public.touch_notification_updated_at();
