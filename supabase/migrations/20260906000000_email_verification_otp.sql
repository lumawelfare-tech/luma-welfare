-- ============================================================================
-- EMAIL VERIFICATION OTP (production-grade)
--
-- Adds the `email_verifications` table backing the 6-digit OTP email
-- verification flow. Security properties:
--
--   - OTPs are NEVER stored in plaintext: only an HMAC-SHA256 hash computed
--     server-side with a dedicated secret (OTP_HASH_SECRET, or a value derived
--     from the service role key when that secret is absent).
--   - One ACTIVE verification per user (unique user_id, upsert semantics).
--   - Codes expire after 10 minutes, max 5 verification attempts per code,
--     resend cooldown 60s, max 3 resends per rolling hour (enforced by the
--     auth-verify-email Edge Function using the hourly_* columns).
--   - Single-use: verified_at is set once; concurrent verifies are idempotent.
--   - RLS enabled with NO policies: only the service role (Edge Functions)
--     can read/write. Clients have no direct access whatsoever.
--   - Hardening: blocks members from escalating their own `members.status`
--     (the members_update_own policy allows row updates; activation must be
--     server-authoritative via the verification flow).
-- ============================================================================

create table if not exists public.email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  hourly_count integer not null default 1 check (hourly_count >= 0),
  hourly_window_start timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.email_verifications is
  'Server-side OTP email verification codes. HMAC-hashed, 10-minute TTL, single-use. Service role only.';

-- ── RLS: no policies — service role exclusively ─────────────────────────────
alter table public.email_verifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'email_verifications'
  ) then
    raise notice 'email_verifications: no policies — anon/authenticated have no access';
  end if;
end $$;

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_email_verifications_email
  on public.email_verifications (email);
create index if not exists idx_email_verifications_cleanup
  on public.email_verifications (created_at);

-- ── updated_at trigger (matches existing convention) ─────────────────────────
drop trigger if exists trg_email_verifications_updated_at on public.email_verifications;
create trigger trg_email_verifications_updated_at
  before update on public.email_verifications
  for each row execute function set_updated_at();

-- ── Retention: purge resolved/stale verification rows ────────────────────────
-- Verified rows are audit-redundant (audit_logs keeps the trail); unverified
-- rows past expiry are dead. 7-day grace keeps forensic data for support.
create or replace function public.cleanup_old_email_verifications(
  p_batch_size integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with deleted as (
    delete from public.email_verifications
    where id in (
      select id from public.email_verifications
      where verified_at is not null
         or expires_at < now() - interval '7 days'
      order by created_at
      limit greatest(p_batch_size, 1)
    )
  )
  select count(*) into v_deleted from deleted;
  return v_deleted;
end;
$$;

-- ── Hardening: server-authoritative member activation ────────────────────────
-- members_update_own lets a member update their own row. This trigger blocks
-- status self-escalation (e.g. pending_approval -> active) so activation can
-- only happen through the service-role verification flow.
create or replace function public.prevent_member_status_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Member status can only be changed by the server'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_members_protect_status on members;
create trigger trg_members_protect_status
  before update on members
  for each row execute function public.prevent_member_status_self_update();

-- Re-assert the (unchanged) members self-update policy intent in comments.
comment on policy "members_update_own" on members is
  'Row-scoped profile edits. Column-sensitive fields (status) are guarded by trg_members_protect_status — activation is server-side only.';
