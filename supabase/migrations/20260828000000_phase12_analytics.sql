-- ============================================================================
-- PHASE 12: MANAGEMENT DASHBOARD ANALYTICS RPC FUNCTIONS
-- Server-side aggregation for executive dashboard.
-- ============================================================================

-- ============================================================================
-- 1. Member growth by month (for growth chart)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_member_growth(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  month text,
  new_members bigint,
  active_members bigint,
  cumulative bigint
)
LANGUAGE sql STABLE
AS $$
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', COALESCE(p_from, now() - INTERVAL '12 months')),
      date_trunc('month', COALESCE(p_to, now())),
      INTERVAL '1 month'
    )::date as month_start
  ),
  new_by_month AS (
    SELECT
      to_char(m.joined_at, 'YYYY-MM') as month,
      COUNT(*) as new_members
    FROM members m
    WHERE (p_from IS NULL OR m.joined_at >= p_from)
      AND (p_to IS NULL OR m.joined_at <= p_to)
    GROUP BY to_char(m.joined_at, 'YYYY-MM')
  ),
  active_by_month AS (
    SELECT
      to_char(m.joined_at, 'YYYY-MM') as month,
      COUNT(*) FILTER (WHERE m.status = 'active') as active_members
    FROM members m
    WHERE (p_from IS NULL OR m.joined_at >= p_from)
      AND (p_to IS NULL OR m.joined_at <= p_to)
    GROUP BY to_char(m.joined_at, 'YYYY-MM')
  ),
  combined AS (
    SELECT
      to_char(ms.month_start, 'YYYY-MM') as month,
      COALESCE(nb.new_members, 0) as new_members,
      COALESCE(ab.active_members, 0) as active_members
    FROM months ms
    LEFT JOIN new_by_month nb ON nb.month = to_char(ms.month_start, 'YYYY-MM')
    LEFT JOIN active_by_month ab ON ab.month = to_char(ms.month_start, 'YYYY-MM')
  )
  SELECT
    c.month,
    c.new_members,
    c.active_members,
    SUM(c.new_members) OVER (ORDER BY c.month) as cumulative
  FROM combined c
  ORDER BY c.month;
$$;

-- ============================================================================
-- 2. Payment health metrics
-- ============================================================================

CREATE OR REPLACE FUNCTION get_payment_health(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_payments bigint,
  completed bigint,
  pending bigint,
  failed bigint,
  total_amount numeric,
  completed_amount numeric,
  success_rate numeric,
  avg_amount numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COUNT(*) as total_payments,
    COUNT(*) FILTER (WHERE p.status = 'Completed') as completed,
    COUNT(*) FILTER (WHERE p.status = 'Pending') as pending,
    COUNT(*) FILTER (WHERE p.status = 'Failed') as failed,
    COALESCE(SUM(p.amount), 0) as total_amount,
    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0) as completed_amount,
    CASE WHEN COUNT(*) > 0 THEN
      ROUND((COUNT(*) FILTER (WHERE p.status = 'Completed')::numeric / COUNT(*)) * 100, 1)
    ELSE 100 END as success_rate,
    COALESCE(AVG(p.amount) FILTER (WHERE p.status = 'Completed'), 0) as avg_amount
  FROM payments p
  WHERE (p_from IS NULL OR p.created_at >= p_from)
    AND (p_to IS NULL OR p.created_at <= p_to);
$$;

-- ============================================================================
-- 3. Outstanding obligations (management view)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_outstanding_obligations()
RETURNS TABLE (
  approved_unpaid_claims bigint,
  approved_unpaid_amount numeric,
  pending_contributions bigint,
  pending_contribution_amount numeric,
  stale_pending_payments bigint,
  stale_pending_amount numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    -- Approved claims not yet paid
    (SELECT COUNT(*) FROM claims WHERE status = 'Approved') as approved_unpaid_claims,
    (SELECT COALESCE(SUM(amount_requested), 0) FROM claims WHERE status = 'Approved') as approved_unpaid_amount,
    -- Pending contributions (manual records awaiting verification)
    (SELECT COUNT(*) FROM contributions WHERE status = 'Pending') as pending_contributions,
    (SELECT COALESCE(SUM(amount), 0) FROM contributions WHERE status = 'Pending') as pending_contribution_amount,
    -- Stale pending payments (>30 min without callback)
    (SELECT COUNT(*) FROM payments WHERE status = 'Pending' AND created_at < now() - INTERVAL '30 minutes') as stale_pending_payments,
    (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'Pending' AND created_at < now() - INTERVAL '30 minutes') as stale_pending_amount;
$$;

-- ============================================================================
-- 4. Qualification analytics
-- ============================================================================

CREATE OR REPLACE FUNCTION get_qualification_analytics()
RETURNS TABLE (
  qualified bigint,
  not_eligible bigint,
  at_risk bigint,
  revoked bigint,
  total bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COUNT(*) FILTER (WHERE q.status = 'eligible') as qualified,
    COUNT(*) FILTER (WHERE q.status = 'not_eligible') as not_eligible,
    COUNT(*) FILTER (WHERE q.status = 'at_risk') as at_risk,
    COUNT(*) FILTER (WHERE q.status = 'revoked') as revoked,
    COUNT(*) as total
  FROM qualifications q
  JOIN subscriptions s ON s.id = q.subscription_id AND s.status = 'active';
$$;

-- ============================================================================
-- 5. Contribution retention (month-over-month)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_contribution_retention()
RETURNS TABLE (
  current_month_active bigint,
  previous_month_active bigint,
  retained bigint,
  retention_rate numeric,
  new_active bigint
)
LANGUAGE sql STABLE
AS $$
  WITH current_month AS (
    SELECT DISTINCT member_id
    FROM contributions
    WHERE status IN ('Paid', 'Verified')
    AND period = to_char(now(), 'YYYY-MM')
  ),
  previous_month AS (
    SELECT DISTINCT member_id
    FROM contributions
    WHERE status IN ('Paid', 'Verified')
    AND period = to_char(now() - INTERVAL '1 month', 'YYYY-MM')
  )
  SELECT
    (SELECT COUNT(*) FROM current_month) as current_month_active,
    (SELECT COUNT(*) FROM previous_month) as previous_month_active,
    (SELECT COUNT(*) FROM current_month cm WHERE EXISTS (
      SELECT 1 FROM previous_month pm WHERE pm.member_id = cm.member_id
    )) as retained,
    CASE WHEN (SELECT COUNT(*) FROM previous_month) > 0 THEN
      ROUND(
        ((SELECT COUNT(*) FROM current_month cm WHERE EXISTS (
          SELECT 1 FROM previous_month pm WHERE pm.member_id = cm.member_id
        ))::numeric / (SELECT COUNT(*) FROM previous_month)) * 100, 1
      )
    ELSE 100 END as retention_rate,
    (SELECT COUNT(*) FROM current_month cm WHERE NOT EXISTS (
      SELECT 1 FROM previous_month pm WHERE pm.member_id = cm.member_id
    )) as new_active;
$$;

-- ============================================================================
-- 6. Comprehensive dashboard summary (single call for all KPIs)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_executive_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_members bigint,
  active_members bigint,
  new_members_period bigint,
  active_subscriptions bigint,
  total_contributions numeric,
  verified_contributions numeric,
  pending_contributions numeric,
  total_claims bigint,
  pending_claims bigint,
  approved_claims bigint,
  paid_claims bigint,
  rejected_claims bigint,
  total_payments numeric,
  completed_payments numeric,
  payment_success_rate numeric,
  outstanding_obligations numeric,
  registration_fees_paid bigint,
  registration_fees_total bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    (SELECT COUNT(*) FROM members),
    (SELECT COUNT(*) FROM members WHERE status = 'active'),
    (SELECT COUNT(*) FROM members WHERE joined_at >= COALESCE(p_from, now() - INTERVAL '30 days')),
    (SELECT COUNT(*) FROM subscriptions WHERE status = 'active'),
    (SELECT COALESCE(SUM(amount), 0) FROM contributions WHERE (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at <= p_to)),
    (SELECT COALESCE(SUM(amount), 0) FROM contributions WHERE status IN ('Paid', 'Verified') AND (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at <= p_to)),
    (SELECT COALESCE(SUM(amount), 0) FROM contributions WHERE status = 'Pending' AND (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at <= p_to)),
    (SELECT COUNT(*) FROM claims WHERE (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at <= p_to)),
    (SELECT COUNT(*) FROM claims WHERE status IN ('Submitted', 'Under Review', 'Additional Information Required')),
    (SELECT COUNT(*) FROM claims WHERE status = 'Approved'),
    (SELECT COUNT(*) FROM claims WHERE status = 'Paid'),
    (SELECT COUNT(*) FROM claims WHERE status = 'Rejected'),
    (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at <= p_to)),
    (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'Completed' AND (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at <= p_to)),
    CASE WHEN (SELECT COUNT(*) FROM payments WHERE (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at <= p_to)) > 0 THEN
      ROUND(
        ((SELECT COUNT(*) FROM payments WHERE status = 'Completed' AND (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at <= p_to))::numeric /
         (SELECT COUNT(*) FROM payments WHERE (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at <= p_to))) * 100, 1
      )
    ELSE 100 END,
    (SELECT COALESCE(SUM(amount_requested), 0) FROM claims WHERE status = 'Approved'),
    (SELECT COUNT(*) FROM registration_fees WHERE fee_type = 'registration' AND status = 'paid'),
    (SELECT COUNT(*) FROM registration_fees WHERE fee_type = 'registration');
$$;
