-- Integrations framework: connect external services (Google Calendar first;
-- Apple Health/Google Fit, Photos, and smart-home devices follow the same
-- shape later) and two-way calendar sync mapping columns on calendar_events.
--
-- SECURITY NOTE: unlike every other table in this app, user_integrations is
-- NOT directly readable by clients via RLS. RLS is row-level, not
-- column-level — if `authenticated` could SELECT its own row, it could also
-- SELECT the encrypted token columns. Instead:
--   - the base table only grants access to `service_role` (i.e. Edge
--     Functions, which hold the Google client_secret and do all token
--     handling — see supabase/functions/google-oauth-exchange and
--     google-calendar-sync)
--   - a `user_integrations_public` view, owned by the migration role, is the
--     only thing the app queries directly. Because it's owned by a role that
--     bypasses RLS, the `where user_id = auth.uid()` in the view definition
--     itself is what does the row filtering, not a policy.
--
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

-- ── user_integrations ────────────────────────────────────────────────────────

create table if not exists public.user_integrations (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  service_name            text not null check (service_name in (
                            'google_calendar', 'apple_health', 'google_fit',
                            'google_photos', 'icloud_photos', 'hatch', 'nanit'
                          )),
  status                  text not null default 'disconnected'
                            check (status in ('connected', 'disconnected', 'error', 'expired')),
  -- base64(iv || ciphertext) from AES-256-GCM, encrypted/decrypted only inside
  -- edge functions using the INTEGRATIONS_ENCRYPTION_KEY secret. Stored as
  -- text (not bytea) so it round-trips through PostgREST JSON without the
  -- \x hex-encoding fuss bytea columns need there.
  access_token_encrypted  text,
  refresh_token_encrypted text,
  token_expires_at        timestamptz,
  scopes                  text[] not null default '{}',
  external_account_id     text,        -- e.g. the connected Google account's email
  external_calendar_id    text,        -- id of the created "Parent Patch" Google calendar
  sync_settings           jsonb not null default '{}',  -- e.g. { "syncToken": "...", "dataTypes": [...] }
  last_sync_at            timestamptz,
  last_error              text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, service_name)
);

create index if not exists idx_user_integrations_user on public.user_integrations (user_id);

alter table public.user_integrations enable row level security;

drop policy if exists "service role full access" on public.user_integrations;
create policy "service role full access" on public.user_integrations
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on public.user_integrations from authenticated, anon;

create or replace view public.user_integrations_public as
select id, user_id, service_name, status, scopes, external_account_id,
       external_calendar_id, sync_settings, last_sync_at, last_error,
       is_active, created_at, updated_at
from public.user_integrations
where user_id = auth.uid();

grant select on public.user_integrations_public to authenticated;

-- Disconnecting is the one write the client needs to make directly. Rather
-- than open up UPDATE on the base table (which would also expose the token
-- columns to policy-writing mistakes later), this is a narrow SECURITY
-- DEFINER RPC that only ever clears tokens and flips status — same pattern
-- as join_calendar_by_code() in shared_calendar.sql.
create or replace function public.disconnect_integration(p_service_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_integrations
  set status = 'disconnected',
      is_active = false,
      access_token_encrypted = null,
      refresh_token_encrypted = null,
      token_expires_at = null,
      updated_at = now()
  where user_id = auth.uid() and service_name = p_service_name;
end;
$$;

grant execute on function public.disconnect_integration(text) to authenticated;

-- ── calendar_events: sync bookkeeping for two-way Google Calendar sync ────────
-- google_event_id is null for events created in-app that haven't been pushed
-- yet. external_source is null for in-app events, 'google_calendar' for
-- events pulled in from Google. updated_at backs last-write-wins conflict
-- resolution when the same event changed on both sides.

alter table public.calendar_events
  add column if not exists google_event_id text,
  add column if not exists external_source text check (external_source in ('google_calendar')),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_calendar_events_google_event
  on public.calendar_events (google_event_id) where google_event_id is not null;
