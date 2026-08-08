-- Add tour_seen to profiles so returning users on a new device/browser
-- are not shown the coach-mark tour again (mirrors onboarding_complete.sql).
-- Run once in the Supabase SQL Editor.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tour_seen boolean DEFAULT false;
