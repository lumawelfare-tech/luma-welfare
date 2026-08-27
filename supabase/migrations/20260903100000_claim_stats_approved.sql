-- =============================================================================
-- CLAIM STATS APPROVED — Update get_claim_stats to include approved_amount
-- Uses the new approved_amount column instead of amount_requested for approved/paid sums
-- =============================================================================

CREATE OR REPLACE FUNCTION get_claim_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_amount numeric,
  approved_amount numeric,
  paid_amount numeric,
  requested_amount numeric,
  count bigint,
  submitted_count bigint,
  approved_count bigint,
  paid_count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(SUM(amount_requested), 0) as total_amount,
    COALESCE(SUM(COALESCE(approved_amount, amount_requested)) FILTER (WHERE status = 'Approved'), 0) as approved_amount,
    COALESCE(SUM(COALESCE(approved_amount, amount_requested)) FILTER (WHERE status = 'Paid'), 0) as paid_amount,
    COALESCE(SUM(amount_requested) FILTER (WHERE status IN ('Approved', 'Paid')), 0) as requested_amount,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE status = 'Submitted') as submitted_count,
    COUNT(*) FILTER (WHERE status = 'Approved') as approved_count,
    COUNT(*) FILTER (WHERE status = 'Paid') as paid_count
  FROM claims
  WHERE (p_from IS NULL OR created_at >= p_from)
    AND (p_to IS NULL OR created_at <= p_to);
$$;

COMMENT ON FUNCTION get_claim_stats IS 'Returns claim statistics including requested vs approved amount comparison';
