-- ============================================================================
-- LUMA WELFARE — PHASE 6: FINANCIAL TRANSACTION HARDENING
--
-- Migration: Payment constraints, webhook events, atomic operations, amount validation
-- ============================================================================

-- ============================================================================
-- 1. PAYMENT STATE MACHINE ENFORCEMENT
-- Prevent invalid state transitions via database trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_payment_state_machine()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate on status change
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Valid transitions:
  -- Pending → Completed, Failed, Cancelled, Timeout
  -- (No reverse transitions allowed)
  IF OLD.status = 'Pending' AND NEW.status IN ('Completed', 'Failed', 'Cancelled', 'Timeout') THEN
    RETURN NEW;
  END IF;

  -- Failed payments can be retried (new payment created, not updated)
  -- Reversed can only happen from Completed (manual admin action)
  IF OLD.status = 'Completed' AND NEW.status = 'Reversed' THEN
    RETURN NEW;
  END IF;

  -- Reject invalid transitions
  RAISE EXCEPTION 'Invalid payment status transition: % → %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_state_machine ON payments;
CREATE TRIGGER trg_payments_state_machine
  BEFORE UPDATE OF status ON payments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_state_machine();

-- ============================================================================
-- 2. PAYMENT CONSTRAINTS
-- Ensure data integrity for financial records
-- ============================================================================

-- checkout_request_id should be unique (M-Pesa STK Push identifier)
-- This prevents duplicate callback processing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_checkout_request_id_unique'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_checkout_request_id_unique
      UNIQUE (checkout_request_id);
  END IF;
END $$;

-- mpesa_receipt should be unique (M-Pesa transaction receipt)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_mpesa_receipt_unique'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_mpesa_receipt_unique
      UNIQUE (mpesa_receipt);
  END IF;
END $$;

-- Amount must be positive (financial integrity)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_amount_positive'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_amount_positive
      CHECK (amount > 0);
  END IF;
END $$;

-- Contribution amounts must be positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contributions_amount_positive'
  ) THEN
    ALTER TABLE contributions
      ADD CONSTRAINT contributions_amount_positive
      CHECK (amount > 0);
  END IF;
END $$;

-- Payout amounts must be positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payouts_amount_positive'
  ) THEN
    ALTER TABLE payouts
      ADD CONSTRAINT payouts_amount_positive
      CHECK (amount > 0);
  END IF;
END $$;

-- Claim amounts must be positive (when specified)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'claims_amount_positive'
  ) THEN
    ALTER TABLE claims
      ADD CONSTRAINT claims_amount_positive
      CHECK (amount_requested IS NULL OR amount_requested > 0);
  END IF;
END $$;

-- ============================================================================
-- 3. WEBHOOK EVENTS TABLE
-- Track external webhook/callback events for idempotency
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,           -- 'mpesa', 'email', etc.
  event_id text NOT NULL,           -- unique event identifier from provider
  event_type text,                  -- 'stk_callback', 'c2b', etc.
  payload jsonb NOT NULL DEFAULT '{}',
  payload_hash text,                -- SHA-256 hash for deduplication
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'processed', 'failed', 'ignored')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint on provider + event_id for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_provider_event
  ON webhook_events(provider, event_id);

-- Index for finding unprocessed events
CREATE INDEX IF NOT EXISTS idx_webhook_events_status_received
  ON webhook_events(status, received_at)
  WHERE status IN ('received', 'processing');

-- ============================================================================
-- 4. ATOMIC PAYMENT CALLBACK FUNCTION
-- Processes payment callback atomically to prevent race conditions
-- ============================================================================

CREATE OR REPLACE FUNCTION process_payment_callback(
  p_checkout_request_id text,
  p_mpesa_receipt text,
  p_result_code integer,
  p_result_desc text,
  p_transaction_date text DEFAULT NULL,
  p_phone_number text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text,
  payment_id uuid,
  contribution_created boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment RECORD;
  v_current_period text;
  v_contribution_exists boolean;
BEGIN
  -- Find the payment (locks the row to prevent concurrent processing)
  SELECT id, member_id, subscription_id, package_id, amount, status
  INTO v_payment
  FROM payments
  WHERE checkout_request_id = p_checkout_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Payment not found'::text, NULL::uuid, false;
    RETURN;
  END IF;

  -- Idempotency: if already completed, skip processing
  IF v_payment.status = 'Completed' THEN
    RETURN QUERY SELECT true, 'Already processed'::text, v_payment.id, false;
    RETURN;
  END IF;

  IF p_result_code = 0 THEN
    -- Payment successful
    UPDATE payments
    SET status = 'Completed',
        mpesa_receipt = p_mpesa_receipt,
        transaction_date = p_transaction_date,
        phone = COALESCE(p_phone_number, phone)
    WHERE id = v_payment.id;

    -- Determine current period
    v_current_period := to_char(now(), 'YYYY-MM');

    -- Check if contribution already exists (idempotency)
    SELECT EXISTS(
      SELECT 1 FROM contributions
      WHERE subscription_id = v_payment.subscription_id
        AND period = v_current_period
    ) INTO v_contribution_exists;

    -- Create contribution if not exists (atomic check + insert)
    IF NOT v_contribution_exists AND v_payment.subscription_id IS NOT NULL THEN
      INSERT INTO contributions (subscription_id, member_id, package_id, period, amount, status, payment_id, recorded_by)
      VALUES (
        v_payment.subscription_id,
        v_payment.member_id,
        v_payment.package_id,
        v_current_period,
        v_payment.amount,
        'Paid',
        v_payment.id,
        v_payment.member_id
      )
      ON CONFLICT (subscription_id, period) DO NOTHING;
    END IF;

    RETURN QUERY SELECT true, 'Payment completed'::text, v_payment.id, NOT v_contribution_exists;
  ELSE
    -- Payment failed
    UPDATE payments
    SET status = 'Failed',
        failure_reason = p_result_desc
    WHERE id = v_payment.id;

    RETURN QUERY SELECT false, 'Payment failed'::text, v_payment.id, false;
  END IF;
END;
$$;

-- ============================================================================
-- 5. ATOMIC REGISTRATION FEE CALLBACK FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION process_registration_fee_callback(
  p_checkout_request_id text,
  p_mpesa_receipt text,
  p_result_code integer,
  p_result_desc text
)
RETURNS TABLE (
  success boolean,
  message text,
  member_id uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_fee RECORD;
BEGIN
  -- Find the registration fee record (lock row)
  SELECT id, member_id, status
  INTO v_fee
  FROM registration_fees
  WHERE transaction_reference = p_checkout_request_id
    AND fee_type = 'registration'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Registration fee not found'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Idempotency: if already paid, skip
  IF v_fee.status = 'paid' THEN
    RETURN QUERY SELECT true, 'Already processed'::text, v_fee.member_id;
    RETURN;
  END IF;

  IF p_result_code = 0 THEN
    -- Payment successful
    UPDATE registration_fees
    SET status = 'paid',
        mpesa_receipt = p_mpesa_receipt,
        paid_at = now()
    WHERE id = v_fee.id;

    RETURN QUERY SELECT true, 'Registration fee paid'::text, v_fee.member_id;
  ELSE
    -- Payment failed
    UPDATE registration_fees
    SET status = 'failed'
    WHERE id = v_fee.id;

    RETURN QUERY SELECT false, 'Registration fee payment failed'::text, v_fee.member_id;
  END IF;
END;
$$;

-- ============================================================================
-- 6. AUDIT LOG SIZE LIMIT
-- Prevent audit log meta from growing unbounded
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_audit_log_meta_size()
RETURNS TRIGGER AS $$
BEGIN
  -- Truncate meta to 10KB if too large
  IF pg_column_size(NEW.meta) > 10240 THEN
    NEW.meta := jsonb_build_object(
      'truncated', true,
      'original_size', pg_column_size(NEW.meta),
      'summary', NEW.meta - 'payload' - 'raw' - 'details'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_meta_size ON audit_logs;
CREATE TRIGGER trg_audit_logs_meta_size
  BEFORE INSERT ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_audit_log_meta_size();
