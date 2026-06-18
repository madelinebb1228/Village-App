-- Mute, Private Accounts, and Sensitive Content
-- Run in Supabase SQL editor

-- 1. User mutes
CREATE TABLE IF NOT EXISTS user_mutes (
  muter_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id)
);
ALTER TABLE user_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage own mutes" ON user_mutes FOR ALL USING (auth.uid() = muter_id);

-- 2. Private account flag on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;

-- 3. Follow requests (for private accounts)
CREATE TABLE IF NOT EXISTS follow_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (requester_id, target_id)
);
ALTER TABLE follow_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "See own follow requests" ON follow_requests
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = target_id);
CREATE POLICY "Send follow requests" ON follow_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Manage received requests" ON follow_requests
  FOR UPDATE USING (auth.uid() = target_id);
CREATE POLICY "Delete own requests" ON follow_requests
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = target_id);

-- 4. Sensitive content on posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_sensitive boolean DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS sensitive_label text;
