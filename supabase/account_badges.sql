-- Founder / Official account badges migration
-- Run in Supabase SQL editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_founder boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_official boolean DEFAULT false;

UPDATE profiles SET is_founder = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'madelinebb1228@gmail.com');

UPDATE profiles SET is_official = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'test@parentpatch.dev');
