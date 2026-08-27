-- ============================================================================
-- LUMA WELFARE — PHASE 11: PRODUCTION OPERATIONS QUERIES
-- Financial reconciliation, security monitoring, data integrity, SLO tracking.
-- ============================================================================

-- ============================================================================
-- 1. FINANCIAL RECONCILIATION HEALTH
-- ============================================================================

-- Payments without matching contributions (orphaned payments)
CREATE OR REPLACE FUNCTION check_orphan_payments()
RETURNS TABLE (
  payment_id uuid,
  member_id uuid,
  amount numeric,
  status text,
  created_at timestamptz,
  issue text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.member_id,
    p.amount,
    p.status::text,
    p.created_at,
    'Completed payment without subscription_id' as issue
  FROM payments p
  WHERE p.status = 'Completed'
  AND p.subscription_id IS NULL;
$$;

-- Contributions without matching payments (manual records pending verification)
CREATE OR REPLACE FUNCTION check_unverified_contributions()
RETURNS TABLE (
  contribution_id uuid,
  member_id uuid,
  amount numeric,
  period text,
  created_at timestamptz,
  days_pending bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.member_id,
    c.amount,
    c.period,
    c.created_at,
    EXTRACT(EPOCH FROM (now() - c.created_at)) / 86400 as days_pending
  FROM contributions c
  WHERE c.status = 'Pending'
  AND c.payment_id IS NULL
  AND c.created_at < now() - INTERVAL '7 days';
$$;

-- Stale pending payments (no callback received)
CREATE OR REPLACE FUNCTION check_stale_pending_payments()
RETURNS TABLE (
  payment_id uuid,
  member_id uuid,
  amount numeric,
  created_at timestamptz,
  minutes_pending bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.member_id,
    p.amount,
    p.created_at,
    EXTRACT(EPOCH FROM (now() - p.created_at)) / 60 as minutes_pending
  FROM payments p
  WHERE p.status = 'Pending'
  AND p.created_at < now() - INTERVAL '30 minutes';
$$;

-- ============================================================================
-- 2. DATA INTEGRITY CHECKS
-- ============================================================================

-- Members without registration fee records
CREATE OR REPLACE FUNCTION check_missing_registration_fees()
RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*)
  FROM members m
  WHERE m.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM registration_fees rf
    WHERE rf.member_id = m.id AND rf.fee_type = 'registration'
  );
$$;

-- Active subscriptions without active members
CREATE OR REPLACE FUNCTION check_orphan_subscriptions()
RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*)
  FROM subscriptions s
  JOIN members m ON m.id = s.member_id
  WHERE s.status = 'active'
  AND m.status != 'active';
$$;

-- Claims without valid subscription
CREATE OR REPLACE FUNCTION check_invalid_claims()
RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*)
  FROM claims cl
  WHERE cl.status NOT IN ('Draft', 'Rejected')
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.id = cl.subscription_id AND s.status = 'active'
  );
$$;

-- Duplicate contribution periods (should be impossible due to UNIQUE constraint)
CREATE OR REPLACE FUNCTION check_duplicate_contributions()
RETURNS TABLE (
  subscription_id uuid,
  period text,
  count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.subscription_id,
    c.period,
    COUNT(*) as count
  FROM contributions c
  GROUP BY c.subscription_id, c.period
  HAVING COUNT(*) > 1;
$$;

-- ============================================================================
-- 3. SLO TRACKING
-- ============================================================================

-- Calculate daily SLO metrics
CREATE OR REPLACE FUNCTION get_daily_slo_metrics(p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  date date,
  total_requests bigint,
  error_count bigint,
  error_rate numeric,
  availability numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p_date,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE action LIKE '%failed%' OR action LIKE '%error%') as error_count,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND((COUNT(*) FILTER (WHERE action LIKE '%failed%' OR action LIKE '%error%')::numeric / COUNT(*)) * 100, 4)
      ELSE 0
    END as error_rate,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND(((COUNT(*) - COUNT(*) FILTER (WHERE action LIKE '%failed%' OR action LIKE '%error%'))::numeric / COUNT(*)) * 100, 4)
      ELSE 100
    END as availability
  FROM audit_logs
  WHERE DATE(created_at) = p_date;
$$;

-- ============================================================================
-- 4. PAYMENT ANALYTICS
-- ============================================================================

-- Payment success rate by hour (last 24 hours)
CREATE OR REPLACE FUNCTION get_payment_success_rate_24h()
RETURNS TABLE (
  hour timestamptz,
  completed bigint,
  pending bigint,
  failed bigint,
  success_rate numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    date_trunc('hour', p.created_at) as hour,
    COUNT(*) FILTER (WHERE p.status = 'Completed') as completed,
    COUNT(*) FILTER (WHERE p.status = 'Pending') as pending,
    COUNT(*) FILTER (WHERE p.status = 'Failed') as failed,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND((COUNT(*) FILTER (WHERE p.status = 'Completed')::numeric / COUNT(*)) * 100, 1)
      ELSE 100
    END as success_rate
  FROM payments p
  WHERE p.created_at > now() - INTERVAL '24 hours'
  GROUP BY date_trunc('hour', p.created_at)
  ORDER BY hour;
$$;

-- ============================================================================
-- 5. EXPORT WORKER HEALTH
-- ============================================================================

-- Export job processing times
CREATE OR REPLACE FUNCTION get_export_processing_stats()
RETURNS TABLE (
  avg_processing_time_ms numeric,
  max_processing_time_ms numeric,
  jobs_last_24h bigint,
  failed_jobs_24h bigint,
  stale_jobs bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as avg_processing_time_ms,
    MAX(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as max_processing_time_ms,
    COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '24 hours') as jobs_last_24h,
    COUNT(*) FILTER (WHERE status = 'failed' AND created_at > now() - INTERVAL '24 hours') as failed_jobs_24h,
    COUNT(*) FILTER (WHERE status = 'processing' AND started_at < now() - INTERVAL '10 minutes') as stale_jobs
  FROM export_jobs;
$$;

-- ============================================================================
-- 6. NOTIFICATION HEALTH
-- ============================================================================

-- Notification delivery stats
CREATE OR REPLACE FUNCTION get_notification_health()
RETURNS TABLE (
  total_24h bigint,
  queued bigint,
  sent bigint,
  failed bigint,
  delivery_rate numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COUNT(*) as total_24h,
    COUNT(*) FILTER (WHERE status = 'queued') as queued,
    COUNT(*) FILTER (WHERE status = 'sent') as sent,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND((COUNT(*) FILTER (WHERE status = 'sent')::numeric / COUNT(*)) * 100, 1)
      ELSE 100
    END as delivery_rate
  FROM notifications
  WHERE created_at > now() - INTERVAL '24 hours';
$$;
