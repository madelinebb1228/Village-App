-- Add onboarding_complete to profiles so returning users on a new device
-- are not forced through onboarding again.
-- Run once in the Supabase SQL Editor.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;
