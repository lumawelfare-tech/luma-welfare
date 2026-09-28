-- =============================================================================
-- Fix: enforce_payment_state_machine() has no branch for status = 'Processing'
-- =============================================================================
-- Bug
--   supabase/migrations/20260827000000_phase6_financial_hardening.sql defines:
--
--     Pending   -> Completed | Failed | Cancelled | Timeout   (allowed)
--     Completed -> Reversed                                   (allowed)
--     anything else                                          -> RAISE
--
--   'Processing' is neither an allowed source nor an allowed target, so every
--   transition out of it raises:
--     check_violation  Invalid payment status transition: Processing -> Completed
--
-- Impact
--   supabase/functions/payments-callback/index.ts calls the RPC
--   process_payment_callback_v2 (20260827100000_phase7_financial_ledger.sql),
--   which does NOT guard on `status = 'Pending'` — it only short-circuits when
--   status = 'Completed'. A payment sitting in 'Processing' therefore makes the
--   whole RPC throw on the UPDATE, so a real M-Pesa payment would never be
--   credited and the callback 500s instead of failing gracefully.
--
--   'Processing' is a first-class state of the system:
--     - added to the enum by docs/legacy-backend-sql/migrations/003_add_processing_status.mjs
--     - payments-initiate returns 409 {"status":"processing"} and reuses such rows
--     - member-dashboard / usePaymentTracker treat it as "pending"
--     - admin-claims filters on ['Pending','Processing','Completed']
--   but no writer currently sets it, so the failure is latent, not live.
--
-- Fix
--   Mirror the Pending branch for 'Processing': it is an in-flight STK push that
--   must still be allowed to settle. Reversed remains reachable only from
--   Completed (manual admin action), and no reverse transitions are introduced.
-- ============================================================================

-- NOTE: SET search_path = public must be repeated on every CREATE OR REPLACE of
-- this function. It was introduced by 20260918120650_restore_missing_part1_payments.sql
-- and a REPLACE that omits the SET clause silently clears pg_proc.proconfig,
-- losing the search_path fixation. Verified: proconfig was null after the first
-- application of this file and is restored to {search_path=public} by this one.
CREATE OR REPLACE FUNCTION enforce_payment_state_machine()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only validate on status change
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Valid transitions:
  -- Pending   -> Completed, Failed, Cancelled, Timeout
  IF OLD.status = 'Pending' AND NEW.status IN ('Completed', 'Failed', 'Cancelled', 'Timeout') THEN
    RETURN NEW;
  END IF;

  -- In-flight STK push (status 'Processing') must be able to settle too, or a
  -- late M-Pesa callback hard-errors inside process_payment_callback_v2.
  IF OLD.status = 'Processing' AND NEW.status IN ('Completed', 'Failed', 'Cancelled', 'Timeout') THEN
    RETURN NEW;
  END IF;

  -- Completed -> Reversed (manual admin action only)
  IF OLD.status = 'Completed' AND NEW.status = 'Reversed' THEN
    RETURN NEW;
  END IF;

  -- Reject invalid transitions
  RAISE EXCEPTION 'Invalid payment status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;

-- The trigger is unchanged; it already points at this function.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_payments_state_machine'
      AND tgrelid = 'payments'::regclass
  ) THEN
    CREATE TRIGGER trg_payments_state_machine
      BEFORE UPDATE OF status ON payments
      FOR EACH ROW
      EXECUTE FUNCTION enforce_payment_state_machine();
  END IF;
END $$;
