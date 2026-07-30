-- Smart calendar features: personal vs shared calendars, caregiver
-- assignment, and linking calendar events back to the tracker entry that
-- created them (appointments, vaccines, etc).
-- Run this in the Supabase SQL editor AFTER shared_calendar.sql.

-- ── calendars: personal vs shared ────────────────────────────────────────────

alter table public.calendars
  add column if not exists calendar_type text not null default 'shared';

alter table public.calendars
  drop constraint if exists calendars_calendar_type_check;
alter table public.calendars
  add constraint calendars_calendar_type_check check (calendar_type in ('personal', 'shared'));

-- Only one personal calendar per owner
create unique index if not exists idx_one_personal_calendar_per_owner
  on public.calendars (owner_id)
  where calendar_type = 'personal';

-- ── calendar_events: caregiver assignment + tracker linking ──────────────────

alter table public.calendar_events
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

alter table public.calendar_events
  add column if not exists source_type text;

alter table public.calendar_events
  add column if not exists source_id uuid;

-- ── A personal calendar can never gain other members ─────────────────────────

drop policy if exists members_insert on public.calendar_members;
create policy members_insert on public.calendar_members
  for insert with check (
    exists (
      select 1 from public.calendars c
      where c.id = calendar_id
        and c.owner_id = auth.uid()
        and c.calendar_type = 'shared'
    )
  );

create or replace function public.join_calendar_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cal      uuid;
  cal_type text;
begin
  select id, calendar_type into cal, cal_type from public.calendars
  where invite_code = upper(trim(p_code));
  if cal is null then
    raise exception 'Invalid invite code';
  end if;
  if cal_type = 'personal' then
    raise exception 'This calendar is personal and cannot be joined';
  end if;
  insert into public.calendar_members (calendar_id, user_id, role)
  values (cal, auth.uid(), 'member')
  on conflict (calendar_id, user_id) do nothing;
  return cal;
end;
$$;
