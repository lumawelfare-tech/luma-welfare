-- ============================================================================
-- LUMA WELFARE — RESTORE PHASE 6 / PHASE 7 FINANCIAL OBJECTS
--
-- Rollback: drop exactly what this file creates (no schema existed before it).
--
-- WHY THIS FILE EXISTS
--   supabase_migrations.schema_migrations has rows for
--     20260827000000_phase6_financial_hardening.sql
--     20260827100000_phase7_financial_ledger.sql
--   but none of the objects those two files define were ever created in
--   production. Catalog queries against every schema (public, auth, storage,
--   extensions) confirm absence. The row/content pairing for both files is
--   byte-correct, so the history recorded them as applied without executing
--   them. This is a NEW forward migration: it does not re-apply the old files,
--   does not run `supabase migration repair`, and does not touch any existing
--   schema_migrations row.
--
-- DELIBERATE DIFFERENCES FROM THE ORIGINALS — DO NOT REVERT THESE
--   1. financial_ledger gets NO "ledger_read_own" policy. That policy was
--      deliberately dropped by 20260921220000_security_audit_stage4.sql (M-03).
--      End state for all four tables: ENABLE + FORCE row level security and
--      ZERO policies, i.e. deny-all for anon/authenticated; only service_role
--      (via Edge Functions, BYPASSRLS) can touch them.
--   2. Every function carries `SET search_path = public`. The original
--      phase6/phase7 definitions omitted it; that omission must not be
--      reintroduced (object-shadowing vector + Supabase linter rule).
--   3. EXECUTE on the six RPC functions is revoked from PUBLIC / anon /
--      authenticated. The originals relied on default PUBLIC EXECUTE, which
--      would have let any signed-in member call process_payment_callback_v2()
--      straight over PostgREST and drive payment state transitions.
--   4. All four tables get FORCE, not just ENABLE, so the owner is subject to
--      RLS too.
--   5. An assertion block at the end of the file fails the whole transaction
--      if any object, policy, or search_path is wrong. If this file aborts,
--      schema_migrations does not gain a row — the exact inverse of the
--      recorded-without-executing failure this migration repairs.
--
-- INTENTIONALLY NOT TOUCHED
--   * payments / claims / contributions / welfare RLS policies.
--   * payments CHECK/UNIQUE constraints and trg_payments_state_machine — all
--     already present in production.
--   * enforce_payment_state_machine() — already present and already carries
--     `search_path = public` (20260918120650_restore_missing_part1_payments).
--     Re-declaring it here would clobber the Processing transition added by
--     20260928000100_allow_processing_transitions.sql.
--   * export_jobs subtree (admin-exports / admin-exports-worker /
--     admin-scheduled-reports) — separate migration, deliberately out of scope.
--   * flag_stale_pending_payments() / get_member_financial_summary() — absent,
--     but referenced by no application code (docs only); out of scope.
--
-- ===========================================================================
-- ROLLBACK (run manually, inside one transaction, only if this migration must
-- be undone). None of these objects pre-existed, so down == DROP.
--
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_audit_logs_meta_size ON audit_logs;
--   DROP FUNCTION IF EXISTS enforce_audit_log_meta_size();
--   DROP FUNCTION IF EXISTS get_payment_timeline(uuid);
--   DROP FUNCTION IF EXISTS get_reconciliation_summary();
--   DROP FUNCTION IF EXISTS record_payment_initiation(uuid, text, text);
--   DROP FUNCTION IF EXISTS process_payment_callback_v2(text, text, integer, text, numeric, text, text);
--   DROP FUNCTION IF EXISTS process_registration_fee_callback(text, text, integer, text);
--   DROP FUNCTION IF EXISTS process_payment_callback(text, text, integer, text, text, text);
--   DROP TABLE IF EXISTS payment_timeline;
--   DROP TABLE IF EXISTS reconciliation_exceptions;
--   DROP TABLE IF EXISTS financial_ledger;
--   DROP TABLE IF EXISTS webhook_events;
--   COMMIT;
-- ===========================================================================

-- ============================================================================
-- 0. PRECONDITION REPORT (not a failure — pure visibility)
--    Documents the pre-state so a re-run shows what already existed.
-- ============================================================================
DO $$
DECLARE
  t text;
  f text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'webhook_events', 'financial_ledger', 'payment_timeline', 'reconciliation_exceptions'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'PRECONDITION: table public.% does not exist (will be created)', t;
    ELSE
      RAISE NOTICE 'PRECONDITION: table public.% ALREADY EXISTS (will be reused)', t;
    END IF;
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'process_payment_callback', 'process_payment_callback_v2',
    'process_registration_fee_callback', 'record_payment_initiation',
    'get_reconciliation_summary', 'get_payment_timeline',
    'enforce_audit_log_meta_size'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f
    ) THEN
      RAISE NOTICE 'PRECONDITION: function public.% does not exist (will be created)', f;
    ELSE
      RAISE NOTICE 'PRECONDITION: function public.% ALREADY EXISTS (will be replaced)', f;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 1. WEBHOOK EVENTS TABLE
--    Idempotency ledger for external provider callbacks.
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

-- Required by payments-callback's `.upsert(..., { onConflict: 'provider,event_id' })`
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_provider_event
  ON webhook_events(provider, event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status_received
  ON webhook_events(status, received_at)
  WHERE status IN ('received', 'processing');

-- ============================================================================
-- 2. FINANCIAL LEDGER TABLE
--    Immutable record of all financial movements.
--    NOTE: NO member-facing SELECT policy. Deliberately deny-all (M-03).
-- ============================================================================

CREATE TABLE IF NOT EXISTS financial_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Legal sources: payments.id, registration_fees.id, payouts.id.
  -- NOT NULL retained from phase7 for integrity.
  transaction_id uuid NOT NULL,
  transaction_type text NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_financial_ledger_member
  ON financial_ledger(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_transaction
  ON financial_ledger(transaction_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_type_date
  ON financial_ledger(transaction_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_created
  ON financial_ledger(created_at DESC);

-- M-03: this policy was intentionally destroyed and must stay destroyed.
DROP POLICY IF EXISTS "ledger_read_own" ON financial_ledger;

-- ============================================================================
-- 3. RECONCILIATION EXCEPTIONS TABLE
--    Admin-only via service role. No member access, by design.
-- ============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_type text NOT NULL
    CHECK (exception_type IN ('amount_mismatch', 'missing_contribution', 'missing_payment', 'duplicate', 'orphaned')),
  severity text NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  transaction_id uuid,                     -- related payment/claim/payout
  member_id uuid REFERENCES members(id),
  payment_id uuid REFERENCES payments(id),
  contribution_id uuid REFERENCES contributions(id),
  expected_amount numeric(12,2),
  actual_amount numeric(12,2),
  description text NOT NULL,
  metadata jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_status
  ON reconciliation_exceptions(status, created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_reconciliation_member
  ON reconciliation_exceptions(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_payment
  ON reconciliation_exceptions(payment_id) WHERE payment_id IS NOT NULL;

-- ============================================================================
-- 4. PAYMENT TIMELINE TABLE
--    Every state change, for full traceability.
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('initiated', 'stk_sent', 'callback_received', 'verified', 'completed', 'failed', 'reconciled', 'adjusted')),
  status_before text,
  status_after text,
  actor text NOT NULL DEFAULT 'system',    -- 'system', 'member', 'admin', 'mpesa_callback', 'reconciliation_worker'
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_timeline_payment
  ON payment_timeline(payment_id, created_at ASC);

-- ============================================================================
-- 5. RLS — ENABLE + FORCE, ZERO POLICIES on all four restored tables.
--    service_role bypasses RLS; anon/authenticated have no policy to match,
--    so every row is invisible to them regardless of column grants.
-- ============================================================================

ALTER TABLE webhook_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events            FORCE  ROW LEVEL SECURITY;
ALTER TABLE financial_ledger          ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_ledger          FORCE  ROW LEVEL SECURITY;
ALTER TABLE reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_exceptions FORCE  ROW LEVEL SECURITY;
ALTER TABLE payment_timeline          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_timeline          FORCE  ROW LEVEL SECURITY;

-- No CREATE POLICY statements. By design.

-- Column privileges: service_role only. anon/authenticated are revoked so the
-- deny-all posture does not depend on RLS alone.
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_events            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_ledger          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON reconciliation_exceptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_timeline          TO service_role;

REVOKE ALL ON webhook_events            FROM anon, authenticated;
REVOKE ALL ON financial_ledger          FROM anon, authenticated;
REVOKE ALL ON reconciliation_exceptions FROM anon, authenticated;
REVOKE ALL ON payment_timeline          FROM anon, authenticated;

-- ============================================================================
-- 6. ATOMIC PAYMENT CALLBACK (phase6 v1)
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
SET search_path = public
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
    UPDATE payments
    SET status = 'Completed',
        mpesa_receipt = p_mpesa_receipt,
        transaction_date = p_transaction_date,
        phone = COALESCE(p_phone_number, phone)
    WHERE id = v_payment.id;

    v_current_period := to_char(now(), 'YYYY-MM');

    SELECT EXISTS(
      SELECT 1 FROM contributions
      WHERE subscription_id = v_payment.subscription_id
        AND period = v_current_period
    ) INTO v_contribution_exists;

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
    UPDATE payments
    SET status = 'Failed',
        failure_reason = p_result_desc
    WHERE id = v_payment.id;

    RETURN QUERY SELECT false, 'Payment failed'::text, v_payment.id, false;
  END IF;
END;
$$;

-- ============================================================================
-- 7. ATOMIC REGISTRATION FEE CALLBACK (phase6)
--    Backs payments-callback's `process_registration_fee_callback` RPC — the
--    path that activates a member after an STK push.
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
SET search_path = public
AS $$
DECLARE
  v_fee RECORD;
BEGIN
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

  IF v_fee.status = 'paid' THEN
    RETURN QUERY SELECT true, 'Already processed'::text, v_fee.member_id;
    RETURN;
  END IF;

  IF p_result_code = 0 THEN
    UPDATE registration_fees
    SET status = 'paid',
        mpesa_receipt = p_mpesa_receipt,
        paid_at = now()
    WHERE id = v_fee.id;

    RETURN QUERY SELECT true, 'Registration fee paid'::text, v_fee.member_id;
  ELSE
    UPDATE registration_fees
    SET status = 'failed'
    WHERE id = v_fee.id;

    RETURN QUERY SELECT false, 'Registration fee payment failed'::text, v_fee.member_id;
  END IF;
END;
$$;

-- ============================================================================
-- 8. ENHANCED PAYMENT CALLBACK WITH AMOUNT VALIDATION (phase7 v2)
--    Primary production path — payments-callback line 283.
-- ============================================================================

CREATE OR REPLACE FUNCTION process_payment_callback_v2(
  p_checkout_request_id text,
  p_mpesa_receipt text,
  p_result_code integer,
  p_result_desc text,
  p_amount numeric DEFAULT NULL,
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
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_current_period text;
  v_contribution_exists boolean;
  v_amount_mismatch boolean := false;
BEGIN
  SELECT id, member_id, subscription_id, package_id, amount, status
  INTO v_payment
  FROM payments
  WHERE checkout_request_id = p_checkout_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Payment not found'::text, NULL::uuid, false, false;
    RETURN;
  END IF;

  IF v_payment.status = 'Completed' THEN
    RETURN QUERY SELECT true, 'Already processed'::text, v_payment.id, false, false;
    RETURN;
  END IF;

  -- Amount validation: compare expected vs actual
  IF p_result_code = 0 AND p_amount IS NOT NULL THEN
    IF p_amount != v_payment.amount THEN
      v_amount_mismatch := true;
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

      INSERT INTO payment_timeline (payment_id, event_type, status_before, status_after, actor, description)
      VALUES (v_payment.id, 'callback_received', v_payment.status, 'Failed', 'mpesa_callback', 'Amount mismatch - flagged for review');

      RETURN QUERY SELECT false, 'Amount mismatch - flagged for review'::text, v_payment.id, false, true;
      RETURN;
    END IF;
  END IF;

  IF p_result_code = 0 THEN
    UPDATE payments
    SET status = 'Completed',
        mpesa_receipt = p_mpesa_receipt,
        transaction_date = p_transaction_date,
        phone = COALESCE(p_phone_number, phone)
    WHERE id = v_payment.id;

    INSERT INTO payment_timeline (payment_id, event_type, status_before, status_after, actor, description, metadata)
    VALUES (v_payment.id, 'completed', v_payment.status, 'Completed', 'mpesa_callback', 'Payment completed', jsonb_build_object('mpesa_receipt', p_mpesa_receipt));

    INSERT INTO financial_ledger (transaction_id, transaction_type, member_id, entry_type, amount, reference, description)
    VALUES (v_payment.id, 'payment', v_payment.member_id, 'credit', v_payment.amount, p_mpesa_receipt, 'M-Pesa payment received');

    v_current_period := to_char(now(), 'YYYY-MM');

    SELECT EXISTS(
      SELECT 1 FROM contributions
      WHERE subscription_id = v_payment.subscription_id
        AND period = v_current_period
    ) INTO v_contribution_exists;

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

      INSERT INTO financial_ledger (transaction_id, transaction_type, member_id, entry_type, amount, reference, description)
      VALUES (v_payment.id, 'contribution', v_payment.member_id, 'credit', v_payment.amount, p_mpesa_receipt, format('Contribution for %s', v_current_period));
    END IF;

    RETURN QUERY SELECT true, 'Payment completed'::text, v_payment.id, NOT v_contribution_exists, false;
  ELSE
    UPDATE payments
    SET status = 'Failed',
        failure_reason = p_result_desc
    WHERE id = v_payment.id;

    INSERT INTO payment_timeline (payment_id, event_type, status_before, status_after, actor, description, metadata)
    VALUES (v_payment.id, 'failed', v_payment.status, 'Failed', 'mpesa_callback', format('Payment failed: %s', p_result_desc), jsonb_build_object('result_code', p_result_code));

    RETURN QUERY SELECT false, 'Payment failed'::text, v_payment.id, false, false;
  END IF;
END;
$$;

-- ============================================================================
-- 9. PAYMENT TIMELINE RECORDING FOR INITIATION (phase7)
--    payments-initiate line 255 — fires after the STK push is queued.
-- ============================================================================

CREATE OR REPLACE FUNCTION record_payment_initiation(
  p_payment_id uuid,
  p_checkout_request_id text,
  p_actor text DEFAULT 'member'
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO payment_timeline (payment_id, event_type, status_before, status_after, actor, description, metadata)
  VALUES (p_payment_id, 'initiated', NULL, 'Pending', p_actor, 'Payment initiated', jsonb_build_object('checkout_request_id', p_checkout_request_id));
END;
$$;

-- ============================================================================
-- 10. RECONCILIATION SUMMARY (phase7)
--     admin-reconciliation line 46.
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
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM payments),
    (SELECT COUNT(*) FROM payments WHERE status = 'Completed'),
    (SELECT COUNT(*) FROM payments WHERE status = 'Pending'),
    (SELECT COUNT(*) FROM payments WHERE status = 'Failed'),
    (SELECT COUNT(*) FROM contributions),
    (SELECT COUNT(*) FROM contributions WHERE status IN ('Paid', 'Verified')),
    (SELECT COUNT(*) FROM contributions WHERE status = 'Pending'),
    (SELECT COUNT(*) FROM payments p
     WHERE p.status = 'Completed'
     AND NOT EXISTS (
       SELECT 1 FROM contributions c
       WHERE c.payment_id = p.id
     )),
    (SELECT COUNT(*) FROM contributions c
     WHERE c.payment_id IS NULL
     AND c.status = 'Paid'),
    (SELECT COUNT(*) FROM reconciliation_exceptions WHERE status = 'open'),
    (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'Completed'),
    (SELECT COALESCE(SUM(amount), 0) FROM contributions WHERE status IN ('Paid', 'Verified'));
$$;

-- ============================================================================
-- 11. PAYMENT TIMELINE QUERY (phase7)
--     admin-reconciliation line 118.
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
LANGUAGE sql
STABLE
SET search_path = public
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
-- 12. AUDIT LOG META SIZE CAP (phase6)
--     Truncates oversized audit_logs.meta so a single event cannot balloon
--     the table. 10 KB ceiling.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_audit_log_meta_size()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF pg_column_size(NEW.meta) > 10240 THEN
    NEW.meta := jsonb_build_object(
      'truncated', true,
      'original_size', pg_column_size(NEW.meta),
      'summary', NEW.meta - 'payload' - 'raw' - 'details'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_meta_size ON audit_logs;
CREATE TRIGGER trg_audit_logs_meta_size
  BEFORE INSERT ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_audit_log_meta_size();

-- ============================================================================
-- 13. PRIVILEGES ON RPC FUNCTIONS
--     Only service_role (Edge Functions) may execute these. This closes the
--     default PUBLIC EXECUTE that would otherwise let any authenticated
--     PostgREST client drive payment state transitions directly.
--
--     Trigger functions are left alone: their EXECUTE grant is not a callable
--     surface (nothing routes anon/authenticated through them) and revoking
--     would risk audit logging for no security gain.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION process_payment_callback(text, text, integer, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION process_payment_callback_v2(text, text, integer, text, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION process_registration_fee_callback(text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION record_payment_initiation(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_reconciliation_summary()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_payment_timeline(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION process_payment_callback(text, text, integer, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION process_payment_callback_v2(text, text, integer, text, numeric, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION process_registration_fee_callback(text, text, integer, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION record_payment_initiation(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION get_reconciliation_summary()
  TO service_role;
GRANT EXECUTE ON FUNCTION get_payment_timeline(uuid)
  TO service_role;

-- ============================================================================
-- 14. POST-CONDITION ASSERTION
--     If any of these fails, the transaction aborts and schema_migrations
--     gains no row. That is the intended inverse of the recorded-without-
--     executing failure this migration exists to repair.
-- ============================================================================

DO $$
DECLARE
  missing_tables text[] := ARRAY[]::text[];
  missing_fns    text[] := ARRAY[]::text[];
  bad_rls        text[] := ARRAY[]::text[];
  bad_search     text[] := ARRAY[]::text[];
  bad_exec       text[] := ARRAY[]::text[];
  leaked         text[] := ARRAY[]::text[];
  t text;
  f text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'webhook_events', 'financial_ledger', 'payment_timeline', 'reconciliation_exceptions'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      missing_tables := missing_tables || t;
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t
        AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      bad_rls := bad_rls || t;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    ) THEN
      leaked := leaked || t;
    END IF;
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'process_payment_callback', 'process_payment_callback_v2',
    'process_registration_fee_callback', 'record_payment_initiation',
    'get_reconciliation_summary', 'get_payment_timeline',
    'enforce_audit_log_meta_size'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f
    ) THEN
      missing_fns := missing_fns || f;
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f
        AND NOT COALESCE(p.proconfig @> ARRAY['search_path=public'], false)
    ) THEN
      bad_search := bad_search || f;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'financial_ledger'
      AND policyname = 'ledger_read_own'
  ) THEN
    leaked := leaked || 'financial_ledger.ledger_read_own';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.audit_logs'::regclass
      AND tgname = 'trg_audit_logs_meta_size'
  ) THEN
    missing_fns := missing_fns || 'trg_audit_logs_meta_size';
  END IF;

  IF array_length(missing_tables, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'restore phase6/7: missing tables: %', missing_tables;
  END IF;
  IF array_length(missing_fns, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'restore phase6/7: missing objects: %', missing_fns;
  END IF;

  -- Decision B: EXECUTE must not reach anon/authenticated on any RPC.
  -- has_function_privilege() accounts for grants inherited via PUBLIC, so a
  -- revoke that failed to land is caught here rather than in production.
  FOREACH f IN ARRAY ARRAY[
    'process_payment_callback(text, text, integer, text, text, text)',
    'process_payment_callback_v2(text, text, integer, text, numeric, text, text)',
    'process_registration_fee_callback(text, text, integer, text)',
    'record_payment_initiation(uuid, text, text)',
    'get_reconciliation_summary()',
    'get_payment_timeline(uuid)'
  ] LOOP
    IF has_function_privilege('anon', 'public.' || f, 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') THEN
      bad_exec := bad_exec || f;
    END IF;
  END LOOP;
  IF array_length(bad_exec, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'restore phase6/7: EXECUTE still reachable by anon/authenticated: %', bad_exec;
  END IF;

  IF array_length(bad_rls, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'restore phase6/7: RLS not ENABLE+FORCE on: %', bad_rls;
  END IF;
  IF array_length(bad_search, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'restore phase6/7: search_path not set on: %', bad_search;
  END IF;
  IF array_length(leaked, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'restore phase6/7: unexpected policy present (deny-all violated): %', leaked;
  END IF;

  RAISE NOTICE 'restore phase6/7: 4 tables (ENABLE+FORCE, 0 policies), 7 functions (search_path=public), trg_audit_logs_meta_size OK';
END $$;

-- Make PostgREST pick the new RPCs up without waiting on its cache interval.
NOTIFY pgrst, 'reload schema';
