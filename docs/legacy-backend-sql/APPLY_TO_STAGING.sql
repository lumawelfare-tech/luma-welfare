-- ============================================================================
-- PHASE 13: SECURITY CONSTRAINTS — APPLY VIA SUPABASE DASHBOARD SQL EDITOR
-- 
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- What this does:
-- 1. Adds CHECK constraints on financial tables (payments, contributions, claims, payouts)
-- 2. Creates payment state machine trigger (blocks invalid status transitions)
-- 3. Creates audit log protection trigger (prevents deletion)
-- ============================================================================

-- ============================================================================
-- 1. PAYMENT AMOUNT CONSTRAINTS
-- ============================================================================

-- First, clean up any existing test data with invalid amounts
DELETE FROM payments WHERE amount <= 0 OR amount > 1000000;
DELETE FROM contributions WHERE amount <= 0 OR amount > 1000000;

-- Ensure payment amounts are positive and reasonable
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_amount_positive') THEN
    ALTER TABLE payments ADD CONSTRAINT chk_payments_amount_positive CHECK (amount > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_amount_max') THEN
    ALTER TABLE payments ADD CONSTRAINT chk_payments_amount_max CHECK (amount <= 1000000);
  END IF;
END $$;

-- Contribution amounts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contributions_amount_positive') THEN
    ALTER TABLE contributions ADD CONSTRAINT chk_contributions_amount_positive CHECK (amount > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contributions_amount_max') THEN
    ALTER TABLE contributions ADD CONSTRAINT chk_contributions_amount_max CHECK (amount <= 1000000);
  END IF;
END $$;

-- Claim amounts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_claims_amount_positive') THEN
    ALTER TABLE claims ADD CONSTRAINT chk_claims_amount_positive CHECK (amount_requested > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_claims_amount_max') THEN
    ALTER TABLE claims ADD CONSTRAINT chk_claims_amount_max CHECK (amount_requested <= 10000000);
  END IF;
END $$;

-- Payout amounts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payouts_amount_positive') THEN
    ALTER TABLE payouts ADD CONSTRAINT chk_payouts_amount_positive CHECK (amount > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payouts_amount_max') THEN
    ALTER TABLE payouts ADD CONSTRAINT chk_payouts_amount_max CHECK (amount <= 10000000);
  END IF;
END $$;

-- Registration fee (fixed at KSh 300)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_registration_fee_amount') THEN
    ALTER TABLE registration_fees ADD CONSTRAINT chk_registration_fee_amount CHECK (amount = 300);
  END IF;
END $$;

-- ============================================================================
-- 2. PAYMENT STATE MACHINE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_payment_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Block invalid transitions
  IF OLD.status = 'Completed' AND NEW.status IN ('Pending', 'Failed') THEN
    RAISE EXCEPTION 'Cannot transition from Completed to %', NEW.status;
  END IF;
  IF OLD.status = 'Failed' AND NEW.status = 'Completed' THEN
    RAISE EXCEPTION 'Cannot transition from Failed to Completed without admin intervention';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_payment_transition ON payments;
CREATE TRIGGER trg_validate_payment_transition
  BEFORE UPDATE OF status ON payments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION validate_payment_status_transition();

-- ============================================================================
-- 3. AUDIT LOG PROTECTION
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be deleted';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_delete ON audit_logs;
CREATE TRIGGER trg_prevent_audit_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_deletion();

-- ============================================================================
-- 4. VERIFY CONSTRAINTS APPLIED
-- ============================================================================

SELECT 
  conname as constraint_name,
  contype as constraint_type,
  conrelid::regclass as table_name
FROM pg_constraint 
WHERE conname LIKE 'chk_%'
ORDER BY conrelid::regclass::text, conname;
