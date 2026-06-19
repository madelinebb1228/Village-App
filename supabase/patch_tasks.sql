-- Patch Tasks: neighbor-helping-neighbor requests
-- Run once in the Supabase SQL editor.

create table if not exists patch_tasks (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid not null references profiles(id) on delete cascade,
  village_id    text,                           -- null = visible to everyone
  category      text not null default 'general', -- meal_train | errand | recommendation | playdate | emergency | general
  title         text not null,
  description   text,
  urgency       text not null default 'normal', -- normal | urgent | emergency
  needed_by     timestamptz,
  status        text not null default 'open',  -- open | completed | cancelled
  created_at    timestamptz not null default now()
);

create table if not exists patch_task_volunteers (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references patch_tasks(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  message    text,
  created_at timestamptz not null default now(),
  unique(task_id, user_id)
);

-- Indexes for fast lookups
create index if not exists patch_tasks_status_idx     on patch_tasks(status);
create index if not exists patch_tasks_creator_idx    on patch_tasks(creator_id);
create index if not exists patch_task_volunteers_task on patch_task_volunteers(task_id);
create index if not exists patch_task_volunteers_user on patch_task_volunteers(user_id);

-- RLS
alter table patch_tasks           enable row level security;
alter table patch_task_volunteers enable row level security;

create policy "tasks_select"    on patch_tasks for select    to authenticated using (true);
create policy "tasks_insert"    on patch_tasks for insert    to authenticated with check (auth.uid() = creator_id);
create policy "tasks_update"    on patch_tasks for update    to authenticated using (auth.uid() = creator_id);
create policy "tasks_delete"    on patch_tasks for delete    to authenticated using (auth.uid() = creator_id);

create policy "vol_select"      on patch_task_volunteers for select to authenticated using (true);
create policy "vol_insert"      on patch_task_volunteers for insert to authenticated with check (auth.uid() = user_id);
create policy "vol_delete"      on patch_task_volunteers for delete to authenticated using (auth.uid() = user_id);
