-- Add pregnancy tracking to the Nutrition & Hydration tracker
-- Run in Supabase SQL editor

ALTER TABLE nutrition_profiles ADD COLUMN IF NOT EXISTS is_pregnant boolean DEFAULT false;
ALTER TABLE nutrition_profiles ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS folate_mcg numeric;
ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS iron_mg numeric;
ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS caffeine_mg numeric;
ALTER TABLE nutrition_saved_foods ADD COLUMN IF NOT EXISTS folate_mcg numeric;
ALTER TABLE nutrition_saved_foods ADD COLUMN IF NOT EXISTS iron_mg numeric;
ALTER TABLE nutrition_saved_foods ADD COLUMN IF NOT EXISTS caffeine_mg numeric;
