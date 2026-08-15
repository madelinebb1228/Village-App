-- Add micronutrient + serving-size/quantity tracking to nutrition logs
-- Run in Supabase SQL editor

ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS sugar_g numeric;
ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS fiber_g numeric;
ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS sodium_mg numeric;
ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS cholesterol_mg numeric;
ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS serving_qty numeric DEFAULT 1;
ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS serving_label text;
ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS data_source text; -- 'manual'|'barcode'|'search'|'saved_food'|'copied'
ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS barcode text;
