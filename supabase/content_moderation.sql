-- Content moderation flags
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS content_flags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content_type text NOT NULL,   -- 'post_image' | 'post_video' | 'profile_avatar' | 'baby_photo'
  flag_reason text NOT NULL,
  severity text NOT NULL DEFAULT 'high',  -- 'high' | 'extreme'
  disputed boolean DEFAULT false,
  dispute_reason text,
  disputed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE content_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can log own flags" ON content_flags
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own flags" ON content_flags
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can dispute own flags" ON content_flags
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
