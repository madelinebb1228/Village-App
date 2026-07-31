-- Community-submitted video guide suggestions for the Resources > Video
-- Guides screen (replaces the "coming soon" placeholder). Users submit a
-- link; review/approval happens manually in the Supabase dashboard for now.
-- Run once in the Supabase SQL Editor.

create table if not exists public.video_guide_suggestions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  title      text not null,
  url        text not null,
  category   text,
  note       text,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.video_guide_suggestions enable row level security;

drop policy if exists "Users can suggest a video" on public.video_guide_suggestions;
create policy "Users can suggest a video"
  on public.video_guide_suggestions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can see their own suggestions" on public.video_guide_suggestions;
create policy "Users can see their own suggestions"
  on public.video_guide_suggestions for select
  to authenticated
  using (auth.uid() = user_id);
