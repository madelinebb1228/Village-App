-- Provider shares: secure, expiring, no-login-required links for sharing a
-- Doctor Visit Prep summary with a pediatrician. Only a SHA-256 hash of the
-- share token is ever stored — the raw token is returned once, from
-- create_provider_share(), and is never persisted in plaintext. RLS only
-- lets baby members read/manage their own baby's share rows (and even then
-- only the hash, not a usable token); resolving a token to data is done
-- exclusively by the provider-share-view edge function using the
-- service-role key, which bypasses RLS by design for this one narrow path.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

create extension if not exists pgcrypto;

create table if not exists public.provider_shares (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  baby_id          uuid not null references public.babies(id) on delete cascade,
  share_token_hash text not null unique,
  data_snapshot    jsonb not null,
  expires_at       timestamptz not null,
  accessed_at      timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.provider_shares enable row level security;

create index if not exists idx_provider_shares_baby   on public.provider_shares (baby_id, created_at desc);
create index if not exists idx_provider_shares_expiry on public.provider_shares (expires_at);

drop policy if exists provider_shares_select on public.provider_shares;
create policy provider_shares_select on public.provider_shares
  for select using (public.is_baby_member(baby_id));

drop policy if exists provider_shares_insert on public.provider_shares;
create policy provider_shares_insert on public.provider_shares
  for insert with check (public.is_baby_member(baby_id) and user_id = auth.uid());

drop policy if exists provider_shares_delete on public.provider_shares;
create policy provider_shares_delete on public.provider_shares
  for delete using (public.is_baby_member(baby_id));

-- ── create_provider_share: generates a high-entropy token server-side ──────
-- 192 bits of randomness (encode(gen_random_bytes(24), 'hex')) — not the
-- weaker 6-char invite-code pattern used elsewhere, since this link has no
-- authentication behind it at all, unlike a baby invite code.

create or replace function public.create_provider_share(p_baby_id uuid, p_data jsonb)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_token text;
begin
  if not public.is_baby_member(p_baby_id) then
    raise exception 'Not authorized for this baby';
  end if;
  raw_token := encode(gen_random_bytes(24), 'hex');
  insert into public.provider_shares (user_id, baby_id, share_token_hash, data_snapshot, expires_at)
  values (auth.uid(), p_baby_id, encode(digest(raw_token, 'sha256'), 'hex'), p_data, now() + interval '24 hours');
  return raw_token;
end;
$$;
