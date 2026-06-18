-- Safety features migration
-- Run in Supabase SQL editor

-- 1. User blocks
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage own blocks" ON user_blocks FOR ALL USING (auth.uid() = blocker_id);
CREATE POLICY "See if you are blocked" ON user_blocks FOR SELECT USING (auth.uid() = blocked_id);

-- 2. User reports
CREATE TABLE IF NOT EXISTS user_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Insert own user reports" ON user_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "View own user reports" ON user_reports FOR SELECT USING (auth.uid() = reporter_id);

-- 3. Comment reports
CREATE TABLE IF NOT EXISTS comment_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Insert own comment reports" ON comment_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "View own comment reports" ON comment_reports FOR SELECT USING (auth.uid() = reporter_id);

-- 4. Baby info privacy flag on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS baby_info_private boolean DEFAULT false;

-- 5. Messages-from preference on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS messages_from text DEFAULT 'everyone' CHECK (messages_from IN ('everyone', 'nobody'));
