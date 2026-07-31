-- Persist the parent's date of birth, collected at signup for the age-gate
-- check in Auth.tsx but previously discarded (the upsert never saved it).
-- Run once in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists date_of_birth date;
