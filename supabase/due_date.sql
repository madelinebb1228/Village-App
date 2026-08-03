-- Add due_date to babies so an expecting user's due date is actually saved
-- instead of being silently discarded (it was captured in onboarding's UI
-- but had nowhere to go).
-- Run once in the Supabase SQL Editor.
ALTER TABLE babies ADD COLUMN IF NOT EXISTS due_date date;
