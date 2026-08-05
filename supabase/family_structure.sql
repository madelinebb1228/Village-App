-- Add family_structure to profiles so invite/UI copy (e.g. "Invite your
-- co-parent" vs "Invite a caregiver") can reflect how a user describes their
-- own household, instead of assuming a default structure.
-- Run once in the Supabase SQL editor.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS family_structure text,
  ADD COLUMN IF NOT EXISTS family_structure_custom text;
