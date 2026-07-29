-- Add macro tracking to nutrition logs
-- Run in Supabase SQL editor

ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS protein_g numeric;
ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS carbs_g numeric;
ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS fat_g numeric;
