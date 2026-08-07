-- Relationship connection: couple linking, "Send Kudos" appreciation
-- messages, and the "Us Time" together-time log. MVP slice of the larger
-- relationship-health feature set (weekly check-ins, division of labor,
-- intimacy tracker, and fighting-fair tools are not part of this file and
-- will land as separate migrations later).
--
-- Unlike every other tracker table, sharing here can't be anchored on
-- baby_caregivers/baby_id (relationship features should work even for
-- expecting parents with no baby yet), so this introduces a small
-- couples/couple_members linking table modeled directly on baby_sharing.sql's
-- invite-code pattern. Run baby_sharing.sql and notifications.sql first if
-- they haven't been run yet.
--
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

-- ── couples: one row per relationship, owned by its creator ────────────────

create table if not exists public.couples (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  invite_code text unique not null default upper(substr(md5(random()::text), 1, 6)),
  created_at  timestamptz not null default now()
);

-- ── couple_members: membership table ────────────────────────────────────────

create table if not exists public.couple_members (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'partner',
  created_at timestamptz not null default now(),
  unique (couple_id, user_id)
);

create index if not exists idx_couple_members_user on public.couple_members (user_id);

-- ── Membership + partner helpers (SECURITY DEFINER avoids RLS recursion) ───

create or replace function public.is_couple_member(cpl uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.couple_members m
    where m.couple_id = cpl and m.user_id = auth.uid()
  );
$$;

create or replace function public.are_partners(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.couple_members m1
    join public.couple_members m2 on m1.couple_id = m2.couple_id
    where m1.user_id = a and m2.user_id = b and a <> b
  );
$$;

-- ── Auto-add the creator as owner-member ────────────────────────────────────

create or replace function public.add_couple_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.couple_members (couple_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (couple_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_add_couple_owner on public.couples;
create trigger trg_add_couple_owner
  after insert on public.couples
  for each row execute function public.add_couple_owner_as_member();

-- ── Join a couple by its invite code ────────────────────────────────────────

create or replace function public.join_couple_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cpl uuid;
begin
  select id into cpl from public.couples where invite_code = upper(trim(p_code));
  if cpl is null then
    raise exception 'Invalid invite code';
  end if;
  insert into public.couple_members (couple_id, user_id, role)
  values (cpl, auth.uid(), 'partner')
  on conflict (couple_id, user_id) do nothing;
  return cpl;
end;
$$;

-- ── couples / couple_members RLS ────────────────────────────────────────────

alter table public.couples enable row level security;
alter table public.couple_members enable row level security;

drop policy if exists couples_select on public.couples;
create policy couples_select on public.couples
  for select using (public.is_couple_member(id) or user_id = auth.uid());

drop policy if exists couples_insert on public.couples;
create policy couples_insert on public.couples
  for insert with check (user_id = auth.uid());

drop policy if exists couples_delete on public.couples;
create policy couples_delete on public.couples
  for delete using (user_id = auth.uid());

drop policy if exists couple_members_select on public.couple_members;
create policy couple_members_select on public.couple_members
  for select using (user_id = auth.uid() or public.is_couple_member(couple_id));

drop policy if exists couple_members_insert on public.couple_members;
create policy couple_members_insert on public.couple_members
  for insert with check (
    exists (select 1 from public.couples c where c.id = couple_id and c.user_id = auth.uid())
  );

drop policy if exists couple_members_delete on public.couple_members;
create policy couple_members_delete on public.couple_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.couples c where c.id = couple_id and c.user_id = auth.uid())
  );

-- ── appreciation_messages: "Send Kudos" ─────────────────────────────────────

create table if not exists public.appreciation_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  message      text not null,
  sent_at      timestamptz not null default now(),
  read_at      timestamptz
);

alter table public.appreciation_messages enable row level security;

drop policy if exists "appreciation visible to sender or recipient" on public.appreciation_messages;
create policy "appreciation visible to sender or recipient"
  on public.appreciation_messages for select
  using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "appreciation sent only to a real partner" on public.appreciation_messages;
create policy "appreciation sent only to a real partner"
  on public.appreciation_messages for insert
  with check (sender_id = auth.uid() and public.are_partners(sender_id, recipient_id));

drop policy if exists "recipient can mark appreciation read" on public.appreciation_messages;
create policy "recipient can mark appreciation read"
  on public.appreciation_messages for update
  using (recipient_id = auth.uid());

drop policy if exists "sender or recipient can delete appreciation" on public.appreciation_messages;
create policy "sender or recipient can delete appreciation"
  on public.appreciation_messages for delete
  using (sender_id = auth.uid() or recipient_id = auth.uid());

create index if not exists idx_appreciation_recipient on public.appreciation_messages (recipient_id, sent_at desc);
create index if not exists idx_appreciation_sender    on public.appreciation_messages (sender_id, sent_at desc);

-- ── couple_activities: "Us Time" log ────────────────────────────────────────

create table if not exists public.couple_activities (
  id               uuid primary key default gen_random_uuid(),
  couple_id        uuid not null references public.couples(id) on delete cascade,
  logged_by        uuid not null references auth.users(id) on delete cascade,
  activity_type    text not null default 'together_time',
  note             text,
  completed_at     timestamptz not null default now(),
  duration_minutes int,
  created_at       timestamptz not null default now()
);

alter table public.couple_activities enable row level security;

drop policy if exists "couple activities visible to couple members" on public.couple_activities;
create policy "couple activities visible to couple members"
  on public.couple_activities for all
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id));

create index if not exists idx_couple_activities_couple_date on public.couple_activities (couple_id, completed_at desc);

-- ── Notifications integration: widen the existing table for 'kudos' ────────

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'mention', 'kudos'));

alter table public.notifications add column if not exists kudos_id uuid references public.appreciation_messages(id) on delete cascade;
alter table public.notifications add column if not exists kudos_preview text;

create or replace function public.notify_on_kudos()
returns trigger as $$
begin
  insert into public.notifications (user_id, actor_id, type, kudos_id, kudos_preview)
  values (new.recipient_id, new.sender_id, 'kudos', new.id, left(new.message, 100));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_kudos_inserted on public.appreciation_messages;
create trigger on_kudos_inserted
  after insert on public.appreciation_messages
  for each row execute function public.notify_on_kudos();
