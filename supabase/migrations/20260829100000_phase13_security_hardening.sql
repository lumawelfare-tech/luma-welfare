-- ============================================================================
-- PHASE 13: SECURITY, COMPLIANCE & FINANCIAL INTEGRITY HARDENING
-- Database-level constraints that prevent financial corruption at the DB layer.
-- ============================================================================

-- ============================================================================
-- 1. PAYMENT AMOUNT CONSTRAINTS
-- ============================================================================

-- Ensure payment amounts are positive and reasonable
ALTER TABLE payments
  ADD CONSTRAINT chk_payments_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT chk_payments_amount_max CHECK (amount <= 1000000);

-- Ensure contribution amounts are positive
ALTER TABLE contributions
  ADD CONSTRAINT chk_contributions_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT chk_contributions_amount_max CHECK (amount <= 1000000);

-- Ensure claim amounts are positive
ALTER TABLE claims
  ADD CONSTRAINT chk_claims_amount_positive CHECK (amount_requested > 0),
  ADD CONSTRAINT chk_claims_amount_max CHECK (amount_requested <= 10000000);

-- Ensure payout amounts are positive
ALTER TABLE payouts
  ADD CONSTRAINT chk_payouts_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT chk_payouts_amount_max CHECK (amount <= 10000000);

-- Ensure registration fee amount is exactly 300
ALTER TABLE registration_fees
  ADD CONSTRAINT chk_registration_fee_amount CHECK (amount = 300);

-- ============================================================================
-- 2. UNIQUE CONSTRAINTS FOR IDEMPOTENCY
-- ============================================================================

-- Prevent duplicate payment processing by checkout_request_id
-- (Already exists as payment_reference unique, but adding explicit constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_checkout_unique
  ON payments (payment_reference)
  WHERE payment_reference IS NOT NULL;

-- Prevent duplicate M-Pesa receipts
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_receipt_unique
  ON payments (mpesa_receipt)
  WHERE mpesa_receipt IS NOT NULL;

-- ============================================================================
-- 3. FINANCIAL STATE MACHINE ENFORCEMENT
-- ============================================================================

-- Ensure payment status transitions are valid
CREATE OR REPLACE FUNCTION validate_payment_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow valid transitions
  IF OLD.status = 'Completed' AND NEW.status IN ('Pending', 'Failed') THEN
    RAISE EXCEPTION 'Cannot transition from Completed to %', NEW.status;
  END IF;
  IF OLD.status = 'Failed' AND NEW.status = 'Completed' THEN
    RAISE EXCEPTION 'Cannot transition from Failed to Completed without admin intervention';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS trg_validate_payment_transition ON payments;
CREATE TRIGGER trg_validate_payment_transition
  BEFORE UPDATE OF status ON payments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION validate_payment_status_transition();

-- ============================================================================
-- 4. AUDIT LOG PROTECTION
-- ============================================================================

-- Prevent deletion of audit logs
CREATE OR REPLACE FUNCTION prevent_audit_log_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be deleted';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Only create if audit_logs has RLS and appropriate policies
-- (audit_logs should be append-only in production)
DROP TRIGGER IF EXISTS trg_prevent_audit_delete ON audit_logs;
CREATE TRIGGER trg_prevent_audit_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_deletion();

-- ============================================================================
-- 5. MEMBERSHIP NUMBER UNIQUENESS
-- ============================================================================

-- Ensure membership numbers are unique (already has unique constraint, but verify)
-- The schema already has: membership_number text unique
-- This is already enforced.

-- ============================================================================
-- 6. FINANCIAL RECONCILIATION FUNCTION
-- ============================================================================

-- Function to detect orphan payments (completed but no contribution)
CREATE OR REPLACE FUNCTION check_orphan_payments_v2()
RETURNS TABLE (
  payment_id uuid,
  member_id uuid,
  amount numeric,
  status text,
  created_at timestamptz,
  age_minutes numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.member_id,
    p.amount,
    p.status::text,
    p.created_at,
    EXTRACT(EPOCH FROM (now() - p.created_at)) / 60 as age_minutes
  FROM payments p
  WHERE p.status = 'Completed'
    AND NOT EXISTS (
      SELECT 1 FROM contributions c WHERE c.payment_id = p.id
    )
  ORDER BY p.created_at DESC;
$$;

-- Function to detect stale pending payments
CREATE OR REPLACE FUNCTION check_stale_pending_v2()
RETURNS TABLE (
  payment_id uuid,
  member_id uuid,
  amount numeric,
  phone text,
  created_at timestamptz,
  age_minutes numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.member_id,
    p.amount,
    p.phone,
    p.created_at,
    EXTRACT(EPOCH FROM (now() - p.created_at)) / 60 as age_minutes
  FROM payments p
  WHERE p.status = 'Pending'
    AND p.created_at < now() - INTERVAL '30 minutes'
  ORDER BY p.created_at ASC;
$$;

-- ============================================================================
-- 7. SECURITY MONITORING VIEW
-- ============================================================================

-- Quick security status view for admins
CREATE OR REPLACE FUNCTION get_security_status()
RETURNS TABLE (
  failed_logins_24h bigint,
  high_risk_admin_actions_7d bigint,
  stale_pending_payments bigint,
  orphan_payments bigint,
  audit_logs_today bigint,
  total_members bigint,
  active_admins bigint
) LANGUAGE sql STABLE AS $$
  SELECT
    (SELECT COUNT(*) FROM audit_logs
     WHERE action LIKE '%login%failed%'
       AND created_at > now() - INTERVAL '24 hours'),
    (SELECT COUNT(*) FROM audit_logs
     WHERE action IN ('role_changed', 'permission_granted', 'permission_revoked', 'admin_created', 'admin_deleted')
       AND created_at > now() - INTERVAL '7 days'),
    (SELECT COUNT(*) FROM payments
     WHERE status = 'Pending'
       AND created_at < now() - INTERVAL '30 minutes'),
    (SELECT COUNT(*) FROM check_orphan_payments_v2()),
    (SELECT COUNT(*) FROM audit_logs
     WHERE created_at > date_trunc('day', now())),
    (SELECT COUNT(*) FROM members),
    (SELECT COUNT(*) FROM admins WHERE is_active = true);
$$;
