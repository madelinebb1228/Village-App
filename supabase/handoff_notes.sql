-- Handoff notes: short caregiver-to-caregiver notes on a shared baby
-- ("left bottle in fridge, baby usually wakes at 2am"). Reuses the
-- is_baby_member() helper and membership model from baby_sharing.sql —
-- run that file first if it hasn't been run yet.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

create table if not exists public.handoff_notes (
  id         uuid primary key default gen_random_uuid(),
  baby_id    uuid not null references public.babies(id) on delete cascade,
  author_id  uuid not null references auth.users(id) on delete cascade,
  note       text not null,
  created_at timestamptz not null default now()
);

alter table public.handoff_notes enable row level security;

create index if not exists idx_handoff_notes_baby on public.handoff_notes (baby_id, created_at desc);

drop policy if exists handoff_notes_members on public.handoff_notes;
create policy handoff_notes_members on public.handoff_notes
  for all using (public.is_baby_member(baby_id))
  with check (public.is_baby_member(baby_id));
