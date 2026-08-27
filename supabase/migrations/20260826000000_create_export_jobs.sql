create table export_jobs (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,
  format     text not null default 'csv',
  status     text not null default 'pending', -- pending | generating | uploading | completed | failed
  file_url   text,
  row_count  integer,
  filters    jsonb not null default '{}',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);

create index idx_export_jobs_created_by on export_jobs(created_by);
create index idx_export_jobs_status on export_jobs(status);

alter table export_jobs enable row level security;

-- Only the creator can read their own export jobs
create policy "export_jobs_select_own"
  on export_jobs for select
  using (created_by = auth.uid());

-- Only admins can insert (via service role, so this is a fallback)
create policy "export_jobs_insert_admin"
  on export_jobs for insert
  with check (created_by = auth.uid());

-- Auto-delete expired exports every day via a pg_cron job or application logic
-- For now, the function sets expires_at; cleanup can be added later.
