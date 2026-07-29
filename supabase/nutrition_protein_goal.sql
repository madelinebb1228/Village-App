-- Add a daily protein target, adjusted for breastfeeding, to nutrition_profiles
-- Run in Supabase SQL editor

ALTER TABLE nutrition_profiles ADD COLUMN IF NOT EXISTS protein_goal_g numeric;
