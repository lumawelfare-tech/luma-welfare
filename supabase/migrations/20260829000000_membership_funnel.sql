-- ============================================================================
-- MEMBERSHIP FUNNEL: Registered → Active → Subscribed → Contributing → Qualified
-- Identifies where members drop off in the welfare journey.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_membership_funnel()
RETURNS TABLE (
  stage text,
  count bigint,
  pct_of_total numeric
)
LANGUAGE sql STABLE
AS $$
  WITH total AS (
    SELECT COUNT(*) as t FROM members
  ),
  funnel AS (
    SELECT 'Registered' as stage, COUNT(*) as count FROM members
    UNION ALL
    SELECT 'Email Verified', COUNT(*) FROM members WHERE email_verified = true
    UNION ALL
    SELECT 'Active', COUNT(*) FROM members WHERE status = 'active'
    UNION ALL
    SELECT 'Has Subscription', COUNT(*) FROM (
      SELECT DISTINCT m.id FROM members m
      JOIN subscriptions s ON s.member_id = m.id AND s.status = 'active'
    ) x
    UNION ALL
    SELECT 'Has Contribution', COUNT(*) FROM (
      SELECT DISTINCT m.id FROM members m
      JOIN contributions c ON c.member_id = m.id AND c.status IN ('Paid', 'Verified')
    ) x
    UNION ALL
    SELECT 'Qualified', COUNT(*) FROM qualifications WHERE status = 'eligible'
  )
  SELECT
    f.stage,
    f.count,
    CASE WHEN total.t > 0 THEN ROUND((f.count::numeric / total.t) * 100, 1) ELSE 0 END
  FROM funnel f, total
  ORDER BY
    CASE f.stage
      WHEN 'Registered' THEN 1
      WHEN 'Email Verified' THEN 2
      WHEN 'Active' THEN 3
      WHEN 'Has Subscription' THEN 4
      WHEN 'Has Contribution' THEN 5
      WHEN 'Qualified' THEN 6
    END;
$$;
