-- Add preferred_term to profiles for inclusive app copy personalization.
-- Run once in the Supabase SQL editor.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_term text DEFAULT 'Parent';
