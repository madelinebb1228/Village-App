-- Patch Matching: add matching columns to profiles
-- Run this once in the Supabase SQL editor.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kids_ages        text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS parenting_style  text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS interests        text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS looking_for      text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS match_city       text,
  ADD COLUMN IF NOT EXISTS match_state      text,
  ADD COLUMN IF NOT EXISTS matching_enabled boolean DEFAULT true;

-- Allow users to read other profiles' matching fields (already public via RLS if profiles are public)
-- No new RLS policies needed if profiles table already has SELECT allowed for authenticated users.
