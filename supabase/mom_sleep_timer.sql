-- Add live-timer support (Start Nap / Start Night Sleep) to the Your Sleep tracker.
-- A row with started_at set and duration_minutes still null means the sleep is in progress.
-- Run in Supabase SQL editor

ALTER TABLE mom_sleep_logs ADD COLUMN IF NOT EXISTS started_at timestamptz;
