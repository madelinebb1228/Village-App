-- Incremental migration: missing pieces from safety_features.sql
-- Generated from a read-only schema audit against the live database.
-- Contains ONLY: user_blocks, user_reports, comment_reports, and the
-- missing CHECK constraint on profiles.messages_from.
-- Does NOT touch user_mutes, follow_requests, or any mute_private_sensitive.sql object.
-- Run in Supabase SQL editor (or via CLI) only after manual review.

BEGIN;

-- 1. User blocks
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_blocks' AND policyname = 'Manage own blocks'
  ) THEN
    CREATE POLICY "Manage own blocks" ON user_blocks FOR ALL USING (auth.uid() = blocker_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_blocks' AND policyname = 'See if you are blocked'
  ) THEN
    CREATE POLICY "See if you are blocked" ON user_blocks FOR SELECT USING (auth.uid() = blocked_id);
  END IF;
END $$;

-- 2. User reports
CREATE TABLE IF NOT EXISTS user_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_reports' AND policyname = 'Insert own user reports'
  ) THEN
    CREATE POLICY "Insert own user reports" ON user_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_reports' AND policyname = 'View own user reports'
  ) THEN
    CREATE POLICY "View own user reports" ON user_reports FOR SELECT USING (auth.uid() = reporter_id);
  END IF;
END $$;

-- 3. Comment reports
CREATE TABLE IF NOT EXISTS comment_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comment_reports' AND policyname = 'Insert own comment reports'
  ) THEN
    CREATE POLICY "Insert own comment reports" ON comment_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comment_reports' AND policyname = 'View own comment reports'
  ) THEN
    CREATE POLICY "View own comment reports" ON comment_reports FOR SELECT USING (auth.uid() = reporter_id);
  END IF;
END $$;

-- 4. Missing CHECK constraint on profiles.messages_from
-- Column already exists live; only the constraint from safety_features.sql is missing.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_messages_from_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_messages_from_check
      CHECK (messages_from IN ('everyone', 'nobody'));
  END IF;
END $$;

COMMIT;
