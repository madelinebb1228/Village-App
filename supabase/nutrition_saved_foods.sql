-- Personal food library ("My Foods") for the Nutrition & Hydration tracker.
-- Unlike nutrition_logs (which stores per-entry TOTALS), the nutrition columns
-- here are PER UNIT (one "serving" as the user defined it) — same column
-- names, different meaning. Run in Supabase SQL editor.

create table if not exists nutrition_saved_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  brand text,
  serving_label text,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  sugar_g numeric,
  fiber_g numeric,
  sodium_mg numeric,
  cholesterol_mg numeric,
  source text not null default 'manual', -- 'manual' | 'barcode' | 'search'
  barcode text,
  created_at timestamptz not null default now()
);

create index if not exists nutrition_saved_foods_user on nutrition_saved_foods(user_id, created_at desc);

alter table nutrition_saved_foods enable row level security;
create policy "nutrition_saved_foods_own" on nutrition_saved_foods
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
