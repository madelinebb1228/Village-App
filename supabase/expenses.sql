-- Expense tracking: log baby-related spending, categorize it, and set
-- per-category monthly budgets. Baby-scoped rows are shared with every
-- linked caregiver via the is_baby_member() helper from baby_sharing.sql —
-- run that file first if it hasn't been run yet. Receipt photos reuse the
-- existing baby-photos storage bucket.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

-- ── expense_categories: shared lookup list ──────────────────────────────────

create table if not exists public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  icon       text not null default '💰',
  color      text not null default '#7C3AED',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.expense_categories (name, icon, color, is_default) values
  ('Diapers',         '🧷', '#059669', true),
  ('Formula/Feeding',  '🍼', '#7C3AED', true),
  ('Clothes',          '👕', '#DB2777', true),
  ('Gear',             '🚼', '#D97706', true),
  ('Childcare',        '🏫', '#2563EB', true),
  ('Medical',          '🩺', '#DC2626', true),
  ('Food',             '🍽️', '#65A30D', true),
  ('Toys/Books',       '🧸', '#EA580C', true),
  ('Other',            '📦', '#6B7280', true)
on conflict (name) do nothing;

-- ── expenses ─────────────────────────────────────────────────────────────────

create table if not exists public.expenses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  baby_id           uuid references public.babies(id) on delete cascade,
  category_id       uuid references public.expense_categories(id) on delete set null,
  subcategory       text,
  amount            numeric(10,2) not null check (amount > 0),
  currency          text not null default 'USD',
  description       text,
  date              date not null default current_date,
  receipt_photo_url text,
  is_recurring      boolean not null default false,
  created_at        timestamptz not null default now()
);

-- ── budgets: per-category monthly limit ─────────────────────────────────────

create table if not exists public.budgets (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  category_id           uuid not null references public.expense_categories(id) on delete cascade,
  monthly_limit         numeric(10,2) not null check (monthly_limit > 0),
  alert_threshold_percent int not null default 80 check (alert_threshold_percent between 1 and 100),
  created_at            timestamptz not null default now(),
  unique (user_id, category_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.expense_categories enable row level security;
alter table public.expenses           enable row level security;
alter table public.budgets            enable row level security;

drop policy if exists "expense_categories readable by any signed-in user" on public.expense_categories;
create policy "expense_categories readable by any signed-in user"
  on public.expense_categories for select
  using (auth.role() = 'authenticated');

-- An expense is either tied to a baby (visible to every caregiver on that
-- baby) or logged with no baby_id (visible only to the user who logged it).
drop policy if exists "expenses visible to owner or baby caregivers" on public.expenses;
create policy "expenses visible to owner or baby caregivers"
  on public.expenses for all
  using (
    (baby_id is not null and public.is_baby_member(baby_id))
    or (baby_id is null and user_id = auth.uid())
  )
  with check (
    (baby_id is not null and public.is_baby_member(baby_id))
    or (baby_id is null and user_id = auth.uid())
  );

drop policy if exists "budgets owned by user" on public.budgets;
create policy "budgets owned by user"
  on public.budgets for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_expenses_user_date   on public.expenses (user_id, date desc);
create index if not exists idx_expenses_baby_date    on public.expenses (baby_id, date desc);
create index if not exists idx_expenses_category     on public.expenses (category_id);
create index if not exists idx_budgets_user          on public.budgets (user_id);
