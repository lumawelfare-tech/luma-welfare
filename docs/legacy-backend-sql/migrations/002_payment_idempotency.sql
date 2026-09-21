-- Migration: Add idempotency_key and checkout_request_id to payments
-- This migration is SAFE: no existing data is modified or deleted.
-- New columns are nullable so existing rows are unaffected.

BEGIN;

-- 1. Add idempotency_key column (frontend-generated UUID, scoped to member)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key text;

-- 2. Add checkout_request_id column (Daraja's CheckoutRequestID, stored separately)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_request_id text;

-- 3. Unique constraint on (member_id, idempotency_key) — prevents duplicate initiations
--    per member. NULLs are ignored by PostgreSQL unique constraints, so existing
--    rows without idempotency_key are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency
  ON payments (member_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 4. Unique constraint on checkout_request_id — callback matching
--    Only one payment can hold a given Daraja CheckoutRequestID.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_checkout_request
  ON payments (checkout_request_id)
  WHERE checkout_request_id IS NOT NULL;

-- 5. Index for fast lookup by idempotency_key
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key
  ON payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 6. Index for fast callback lookup by checkout_request_id
CREATE INDEX IF NOT EXISTS idx_payments_checkout_id
  ON payments (checkout_request_id)
  WHERE checkout_request_id IS NOT NULL;

COMMIT;
