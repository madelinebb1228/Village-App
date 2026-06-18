-- Word Filter
-- Run in Supabase SQL editor

-- Personal word filter table
CREATE TABLE IF NOT EXISTS user_word_filters (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  word text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, word)
);
ALTER TABLE user_word_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage own word filters" ON user_word_filters
  FOR ALL USING (auth.uid() = user_id);
