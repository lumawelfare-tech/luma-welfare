ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_date text, ADD COLUMN IF NOT EXISTS failure_reason text;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_checkout_request_id_unique') THEN ALTER TABLE payments ADD CONSTRAINT payments_checkout_request_id_unique UNIQUE (checkout_request_id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_mpesa_receipt_unique') THEN ALTER TABLE payments ADD CONSTRAINT payments_mpesa_receipt_unique UNIQUE (mpesa_receipt); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_positive') AND NOT EXISTS (SELECT 1 FROM payments WHERE amount IS NULL OR amount <= 0) THEN ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contributions_amount_positive') AND NOT EXISTS (SELECT 1 FROM contributions WHERE amount IS NULL OR amount <= 0) THEN ALTER TABLE contributions ADD CONSTRAINT contributions_amount_positive CHECK (amount > 0); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payouts_amount_positive') AND NOT EXISTS (SELECT 1 FROM payouts WHERE amount IS NULL OR amount <= 0) THEN ALTER TABLE payouts ADD CONSTRAINT payouts_amount_positive CHECK (amount > 0); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_amount_positive') AND NOT EXISTS (SELECT 1 FROM claims WHERE amount_requested IS NOT NULL AND amount_requested <= 0) THEN ALTER TABLE claims ADD CONSTRAINT claims_amount_positive CHECK (amount_requested IS NULL OR amount_requested > 0); END IF; END $$;

CREATE OR REPLACE FUNCTION enforce_payment_state_machine() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$ BEGIN IF OLD.status = NEW.status THEN RETURN NEW; END IF; IF OLD.status = 'Pending' AND NEW.status IN ('Completed', 'Failed', 'Cancelled', 'Timeout') THEN RETURN NEW; END IF; IF OLD.status = 'Completed' AND NEW.status = 'Reversed' THEN RETURN NEW; END IF; RAISE EXCEPTION 'Invalid payment status transition: % → %', OLD.status, NEW.status USING ERRCODE = 'check_violation'; END; $$;

DROP TRIGGER IF EXISTS trg_payments_state_machine ON payments;
CREATE TRIGGER trg_payments_state_machine BEFORE UPDATE OF status ON payments FOR EACH ROW EXECUTE FUNCTION enforce_payment_state_machine();;
