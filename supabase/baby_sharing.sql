-- Multi-caregiver + multi-child support
--
-- Lets more than one caregiver read/write the same baby's tracker data
-- (feeds, diapers, sleep, growth, vaccines, milestones, allergens, baby
-- food, appointments, baby medications), and lets one account have more
-- than one baby. Modeled directly on shared_calendar.sql's invite-code /
-- membership pattern.
--
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent).

-- ── babies: invite code + RLS ──────────────────────────────────────────────

alter table public.babies enable row level security;

alter table public.babies
  add column if not exists invite_code text unique default upper(substr(md5(random()::text), 1, 6));

-- backfill invite codes for existing rows (the column default above only
-- applies to newly-inserted rows)
update public.babies
set invite_code = upper(substr(md5(random()::text || id::text), 1, 6))
where invite_code is null;

alter table public.babies alter column invite_code set not null;

-- ── baby_caregivers: membership table ─────────────────────────────────────

create table if not exists public.baby_caregivers (
  id         uuid primary key default gen_random_uuid(),
  baby_id    uuid not null references public.babies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'caregiver',
  created_at timestamptz not null default now(),
  unique (baby_id, user_id)
);

alter table public.baby_caregivers enable row level security;

create index if not exists idx_baby_caregivers_user on public.baby_caregivers (user_id);

-- backfill: every existing baby's owner becomes its first caregiver
insert into public.baby_caregivers (baby_id, user_id, role)
select id, user_id, 'owner' from public.babies
on conflict (baby_id, user_id) do nothing;

-- ── Membership helper (SECURITY DEFINER avoids RLS recursion) ─────────────

create or replace function public.is_baby_member(b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.baby_caregivers c
    where c.baby_id = b and c.user_id = auth.uid()
  );
$$;

-- ── Auto-add the creator as owner-caregiver ────────────────────────────────

create or replace function public.add_baby_owner_as_caregiver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.baby_caregivers (baby_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (baby_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_add_baby_owner on public.babies;
create trigger trg_add_baby_owner
  after insert on public.babies
  for each row execute function public.add_baby_owner_as_caregiver();

-- ── Join a baby by its invite code ─────────────────────────────────────────

create or replace function public.join_baby_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b uuid;
begin
  select id into b from public.babies where invite_code = upper(trim(p_code));
  if b is null then
    raise exception 'Invalid invite code';
  end if;
  insert into public.baby_caregivers (baby_id, user_id, role)
  values (b, auth.uid(), 'caregiver')
  on conflict (baby_id, user_id) do nothing;
  return b;
end;
$$;

-- ── babies RLS: members can read; only the owner can edit/delete ──────────

drop policy if exists babies_select on public.babies;
create policy babies_select on public.babies
  for select using (public.is_baby_member(id) or user_id = auth.uid());

drop policy if exists babies_insert on public.babies;
create policy babies_insert on public.babies
  for insert with check (user_id = auth.uid());

drop policy if exists babies_update on public.babies;
create policy babies_update on public.babies
  for update using (user_id = auth.uid());

drop policy if exists babies_delete on public.babies;
create policy babies_delete on public.babies
  for delete using (user_id = auth.uid());

-- ── baby_caregivers RLS ─────────────────────────────────────────────────────

drop policy if exists caregivers_select on public.baby_caregivers;
create policy caregivers_select on public.baby_caregivers
  for select using (user_id = auth.uid() or public.is_baby_member(baby_id));

drop policy if exists caregivers_insert on public.baby_caregivers;
create policy caregivers_insert on public.baby_caregivers
  for insert with check (
    exists (select 1 from public.babies b where b.id = baby_id and b.user_id = auth.uid())
  );

drop policy if exists caregivers_delete on public.baby_caregivers;
create policy caregivers_delete on public.baby_caregivers
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.babies b where b.id = baby_id and b.user_id = auth.uid())
  );

-- ── Rewrite RLS on baby-scoped tracker tables ──────────────────────────────
-- Drops every existing policy on each table (names are unknown/inconsistent
-- since these tables were created outside tracked migrations) and replaces
-- them with a single membership-based policy.

do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    'sleep_logs', 'feeds', 'diaper_logs', 'baby_food_logs',
    'growth_logs', 'allergen_records', 'vaccine_records',
    'pediatric_appointments', 'milestones'
  ]
  loop
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy "%1$s_baby_members" on public.%1$s for all using (public.is_baby_member(baby_id)) with check (public.is_baby_member(baby_id))',
      t
    );
  end loop;
end $$;

-- ── medications: add baby_id, backfill, split baby-scoped vs mom-scoped ────
-- Mom's own medications (category != 'baby') stay user_id-scoped; baby
-- medications become baby-membership-scoped like every other tracker.

alter table public.medications
  add column if not exists baby_id uuid references public.babies(id) on delete cascade;

update public.medications m
set baby_id = (
  select b.id from public.babies b where b.user_id = m.user_id order by b.id limit 1
)
where m.category = 'baby' and m.baby_id is null;

do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'medications'
  loop
    execute format('drop policy if exists %I on public.medications', pol.policyname);
  end loop;
end $$;

alter table public.medications enable row level security;

create policy "medications_access" on public.medications
  for all using (
    (category = 'baby' and baby_id is not null and public.is_baby_member(baby_id))
    or (category = 'baby' and baby_id is null and user_id = auth.uid())
    or (category != 'baby' and user_id = auth.uid())
  )
  with check (
    (category = 'baby' and baby_id is not null and public.is_baby_member(baby_id))
    or (category = 'baby' and baby_id is null and user_id = auth.uid())
    or (category != 'baby' and user_id = auth.uid())
  );
