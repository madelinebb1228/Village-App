-- Allow more than one mood/energy check-in per day
-- Run in Supabase SQL editor

ALTER TABLE mom_mood_logs DROP CONSTRAINT IF EXISTS mom_mood_logs_user_id_logged_date_key;
