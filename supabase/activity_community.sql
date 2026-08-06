-- Community features for developmental activities (see supabase/activities.sql):
-- "We tried it!" ratings with optional photo/video, free-text tips from other
-- parents, and tip likes. All public-read (like product_reviews /
-- bf_community_recipes) since this is shared community content, not
-- baby-private data — contrast with activity_tries.sql, which stays
-- baby-scoped. Tip reports reuse the existing community_reports table
-- (content_type = 'activity_tip') — no new report table needed.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

-- ── activity_community_ratings: "We tried it!" — one per user per activity ─

create table if not exists public.activity_community_ratings (
  id                   uuid primary key default gen_random_uuid(),
  activity_id          uuid not null references public.activities(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  author               text not null,
  difficulty_accuracy  text not null check (difficulty_accuracy in ('easier', 'as_described', 'harder')),
  baby_engagement      text not null check (baby_engagement in ('loved', 'liked', 'neutral', 'disliked')),
  would_recommend      boolean not null,
  photo_url            text,
  video_url            text,
  created_at           timestamptz not null default now(),
  unique (activity_id, user_id)
);

create index if not exists idx_activity_ratings_activity on public.activity_community_ratings (activity_id, created_at desc);

alter table public.activity_community_ratings enable row level security;

drop policy if exists activity_ratings_read_all on public.activity_community_ratings;
create policy activity_ratings_read_all on public.activity_community_ratings
  for select using (true);

drop policy if exists activity_ratings_insert_own on public.activity_community_ratings;
create policy activity_ratings_insert_own on public.activity_community_ratings
  for insert with check (user_id = auth.uid());

drop policy if exists activity_ratings_update_own on public.activity_community_ratings;
create policy activity_ratings_update_own on public.activity_community_ratings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists activity_ratings_delete_own on public.activity_community_ratings;
create policy activity_ratings_delete_own on public.activity_community_ratings
  for delete using (user_id = auth.uid());

-- ── activity_tips: free-text tips/comments from other parents ──────────────

create table if not exists public.activity_tips (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  author      text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_activity_tips_activity on public.activity_tips (activity_id, created_at desc);

alter table public.activity_tips enable row level security;

drop policy if exists activity_tips_read_all on public.activity_tips;
create policy activity_tips_read_all on public.activity_tips
  for select using (true);

drop policy if exists activity_tips_insert_own on public.activity_tips;
create policy activity_tips_insert_own on public.activity_tips
  for insert with check (user_id = auth.uid());

drop policy if exists activity_tips_delete_own on public.activity_tips;
create policy activity_tips_delete_own on public.activity_tips
  for delete using (user_id = auth.uid());

-- ── activity_tip_likes: one like per user per tip ───────────────────────────
-- Like counts are derived by counting rows here (grouped by tip_id) rather
-- than a denormalized counter column, so there's nothing to drift out of sync.

create table if not exists public.activity_tip_likes (
  tip_id     uuid not null references public.activity_tips(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tip_id, user_id)
);

alter table public.activity_tip_likes enable row level security;

drop policy if exists activity_tip_likes_read_all on public.activity_tip_likes;
create policy activity_tip_likes_read_all on public.activity_tip_likes
  for select using (true);

drop policy if exists activity_tip_likes_insert_own on public.activity_tip_likes;
create policy activity_tip_likes_insert_own on public.activity_tip_likes
  for insert with check (user_id = auth.uid());

drop policy if exists activity_tip_likes_delete_own on public.activity_tip_likes;
create policy activity_tip_likes_delete_own on public.activity_tip_likes
  for delete using (user_id = auth.uid());
