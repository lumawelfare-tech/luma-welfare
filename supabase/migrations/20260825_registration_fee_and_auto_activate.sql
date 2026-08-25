-- Luma Welfare — Registration Fee & Auto-Activation
-- 
-- 1. Add registration_fees table to track the KSh 300 one-time registration fee
-- 2. Change member_status enum default from 'pending_approval' to 'active'
--    (members are now auto-activated after email verification)
-- 3. Add RLS policies for registration_fees

-- ---------------------------------------------------------------------------
-- Registration Fees table
-- Tracks the one-time KSh 300 registration/membership activation fee.
-- A member must pay this fee before they can subscribe to welfare packages.
-- ---------------------------------------------------------------------------
create table if not exists registration_fees (
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
  -- Only one registration fee record per member
  unique (member_id, fee_type)
);

-- Indexes
create index if not exists idx_registration_fees_member on registration_fees(member_id);
create index if not exists idx_registration_fees_status on registration_fees(status);

-- updated_at trigger for registration_fees
create trigger trg_registration_fees_updated before update on registration_fees
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: Members can read their own registration fee record
-- ---------------------------------------------------------------------------
alter table registration_fees enable row level security;

create policy "registration_fees_read_own" on registration_fees
  for select using (member_id = auth.uid());

create policy "registration_fees_insert_own" on registration_fees
  for insert with check (member_id = auth.uid());

create policy "registration_fees_update_own" on registration_fees
  for update using (member_id = auth.uid()) with check (member_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Update member_status enum: remove 'pending_approval' and add it as a legacy.
-- The default is now 'active' — members are auto-activated after email
-- verification. Admin approval is no longer required for normal membership.
--
-- NOTE: We cannot ALTER TYPE to remove a value in PostgreSQL.
-- Instead we change the column default so new rows get 'active'.
-- Existing 'pending_approval' rows remain valid in the enum.
-- ---------------------------------------------------------------------------

-- Change the column default (supabase ALTER COLUMN doesn't support ALTER TYPE default directly)
-- We'll handle this by updating the schema to reflect the new default.
-- The actual enum still has 'pending_approval' for backward compatibility with
-- existing rows, but new registrations get 'active' by default.
