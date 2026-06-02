-- Service Provider Reviews by City
-- Run this in the Supabase SQL Editor.
-- Powers screens/ServiceProviderReviews.tsx — a community directory of local
-- service providers (pediatricians, daycares, doulas, etc.) scoped by city,
-- with parent-submitted star reviews.

-- ── Providers (community-added, scoped by city) ──────────────────────────────
create table if not exists service_providers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null,
  city        text not null,
  state       text,
  country     text not null default 'United States',
  address     text,
  phone       text,
  website     text,
  created_by  uuid references auth.users (id) on delete set null,
  author      text,
  created_at  timestamptz not null default now()
);

-- ── Reviews (one row per parent review) ──────────────────────────────────────
create table if not exists service_provider_reviews (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references service_providers (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  author      text,
  rating      int  not null check (rating between 1 and 5),
  content     text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_service_providers_loc
  on service_providers (country, state, city, category);
create index if not exists idx_service_provider_reviews_provider
  on service_provider_reviews (provider_id);

-- ── Row level security ───────────────────────────────────────────────────────
alter table service_providers        enable row level security;
alter table service_provider_reviews enable row level security;

-- Anyone (incl. anon) can read providers + reviews
create policy "providers_read"
  on service_providers for select using (true);
create policy "provider_reviews_read"
  on service_provider_reviews for select using (true);

-- Signed-in users can add, as themselves
create policy "providers_insert"
  on service_providers for insert with check (auth.uid() = created_by);
create policy "provider_reviews_insert"
  on service_provider_reviews for insert with check (auth.uid() = user_id);

-- Users can remove their own contributions
create policy "providers_delete_own"
  on service_providers for delete using (auth.uid() = created_by);
create policy "provider_reviews_delete_own"
  on service_provider_reviews for delete using (auth.uid() = user_id);
