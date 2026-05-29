create table if not exists resource_reports (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid references local_resources(id) on delete set null,
  resource_name text,
  reason text not null,
  note text,
  created_at timestamptz default now()
);
