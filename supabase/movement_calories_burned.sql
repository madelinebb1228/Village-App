-- Optional manual calorie override for the Movement tracker. When set, the
-- Nutrition tracker's exercise-calorie adjustment uses this value instead of
-- its MET-based estimate (lib/calorieBurn.ts) for that entry. Leaving it
-- blank keeps the automatic estimate. Also the landing spot for a future
-- Apple Watch / HealthKit sync to populate directly.
-- Run in Supabase SQL editor

ALTER TABLE mom_movement_logs ADD COLUMN IF NOT EXISTS calories_burned numeric;
