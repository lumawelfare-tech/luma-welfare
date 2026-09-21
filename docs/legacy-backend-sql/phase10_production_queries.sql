-- ============================================================================
-- LUMA WELFARE — PHASE 10: PRODUCTION MONITORING QUERIES
-- Use these to assess real production capacity and identify bottlenecks.
-- ============================================================================

-- ============================================================================
-- 1. TABLE SIZE OVERVIEW
-- ============================================================================

SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename::regclass)) as index_size,
  (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) as est_rows
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;

-- ============================================================================
-- 2. INDEX USAGE ANALYSIS
-- ============================================================================

SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  idx_scan as times_used,
  idx_tup_read as rows_read,
  idx_tup_fetch as rows_fetched,
  CASE
    WHEN idx_scan = 0 THEN 'UNUSED'
    WHEN idx_scan < 100 THEN 'LOW'
    WHEN idx_scan < 10000 THEN 'MODERATE'
    ELSE 'HIGH'
  END as usage_level
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC
LIMIT 30;

-- ============================================================================
-- 3. SEQUENTIAL SCAN DETECTION (potential bottlenecks)
-- ============================================================================

SELECT
  schemaname,
  relname as table_name,
  seq_scan,
  seq_tup_read,
  idx_scan,
  CASE
    WHEN seq_scan > 0 AND (idx_scan IS NULL OR idx_scan = 0) THEN 'NO INDEX USAGE'
    WHEN seq_scan > idx_scan THEN 'SEQ_DOMINANT'
    ELSE 'INDEX_DOMINANT'
  END as scan_pattern,
  n_live_tup as live_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
AND n_live_tup > 1000
ORDER BY seq_tup_read DESC
LIMIT 20;

-- ============================================================================
-- 4. SLOW QUERY DETECTION
-- ============================================================================

-- Requires pg_stat_statements extension
-- SELECT
--   query,
--   calls,
--   total_exec_time,
--   mean_exec_time,
--   min_exec_time,
--   max_exec_time,
--   stddev_exec_time,
--   rows
-- FROM pg_stat_statements
-- WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
-- ORDER BY mean_exec_time DESC
-- LIMIT 20;

-- ============================================================================
-- 5. CONNECTION PRESSURE
-- ============================================================================

SELECT
  state,
  COUNT(*) as count,
  MAX(EXTRACT(EPOCH FROM (now() - state_change))) as max_duration_seconds
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY count DESC;

-- ============================================================================
-- 6. RLS POLICY OVERHEAD ESTIMATE
-- ============================================================================

-- Count policies per table (more policies = more evaluation overhead)
SELECT
  schemaname,
  tablename,
  COUNT(*) as policy_count,
  STRING_AGG(policyname, ', ') as policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY policy_count DESC;

-- ============================================================================
-- 7. EXPORT JOBS STATUS
-- ============================================================================

SELECT
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM export_jobs
GROUP BY status;

-- ============================================================================
-- 8. NOTIFICATION GROWTH RATE
-- ============================================================================

SELECT
  DATE_TRUNC('week', created_at) as week,
  COUNT(*) as notifications_created,
  COUNT(*) FILTER (WHERE status = 'queued') as unread,
  COUNT(*) FILTER (WHERE status = 'sent') as sent
FROM notifications
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('week', created_at)
ORDER BY week;

-- ============================================================================
-- 9. MEMBERS GROWTH RATE
-- ============================================================================

SELECT
  DATE_TRUNC('month', joined_at) as month,
  COUNT(*) as new_members,
  COUNT(*) FILTER (WHERE status = 'active') as active,
  COUNT(*) FILTER (WHERE status = 'pending_approval') as pending
FROM members
WHERE joined_at > NOW() - INTERVAL '24 months'
GROUP BY DATE_TRUNC('month', joined_at)
ORDER BY month;

-- ============================================================================
-- 10. PAYMENT VOLUME
-- ============================================================================

SELECT
  DATE_TRUNC('week', created_at) as week,
  COUNT(*) as payments,
  COUNT(*) FILTER (WHERE status = 'Completed') as completed,
  COUNT(*) FILTER (WHERE status = 'Pending') as pending,
  COUNT(*) FILTER (WHERE status = 'Failed') as failed,
  SUM(amount) FILTER (WHERE status = 'Completed') as total_completed_amount
FROM payments
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('week', created_at)
ORDER BY week;

-- ============================================================================
-- 11. CONTRIBUTION VERIFICATION BACKLOG
-- ============================================================================

SELECT
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM contributions
GROUP BY status
ORDER BY count DESC;

-- ============================================================================
-- 12. CLAIMS PIPELINE
-- ============================================================================

SELECT
  status,
  COUNT(*) as count,
  SUM(amount_requested) as total_requested,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM claims
GROUP BY status
ORDER BY
  CASE status
    WHEN 'Submitted' THEN 1
    WHEN 'Under Review' THEN 2
    WHEN 'Additional Information Required' THEN 3
    WHEN 'Approved' THEN 4
    WHEN 'Paid' THEN 5
    WHEN 'Rejected' THEN 6
    WHEN 'Draft' THEN 7
  END;
