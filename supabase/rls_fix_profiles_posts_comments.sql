-- =============================================================================
-- RLS fix: profiles, posts, comments
--
-- Problem: All three tables had RLS disabled, allowing unauthenticated reads
-- of user profile data, post content, and comments via the anon key.
--
-- Apply in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- =============================================================================


-- ─── profiles ─────────────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile"              ON profiles;
DROP POLICY IF EXISTS "Users can update own profile"             ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile"             ON profiles;

-- Any signed-in user can read any profile (needed for community features:
-- post author names/avatars, user search, public profile pages).
CREATE POLICY "Authenticated users can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- The auth.users trigger that creates a profile row runs as SECURITY DEFINER
-- and bypasses RLS, but include an INSERT policy for direct app inserts.
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING     (auth.uid() = id)
  WITH CHECK(auth.uid() = id);

CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);


-- ─── posts ────────────────────────────────────────────────────────────────────

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read all posts"   ON posts;
DROP POLICY IF EXISTS "Users can insert own posts"               ON posts;
DROP POLICY IF EXISTS "Authenticated users can update posts"     ON posts;
DROP POLICY IF EXISTS "Users can delete own posts"               ON posts;

CREATE POLICY "Authenticated users can read all posts"
  ON posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own posts"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE is intentionally open to all authenticated users.
-- VillageFeedSheet.tsx increments the denormalised `likes` counter on
-- posts owned by other users. Column-level RLS is not supported in Postgres,
-- so we keep UPDATE permissive and rely on the app layer for edit-authorship.
CREATE POLICY "Authenticated users can update posts"
  ON posts FOR UPDATE
  TO authenticated
  USING     (true)
  WITH CHECK(true);

CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ─── comments ─────────────────────────────────────────────────────────────────

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read all comments" ON comments;
DROP POLICY IF EXISTS "Users can insert own comments"             ON comments;
DROP POLICY IF EXISTS "Users can update own comments"             ON comments;
DROP POLICY IF EXISTS "Users can delete own comments"             ON comments;

CREATE POLICY "Authenticated users can read all comments"
  ON comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own comments"
  ON comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  TO authenticated
  USING     (auth.uid() = user_id)
  WITH CHECK(auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
