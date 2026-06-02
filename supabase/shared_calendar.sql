-- Shared parent/caregiver calendar
-- Run this in the Supabase SQL editor. Creates the calendar tables, row-level
-- security, a membership helper, an owner-as-member trigger, and a
-- join-by-invite-code function.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.calendars (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Our Calendar',
  invite_code text unique not null default upper(substr(md5(random()::text), 1, 6)),
  created_at  timestamptz not null default now()
);

create table if not exists public.calendar_members (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member',
  created_at  timestamptz not null default now(),
  unique (calendar_id, user_id)
);

create table if not exists public.calendar_events (
  id               uuid primary key default gen_random_uuid(),
  calendar_id      uuid not null references public.calendars(id) on delete cascade,
  created_by       uuid references auth.users(id) on delete set null,
  title            text not null,
  notes            text,
  location         text,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  all_day          boolean not null default false,
  reminder_minutes integer,            -- null = no reminder, 0 = at start, else minutes before
  created_at       timestamptz not null default now()
);

create index if not exists idx_calendar_events_cal_start on public.calendar_events (calendar_id, starts_at);
create index if not exists idx_calendar_members_user      on public.calendar_members (user_id);

-- ── Membership helper (SECURITY DEFINER avoids RLS recursion) ────────────────

create or replace function public.is_calendar_member(cal uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.calendar_members m
    where m.calendar_id = cal and m.user_id = auth.uid()
  );
$$;

-- ── Auto-add the owner as a member when a calendar is created ────────────────

create or replace function public.add_calendar_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.calendar_members (calendar_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (calendar_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_add_calendar_owner on public.calendars;
create trigger trg_add_calendar_owner
  after insert on public.calendars
  for each row execute function public.add_calendar_owner_as_member();

-- ── Join a calendar by its invite code (bypasses RLS via definer) ────────────

create or replace function public.join_calendar_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cal uuid;
begin
  select id into cal from public.calendars
  where invite_code = upper(trim(p_code));
  if cal is null then
    raise exception 'Invalid invite code';
  end if;
  insert into public.calendar_members (calendar_id, user_id, role)
  values (cal, auth.uid(), 'member')
  on conflict (calendar_id, user_id) do nothing;
  return cal;
end;
$$;

-- ── Row-level security ───────────────────────────────────────────────────────

alter table public.calendars        enable row level security;
alter table public.calendar_members enable row level security;
alter table public.calendar_events  enable row level security;

-- calendars: members can read; only the owner can create/edit/delete
drop policy if exists calendars_select on public.calendars;
create policy calendars_select on public.calendars
  for select using (public.is_calendar_member(id) or owner_id = auth.uid());

drop policy if exists calendars_insert on public.calendars;
create policy calendars_insert on public.calendars
  for insert with check (owner_id = auth.uid());

drop policy if exists calendars_update on public.calendars;
create policy calendars_update on public.calendars
  for update using (owner_id = auth.uid());

drop policy if exists calendars_delete on public.calendars;
create policy calendars_delete on public.calendars
  for delete using (owner_id = auth.uid());

-- calendar_members: members can see co-members; only the owner adds members;
-- a member can remove themselves and the owner can remove anyone.
-- (Self-join by invite code goes through join_calendar_by_code.)
drop policy if exists members_select on public.calendar_members;
create policy members_select on public.calendar_members
  for select using (user_id = auth.uid() or public.is_calendar_member(calendar_id));

drop policy if exists members_insert on public.calendar_members;
create policy members_insert on public.calendar_members
  for insert with check (
    exists (select 1 from public.calendars c where c.id = calendar_id and c.owner_id = auth.uid())
  );

drop policy if exists members_delete on public.calendar_members;
create policy members_delete on public.calendar_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.calendars c where c.id = calendar_id and c.owner_id = auth.uid())
  );

-- calendar_events: any member of the calendar can read and manage events
drop policy if exists events_select on public.calendar_events;
create policy events_select on public.calendar_events
  for select using (public.is_calendar_member(calendar_id));

drop policy if exists events_insert on public.calendar_events;
create policy events_insert on public.calendar_events
  for insert with check (public.is_calendar_member(calendar_id) and created_by = auth.uid());

drop policy if exists events_update on public.calendar_events;
create policy events_update on public.calendar_events
  for update using (public.is_calendar_member(calendar_id));

drop policy if exists events_delete on public.calendar_events;
create policy events_delete on public.calendar_events
  for delete using (public.is_calendar_member(calendar_id));
