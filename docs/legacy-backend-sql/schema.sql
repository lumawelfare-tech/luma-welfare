-- Luma Welfare — database schema
-- Supabase-compatible. Run in Supabase > SQL Editor (or via `supabase db push`).
-- Auth identity lives in auth.users; `members` holds the welfare profile.
-- Key design: subscriptions = member <-> package many-to-many. Every package
-- is tracked per member, per package. Never blend packages into one status.

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type member_status as enum ('pending_approval', 'active', 'suspended', 'closed');
create type subscription_status as enum ('pending', 'active', 'paused', 'cancelled', 'rejected');
create type contribution_status as enum ('Paid', 'Pending', 'Failed', 'Reversed', 'Late', 'Verified');
create type payment_status as enum ('Pending', 'Completed', 'Failed', 'Reversed');
create type qualification_status as enum ('eligible', 'not_eligible', 'at_risk', 'revoked');
create type claim_status as enum ('Draft', 'Submitted', 'Under Review', 'Additional Information Required', 'Approved', 'Rejected', 'Paid');
create type payout_status as enum ('Pending', 'Processing', 'Completed', 'Failed');
create type notification_status as enum ('queued', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- Packages (admin-editable — Luma has changed this list before)
-- ---------------------------------------------------------------------------
create table packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  -- Space-separated list of coverage items (e.g. "Burial support Family emergencies")
  coverage text not null default '',
  -- Empty string = "no fixed waiting period; contributions must stay current" (Welfare Package)
  -- Otherwise numeric string like "6" or "12"
  waiting_period_months text not null default '',
  is_active boolean not null default true,
  sort_order int not null default 0,
  -- Configurable payout rule, pending Luma confirmation (see open_questions).
  -- Empty string or JSON like { "kind": "flat", "amount": 100000 }
  payout_rule text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contribution tiers per package. Most packages have a single flat tier
-- (e.g. Hospital Insurance KSh 1,200/month). The Welfare Package has tiers:
-- Individual KSh 100, Nuclear Family KSh 300, Extended Family +KSh 200.
create table package_tiers (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null,
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  unique (package_id, name)
);

-- Per-package qualification rules, all admin-configurable. The qualification
-- engine reads these instead of hardcoding:
--   waiting_period_months, min_contributions, requires_current_contributions,
--   arrears_allowed_months, max_arrears_months, contribution_period_months
create table package_rules (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  key text not null,
  -- Stores string values like "12", "True", "" or JSON objects
  value text not null default '',
  description text,
  unique (package_id, key)
);

-- ---------------------------------------------------------------------------
-- Members (profiles on top of auth.users)
-- ---------------------------------------------------------------------------
create table members (
  id uuid primary key references auth.users(id) on delete cascade,
  membership_number text unique,
  full_name text not null,
  id_number text,
  phone text not null,
  alt_phone text,
  email text,
  date_of_birth date,
  county text,
  location text,
  occupation text,
  status member_status not null default 'active',
  joined_at timestamptz default now(),
  approved_at timestamptz,
  approved_by uuid,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Welfare Package tiered coverage — registered dependents
create table family_members (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  full_name text not null,
  relationship text not null, -- spouse | child | parent | sibling | other
  id_number text,
  date_of_birth date,
  -- nuclear | extended — nuclear family covered by base tier, extended adds cover
  tier text not null default 'nuclear' check (tier in ('nuclear', 'extended')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Registration Fees
-- One-time KSh 300 registration/membership activation fee.
-- A member must pay this before subscribing to welfare packages.
-- ---------------------------------------------------------------------------
create table registration_fees (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  fee_type text not null default 'registration' check (fee_type in ('registration')),
  amount numeric(12,2) not null default 300,
  currency text not null default 'KES',
  status text not null default 'unpaid' check (status in ('unpaid', 'pending', 'paid', 'failed', 'cancelled')),
  payment_method text,
  transaction_reference text,
  mpesa_receipt text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, fee_type)
);

-- ---------------------------------------------------------------------------
-- Subscriptions — member <-> package (many-to-many). Build this right first.
-- ---------------------------------------------------------------------------
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  package_id uuid not null references packages(id),
  package_tier_id uuid references package_tiers(id),
  status subscription_status not null default 'pending',
  started_at date,
  next_due_date date,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, package_id)
);

-- ---------------------------------------------------------------------------
-- Payments (M-Pesa) and contributions
-- ---------------------------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  subscription_id uuid references subscriptions(id),
  -- Package is carried through the whole STK Push chain so a callback can
  -- attribute a payment to the right package when a member holds several.
  package_id uuid references packages(id),
  amount numeric(12,2) not null,
  phone text not null,
  payment_reference text unique, -- internal reference / checkout_request_id
  mpesa_receipt text,            -- M-Pesa transaction ID
  status payment_status not null default 'Pending',
  channel text not null default 'mpesa',
  payload jsonb,                 -- raw M-Pesa callback payload
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contributions (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  member_id uuid not null references members(id),
  package_id uuid not null references packages(id),
  period text not null,          -- 'YYYY-MM' — the month the contribution covers
  amount numeric(12,2) not null,
  status contribution_status not null default 'Pending',
  payment_id uuid references payments(id),
  recorded_by uuid,              -- admin, or self-service via STK push
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, period)
);

-- ---------------------------------------------------------------------------
-- Qualifications — per package, per member
-- ---------------------------------------------------------------------------
create table qualifications (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  member_id uuid not null references members(id),
  package_id uuid not null references packages(id),
  status qualification_status not null default 'not_eligible',
  eligible_from date,
  -- Each rule the engine evaluated, and whether it passed.
  criteria_met jsonb not null default '{}',
  evaluated_at timestamptz not null default now(),
  evaluated_by uuid,
  notes text
);

-- ---------------------------------------------------------------------------
-- Claims
-- ---------------------------------------------------------------------------
create table claims (
  id uuid primary key default gen_random_uuid(),
  claim_number text not null unique,
  member_id uuid not null references members(id),
  subscription_id uuid not null references subscriptions(id),
  package_id uuid not null references packages(id),
  claim_type text,               -- medical | burial | education | business | ...
  amount_requested numeric(12,2),
  status claim_status not null default 'Draft',
  description text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table claim_documents (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  file_name text not null,
  file_url text not null, -- Supabase Storage path
  file_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Payouts
-- ---------------------------------------------------------------------------
create table payouts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id),
  member_id uuid not null references members(id),
  package_id uuid not null references packages(id),
  amount numeric(12,2) not null,
  method text not null default 'mpesa',
  status payout_status not null default 'Pending',
  reference text,
  processed_at timestamptz,
  processed_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id),
  channel text not null default 'in_app' check (channel in ('email', 'sms', 'whatsapp', 'in_app')),
  subject text,
  body text not null,
  status notification_status not null default 'queued',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Admin, roles, permissions, audit
-- ---------------------------------------------------------------------------
create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, -- superadmin | admin | finance | claims_reviewer | support
  description text
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles(id) on delete cascade,
  resource text not null, -- members | packages | contributions | payments | claims | payouts | notifications | audit_logs
  action text not null,   -- create | read | update | delete | approve | verify
  unique (role_id, resource, action)
);

create table admins (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role_id uuid not null references roles(id),
  is_superadmin boolean not null default false,
  two_factor_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,          -- admin or member id
  actor_role text,
  action text not null,   -- created | updated | approved | rejected | verified | ...
  resource text not null, -- e.g. member, contribution, claim, payout
  resource_id text,
  meta jsonb,
  ip text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Public site content + platform settings
-- ---------------------------------------------------------------------------
create table news_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  type text not null default 'news' check (type in ('news', 'event')),
  event_date date,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table gallery_items (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text not null,
  caption text,
  created_at timestamptz not null default now()
);

-- Org-level settings (contacts, confirmed stats). Only confirmed figures
-- belong here — the marketing numbers in Section 9 are deliberately absent.
create table platform_settings (
  key text primary key,
  value jsonb not null,
  description text
);

-- Section 9 tracking: open questions Luma must answer before final.
create table open_questions (
  id uuid primary key default gen_random_uuid(),
  section_number int not null,
  question text not null,
  answer text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_members_status on members(status);
create index idx_subscriptions_member on subscriptions(member_id);
create index idx_subscriptions_package on subscriptions(package_id);
create index idx_contributions_subscription on contributions(subscription_id);
create index idx_contributions_member on contributions(member_id);
create index idx_contributions_period on contributions(period);
create index idx_payments_member on payments(member_id);
create index idx_payments_status on payments(status);
create index idx_claims_member on claims(member_id);
create index idx_claims_status on claims(status);
create index idx_payouts_status on payouts(status);
create index idx_qualifications_subscription on qualifications(subscription_id);
create index idx_family_members_member on family_members(member_id);
create index idx_registration_fees_member on registration_fees(member_id);
create index idx_registration_fees_status on registration_fees(status);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['packages','package_tiers','members','family_members','subscriptions','payments','contributions','claims','payouts','admins','news_events','registration_fees']
  loop
    execute format('create trigger trg_%s_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Members can read/update their own profile. Admin operations run through
-- supabaseAdmin (service role bypasses RLS) plus app-level RBAC checks.
alter table members enable row level security;
alter table family_members enable row level security;
alter table subscriptions enable row level security;
alter table contributions enable row level security;
alter table payments enable row level security;
alter table claims enable row level security;
alter table claim_documents enable row level security;
alter table packages enable row level security;
alter table package_tiers enable row level security;
alter table notifications enable row level security;
alter table qualifications enable row level security;

create policy "members_read_own" on members for select using (id = auth.uid());
create policy "members_update_own" on members for update using (id = auth.uid()) with check (id = auth.uid());

create policy "family_read_own" on family_members for select using (member_id = auth.uid());
create policy "family_write_own" on family_members for insert with check (member_id = auth.uid());
create policy "family_update_own" on family_members for update using (member_id = auth.uid()) with check (member_id = auth.uid());

create policy "subscriptions_read_own" on subscriptions for select using (member_id = auth.uid());
create policy "contributions_read_own" on contributions for select using (member_id = auth.uid());
create policy "payments_read_own" on payments for select using (member_id = auth.uid());
create policy "claims_read_own" on claims for select using (member_id = auth.uid());
create policy "claim_documents_read_own" on claim_documents for select using (
  exists (select 1 from claims c where c.id = claim_id and c.member_id = auth.uid())
);
create policy "qualifications_read_own" on qualifications for select using (member_id = auth.uid());
create policy "notifications_read_own" on notifications for select using (member_id = auth.uid());

create policy "registration_fees_read_own" on registration_fees for select using (member_id = auth.uid());
create policy "registration_fees_insert_own" on registration_fees for insert with check (member_id = auth.uid());
-- NOTE: No UPDATE policy for members. Registration fee status can only be
-- changed by service-role (admin, M-Pesa callback). This prevents members
-- from self-marking their fee as paid.

-- Public catalog: active packages, tiers and rules are readable by anyone.
create policy "packages_public_read" on packages for select using (is_active = true);
create policy "package_tiers_public_read" on package_tiers for select using (is_active = true);
create policy "package_rules_public_read" on package_rules for select using (true);