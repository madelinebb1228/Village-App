-- Add multi-photo support to the baby journal
-- Run in Supabase SQL editor

ALTER TABLE baby_journal ADD COLUMN IF NOT EXISTS image_urls text[];
