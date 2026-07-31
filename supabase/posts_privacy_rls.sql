-- Enforce profiles.is_private: a private account's posts are visible only
-- to the author and their followers, instead of every authenticated user.
--
-- Matches the app's existing follow model: accepting a row in
-- follow_requests (see mute_private_sensitive.sql) inserts a row into
-- follows(follower_id, following_id) -- see Profile.tsx handleFollowRequest.
--
-- Run once in the Supabase SQL Editor, after rls_fix_profiles_posts_comments.sql
-- and mute_private_sensitive.sql (both already applied).

drop policy if exists "Authenticated users can read all posts" on public.posts;

create policy "Posts respect author privacy"
  on public.posts for select
  to authenticated
  using (
    user_id = auth.uid()
    or not exists (
      select 1 from public.profiles p
      where p.id = posts.user_id and coalesce(p.is_private, false) = true
    )
    or exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = posts.user_id
    )
  );
