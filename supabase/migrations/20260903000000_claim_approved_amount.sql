-- =============================================================================
-- CLAIM APPROVED AMOUNT — Track requested vs approved amounts separately
-- Previously, approving a claim overwrote amount_requested with the approved value.
-- Now both values are preserved for audit and comparison.
-- =============================================================================

ALTER TABLE claims ADD COLUMN IF NOT EXISTS approved_amount numeric(12,2);

-- Backfill: For already-approved/paid claims, the approved amount equals amount_requested
-- (since the original value was overwritten during approval)
UPDATE claims
SET approved_amount = amount_requested
WHERE status IN ('Approved', 'Paid')
  AND approved_amount IS NULL;

COMMENT ON COLUMN claims.approved_amount IS 'Amount approved by admin (may differ from amount_requested)';
