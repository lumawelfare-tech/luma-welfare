-- ============================================================================
-- FIX: get_admin_dashboard_summary RPC was missing fields expected by Edge Function
-- The Edge Function reads: active_members, new_members_period, total_contributions,
-- verified_contributions, total_claims, total_payments, completed_payments
-- These were all returning null → 0
-- ============================================================================

CREATE OR REPLACE FUNCTION get_admin_dashboard_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_members bigint,
  active_members bigint,
  new_members_period bigint,
  total_subscriptions bigint,
  active_subscriptions bigint,
  pending_contributions bigint,
  total_contributions numeric,
  verified_contributions numeric,
  pending_claims bigint,
  approved_claims bigint,
  paid_claims bigint,
  total_claims bigint,
  total_payments numeric,
  completed_payments numeric,
  total_registration_fees bigint,
  paid_registration_fees bigint,
  unpaid_registration_fees bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    (SELECT COUNT(*) FROM members),
    (SELECT COUNT(*) FROM members WHERE status = 'active'),
    (SELECT COUNT(*) FROM members
     WHERE joined_at >= COALESCE(p_from, now() - INTERVAL '30 days')
       AND (p_to IS NULL OR joined_at <= p_to)),
    (SELECT COUNT(*) FROM subscriptions),
    (SELECT COUNT(*) FROM subscriptions WHERE status = 'active'),
    (SELECT COUNT(*) FROM contributions WHERE status = 'Pending'
     AND (p_from IS NULL OR created_at >= p_from)
     AND (p_to IS NULL OR created_at <= p_to)),
    (SELECT COALESCE(SUM(amount), 0) FROM contributions
     WHERE (p_from IS NULL OR created_at >= p_from)
       AND (p_to IS NULL OR created_at <= p_to)),
    (SELECT COALESCE(SUM(amount), 0) FROM contributions
     WHERE status IN ('Paid', 'Verified')
     AND (p_from IS NULL OR created_at >= p_from)
       AND (p_to IS NULL OR created_at <= p_to)),
    (SELECT COUNT(*) FROM claims WHERE status IN ('Submitted', 'Under Review', 'Additional Information Required')),
    (SELECT COUNT(*) FROM claims WHERE status = 'Approved'),
    (SELECT COUNT(*) FROM claims WHERE status = 'Paid'),
    (SELECT COUNT(*) FROM claims
     WHERE (p_from IS NULL OR created_at >= p_from)
       AND (p_to IS NULL OR created_at <= p_to)),
    (SELECT COALESCE(SUM(amount), 0) FROM payments
     WHERE (p_from IS NULL OR created_at >= p_from)
       AND (p_to IS NULL OR created_at <= p_to)),
    (SELECT COALESCE(SUM(amount), 0) FROM payments
     WHERE status = 'Completed'
     AND (p_from IS NULL OR created_at >= p_from)
       AND (p_to IS NULL OR created_at <= p_to)),
    (SELECT COUNT(*) FROM registration_fees WHERE fee_type = 'registration'),
    (SELECT COUNT(*) FROM registration_fees WHERE fee_type = 'registration' AND status = 'paid'),
    (SELECT COUNT(*) FROM registration_fees WHERE fee_type = 'registration' AND status = 'unpaid');
$$;
