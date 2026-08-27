-- Phase 8.9: Notification Preferences
-- Allows members to configure which notification channels they receive.

create table if not exists notification_preferences (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade unique,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: members can only read/update their own preferences
alter table notification_preferences enable row level security;

create policy "notification_pref_read_own"
  on notification_preferences for select
  using (member_id = auth.uid());

create policy "notification_pref_upsert_own"
  on notification_preferences for insert
  with check (member_id = auth.uid());

create policy "notification_pref_update_own"
  on notification_preferences for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- Index for fast lookup by member
create index idx_notification_preferences_member
  on notification_preferences(member_id);

-- updated_at trigger
create trigger trg_notification_preferences_updated
  before update on notification_preferences
  for each row execute function set_updated_at();
