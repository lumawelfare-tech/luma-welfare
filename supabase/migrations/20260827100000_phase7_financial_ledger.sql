-- ============================================================================
-- LUMA WELFARE — PHASE 7: FINANCIAL LEDGER, RECONCILIATION & PAYMENT HARDENING
-- ============================================================================

-- ============================================================================
-- 1. FINANCIAL LEDGER TABLE
-- Immutable record of all financial movements.
-- Never delete completed ledger entries.
-- ============================================================================

CREATE TABLE IF NOT EXISTS financial_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,           -- references payments.id, registration_fees.id, or payouts.id
  transaction_type text NOT NULL           -- 'payment', 'registration_fee', 'contribution', 'payout', 'reversal', 'adjustment'
    CHECK (transaction_type IN ('payment', 'registration_fee', 'contribution', 'payout', 'reversal', 'adjustment')),
  member_id uuid NOT NULL REFERENCES members(id),
  entry_type text NOT NULL                 -- 'credit' (money in) or 'debit' (money out)
    CHECK (entry_type IN ('credit', 'debit')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'KES',
  reference text,                          -- M-Pesa receipt, admin reference, etc.
  description text NOT NULL,
  metadata jsonb DEFAULT '{}',             -- safe metadata (no secrets)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for ledger queries
CREATE INDEX IF NOT EXISTS idx_financial_ledger_member ON financial_ledger(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_transaction ON financial_ledger(transaction_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_type_date ON financial_ledger(transaction_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_created ON financial_ledger(created_at DESC);

-- RLS: members see own ledger, admins see all (via service role)
ALTER TABLE financial_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_read_own" ON financial_ledger
  FOR SELECT USING ((SELECT auth.uid()) = member_id);

-- ============================================================================
-- 2. RECONCILIATION EXCEPTIONS TABLE
-- Tracks mismatches between expected and actual financial state.
-- ============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_type text NOT NULL             -- 'amount_mismatch', 'missing_contribution', 'missing_payment', 'duplicate', 'orphaned'
    CHECK (exception_type IN ('amount_mismatch', 'missing_contribution', 'missing_payment', 'duplicate', 'orphaned')),
  severity text NOT NULL DEFAULT 'warning' -- 'info', 'warning', 'critical'
    CHECK (severity IN ('info', 'warning', 'critical')),
  transaction_id uuid,                     -- related payment/claim/payout
  member_id uuid REFERENCES members(id),
  payment_id uuid REFERENCES payments(id),
  contribution_id uuid REFERENCES contributions(id),
  expected_amount numeric(12,2),
  actual_amount numeric(12,2),
  description text NOT NULL,
  metadata jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'open'      -- 'open', 'investigating', 'resolved', 'ignored'
    CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON reconciliation_exceptions(status, created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_reconciliation_member ON reconciliation_exceptions(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_payment ON reconciliation_exceptions(payment_id) WHERE payment_id IS NOT NULL;

-- RLS: admins only (via service role)
ALTER TABLE reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
-- No member access to reconciliation — admin-only via service role

-- ============================================================================
-- 3. PAYMENT TIMELINE TABLE
-- Records every state change for full traceability.
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_type text NOT NULL                 -- 'initiated', 'stk_sent', 'callback_received', 'verified', 'completed', 'failed', 'reconciled'
    CHECK (event_type IN ('initiated', 'stk_sent', 'callback_received', 'verified', 'completed', 'failed', 'reconciled', 'adjusted')),
  status_before text,
  status_after text,
  actor text NOT NULL DEFAULT 'system',    -- 'system', 'member', 'admin', 'mpesa_callback', 'reconciliation_worker'
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_timeline_payment ON payment_timeline(payment_id, created_at ASC);

-- ============================================================================
-- 4. ENHANCED PAYMENT CALLBACK WITH AMOUNT VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION process_payment_callback_v2(
  p_checkout_request_id text,
  p_mpesa_receipt text,
  p_result_code integer,
  p_result_desc text,
  p_amount numeric DEFAULT NULL,           -- amount from M-Pesa callback
  p_transaction_date text DEFAULT NULL,
  p_phone_number text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text,
  payment_id uuid,
  contribution_created boolean,
  amount_mismatch boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment RECORD;
  v_current_period text;
  v_contribution_exists boolean;
  v_amount_mismatch boolean := false;
BEGIN
  -- Find the payment (locks the row to prevent concurrent processing)
  SELECT id, member_id, subscription_id, package_id, amount, status
  INTO v_payment
  FROM payments
  WHERE checkout_request_id = p_checkout_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Payment not found'::text, NULL::uuid, false, false;
    RETURN;
  END IF;

  -- Idempotency: if already completed, skip processing
  IF v_payment.status = 'Completed' THEN
    RETURN QUERY SELECT true, 'Already processed'::text, v_payment.id, false, false;
    RETURN;
  END IF;

  -- Amount validation: compare expected vs actual
  IF p_result_code = 0 AND p_amount IS NOT NULL THEN
    IF p_amount != v_payment.amount THEN
      v_amount_mismatch := true;
      -- Create reconciliation exception
      INSERT INTO reconciliation_exceptions (
        exception_type, severity, payment_id, member_id,
        expected_amount, actual_amount, description, metadata
      ) VALUES (
        'amount_mismatch', 'critical', v_payment.id, v_payment.member_id,
        v_payment.amount, p_amount,
        format('Payment amount mismatch: expected %s, received %s', v_payment.amount, p_amount),
        jsonb_build_object('checkout_request_id', p_checkout_request_id, 'mpesa_receipt', p_mpesa_receipt)
      );

      -- Do NOT automatically credit — flag for manual review
      UPDATE payments
      SET status = 'Failed',
          failure_reason = format('Amount mismatch: expected %s, received %s', v_payment.amount, p_amount)
      WHERE id = v_payment.id;

      -- Record timeline event
      INSERT INTO payment_timeline (payment_id, event_type, status_before, status_after, actor, description)
      VALUES (v_payment.id, 'callback_received', v_payment.status, 'Failed', 'mpesa_callback', 'Amount mismatch - flagged for review');

      RETURN QUERY SELECT false, 'Amount mismatch - flagged for review'::text, v_payment.id, false, true;
      RETURN;
    END IF;
  END IF;

  IF p_result_code = 0 THEN
    -- Payment successful
    UPDATE payments
    SET status = 'Completed',
        mpesa_receipt = p_mpesa_receipt,
        transaction_date = p_transaction_date,
        phone = COALESCE(p_phone_number, phone)
    WHERE id = v_payment.id;

    -- Record timeline
    INSERT INTO payment_timeline (payment_id, event_type, status_before, status_after, actor, description, metadata)
    VALUES (v_payment.id, 'completed', v_payment.status, 'Completed', 'mpesa_callback', 'Payment completed', jsonb_build_object('mpesa_receipt', p_mpesa_receipt));

    -- Create financial ledger entry (credit)
    INSERT INTO financial_ledger (transaction_id, transaction_type, member_id, entry_type, amount, reference, description)
    VALUES (v_payment.id, 'payment', v_payment.member_id, 'credit', v_payment.amount, p_mpesa_receipt, 'M-Pesa payment received');

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

      -- Create ledger entry for contribution
      INSERT INTO financial_ledger (transaction_id, transaction_type, member_id, entry_type, amount, reference, description)
      VALUES (v_payment.id, 'contribution', v_payment.member_id, 'credit', v_payment.amount, p_mpesa_receipt, format('Contribution for %s', v_current_period));
    END IF;

    RETURN QUERY SELECT true, 'Payment completed'::text, v_payment.id, NOT v_contribution_exists, false;
  ELSE
    -- Payment failed
    UPDATE payments
    SET status = 'Failed',
        failure_reason = p_result_desc
    WHERE id = v_payment.id;

    -- Record timeline
    INSERT INTO payment_timeline (payment_id, event_type, status_before, status_after, actor, description, metadata)
    VALUES (v_payment.id, 'failed', v_payment.status, 'Failed', 'mpesa_callback', format('Payment failed: %s', p_result_desc), jsonb_build_object('result_code', p_result_code));

    RETURN QUERY SELECT false, 'Payment failed'::text, v_payment.id, false, false;
  END IF;
END;
$$;

-- ============================================================================
-- 5. PAYMENT TIMELINE RECORDING FOR INITIATION
-- ============================================================================

CREATE OR REPLACE FUNCTION record_payment_initiation(
  p_payment_id uuid,
  p_checkout_request_id text,
  p_actor text DEFAULT 'member'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO payment_timeline (payment_id, event_type, status_before, status_after, actor, description, metadata)
  VALUES (p_payment_id, 'initiated', NULL, 'Pending', p_actor, 'Payment initiated', jsonb_build_object('checkout_request_id', p_checkout_request_id));
END;
$$;

-- ============================================================================
-- 6. RECONCILIATION QUERY FUNCTION
-- Finds unmatched payments, missing contributions, and orphaned records.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_reconciliation_summary()
RETURNS TABLE (
  total_payments bigint,
  completed_payments bigint,
  pending_payments bigint,
  failed_payments bigint,
  total_contributions bigint,
  paid_contributions bigint,
  pending_contributions bigint,
  payments_without_contributions bigint,
  contributions_without_payments bigint,
  open_exceptions bigint,
  total_amount_received numeric,
  total_amount_contributed numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    (SELECT COUNT(*) FROM payments),
    (SELECT COUNT(*) FROM payments WHERE status = 'Completed'),
    (SELECT COUNT(*) FROM payments WHERE status = 'Pending'),
    (SELECT COUNT(*) FROM payments WHERE status = 'Failed'),
    (SELECT COUNT(*) FROM contributions),
    (SELECT COUNT(*) FROM contributions WHERE status IN ('Paid', 'Verified')),
    (SELECT COUNT(*) FROM contributions WHERE status = 'Pending'),
    -- Payments without matching contributions
    (SELECT COUNT(*) FROM payments p
     WHERE p.status = 'Completed'
     AND NOT EXISTS (
       SELECT 1 FROM contributions c
       WHERE c.payment_id = p.id
     )),
    -- Contributions without matching payments
    (SELECT COUNT(*) FROM contributions c
     WHERE c.payment_id IS NULL
     AND c.status = 'Paid'),
    -- Open reconciliation exceptions
    (SELECT COUNT(*) FROM reconciliation_exceptions WHERE status = 'open'),
    -- Financial totals
    (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'Completed'),
    (SELECT COALESCE(SUM(amount), 0) FROM contributions WHERE status IN ('Paid', 'Verified'));
$$;

-- ============================================================================
-- 7. PAYMENT TIMELINE QUERY
-- Returns full timeline for a specific payment.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_payment_timeline(p_payment_id uuid)
RETURNS TABLE (
  event_type text,
  status_before text,
  status_after text,
  actor text,
  description text,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT
    pt.event_type,
    pt.status_before,
    pt.status_after,
    pt.actor,
    pt.description,
    pt.metadata,
    pt.created_at
  FROM payment_timeline pt
  WHERE pt.payment_id = p_payment_id
  ORDER BY pt.created_at ASC;
$$;

-- ============================================================================
-- 8. BACKGROUND RECONCILIATION FUNCTION
-- Finds pending payments older than X minutes and flags them.
-- ============================================================================

CREATE OR REPLACE FUNCTION flag_stale_pending_payments(
  p_stale_minutes integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
  v_payment RECORD;
BEGIN
  FOR v_payment IN
    SELECT id, member_id, amount, created_at
    FROM payments
    WHERE status = 'Pending'
    AND created_at < now() - (p_stale_minutes || ' minutes')::interval
    AND NOT EXISTS (
      SELECT 1 FROM reconciliation_exceptions
      WHERE payment_id = payments.id AND status = 'open'
    )
  LOOP
    -- Create reconciliation exception for stale pending payment
    INSERT INTO reconciliation_exceptions (
      exception_type, severity, payment_id, member_id,
      expected_amount, description, metadata
    ) VALUES (
      'missing_contribution', 'warning', v_payment.id, v_payment.member_id,
      v_payment.amount,
      format('Payment pending for over %s minutes without callback', p_stale_minutes),
      jsonb_build_object('stale_minutes', p_stale_minutes, 'payment_created_at', v_payment.created_at)
    );

    -- Record timeline
    INSERT INTO payment_timeline (payment_id, event_type, status_before, status_after, actor, description)
    VALUES (v_payment.id, 'reconciled', 'Pending', 'Pending', 'reconciliation_worker', format('Flagged as stale after %s minutes', p_stale_minutes));

    v_count := v_count + 1;
  END LOOP;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- ============================================================================
-- 9. MEMBER FINANCIAL SUMMARY FUNCTION
-- Single-call summary for member payment history.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_member_financial_summary(p_member_id uuid)
RETURNS TABLE (
  total_paid numeric,
  total_pending numeric,
  total_failed numeric,
  payment_count bigint,
  contribution_count bigint,
  last_payment_date timestamptz,
  last_payment_amount numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status = 'Completed'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status = 'Pending'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status = 'Failed'), 0),
    COUNT(*),
    (SELECT COUNT(*) FROM contributions WHERE member_id = p_member_id AND status IN ('Paid', 'Verified')),
    MAX(created_at),
    (SELECT amount FROM payments WHERE member_id = p_member_id AND status = 'Completed' ORDER BY created_at DESC LIMIT 1)
  FROM payments
  WHERE member_id = p_member_id;
$$;
