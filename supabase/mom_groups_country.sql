-- Adds a `country` column to the mom group tables so groups from any country
-- can be listed and searched (matches the Provider Reviews location model:
-- Country -> State/Region -> City).
--
-- Run this in the Supabase SQL editor BEFORE using the updated Mom Group
-- Directory screen — the search filters by country, so the column must exist.

ALTER TABLE mom_groups        ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE group_suggestions ADD COLUMN IF NOT EXISTS country text;

-- The directory was US-only before this change, so label existing rows so they
-- still show up when searching United States cities.
UPDATE mom_groups SET country = 'United States' WHERE country IS NULL;
