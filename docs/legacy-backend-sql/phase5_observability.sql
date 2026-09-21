-- ============================================================================
-- LUMA WELFARE — PHASE 5: DATABASE OBSERVABILITY
--
-- Functions for monitoring query performance, table health, and index usage.
-- Run against staging/production database.
-- ============================================================================

-- ============================================================================
-- 1. TABLE SIZE MONITORING
-- Returns approximate row counts and table sizes for all major tables.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_table_sizes()
RETURNS TABLE (
  table_name text,
  row_count bigint,
  total_size text,
  index_size text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.relname::text as table_name,
    c.reltuples::bigint as row_count,
    pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
    pg_size_pretty(pg_indexes_size(c.oid)) as index_size
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.reltuples > 0
  ORDER BY c.reltuples DESC;
$$;

-- ============================================================================
-- 2. INDEX USAGE MONITORING
-- Identifies unused or rarely used indexes that may be candidates for removal.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_index_usage()
RETURNS TABLE (
  index_name text,
  table_name text,
  index_scans bigint,
  rows_read bigint,
  rows_fetched bigint,
  size text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    i.relname::text as index_name,
    t.relname::text as table_name,
    s.idx_scan as index_scans,
    s.idx_tup_read as rows_read,
    s.idx_tup_fetch as rows_fetched,
    pg_size_pretty(pg_relation_size(i.oid)) as size
  FROM pg_stat_user_indexes s
  JOIN pg_index ix ON ix.indexrelid = s.indexrelid
  JOIN pg_class i ON i.oid = s.indexrelid
  JOIN pg_class t ON t.oid = s.relid
  WHERE s.schemaname = 'public'
  ORDER BY s.idx_scan DESC;
$$;

-- ============================================================================
-- 3. SLOW QUERY DETECTION
-- Uses pg_stat_statements if available, otherwise provides guidance.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_slow_queries()
RETURNS TABLE (
  query_text text,
  calls bigint,
  total_time_ms numeric,
  mean_time_ms numeric,
  rows_returned bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    query::text,
    calls,
    round(total_exec_time::numeric, 2) as total_time_ms,
    round(mean_exec_time::numeric, 2) as mean_time_ms,
    rows as rows_returned
  FROM pg_stat_statements
  WHERE mean_exec_time > 100  -- queries averaging > 100ms
  ORDER BY mean_exec_time DESC
  LIMIT 20;
$$;

-- ============================================================================
-- 4. TABLE BLOAT DETECTION
-- Identifies tables with high dead tuple ratios that need VACUUM.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_table_bloat()
RETURNS TABLE (
  table_name text,
  live_tuples bigint,
  dead_tuples bigint,
  dead_ratio numeric,
  last_autovacuum text,
  last_autoanalyze text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.relname::text as table_name,
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    CASE
      WHEN n_live_tup > 0
      THEN round((n_dead_tup::numeric / n_live_tup) * 100, 2)
      ELSE 0
    END as dead_ratio,
    COALESCE(last_autovacuum::text, 'never') as last_autovacuum,
    COALESCE(last_autoanalyze::text, 'never') as last_autoanalyze
  FROM pg_stat_user_tables
  JOIN pg_class c ON c.oid = pg_stat_user_tables.relid
  WHERE n_dead_tup > 1000
  ORDER BY n_dead_tup DESC;
$$;

-- ============================================================================
-- 5. CONNECTION MONITORING
-- Shows current connection state.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_connection_stats()
RETURNS TABLE (
  state text,
  count bigint,
  max_duration interval
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(state, 'idle') as state,
    COUNT(*) as count,
    MAX(now() - state_change) as max_duration
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY state;
$$;

-- ============================================================================
-- 6. RLS POLICY AUDIT
-- Lists all RLS policies and their complexity indicators.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_rls_policies()
RETURNS TABLE (
  table_name text,
  policy_name text,
  command text,
  using_expr text,
  with_check_expr text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    schemaname || '.' || tablename as table_name,
    policyname as policy_name,
    cmd as command,
    qual as using_expr,
    with_check as with_check_expr
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
$$;

-- ============================================================================
-- 7. QUERY PLAN ANALYSIS HELPER
-- Run EXPLAIN ANALYZE on a query safely.
-- Usage: SELECT * FROM analyze_query('SELECT * FROM members WHERE status = ''active''');
-- ============================================================================

CREATE OR REPLACE FUNCTION analyze_query(query_text text)
RETURNS TABLE (plan text)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY EXECUTE 'EXPLAIN (FORMAT TEXT) ' || query_text;
END;
$$;

-- ============================================================================
-- 8. PERFORMANCE DASHBOARD SUMMARY
-- Single-call dashboard for database health.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_performance_summary()
RETURNS TABLE (
  total_members bigint,
  total_subscriptions bigint,
  total_contributions bigint,
  total_claims bigint,
  total_notifications bigint,
  total_audit_logs bigint,
  contributions_table_size text,
  members_table_size text,
  active_connections bigint,
  dead_tuple_tables bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    (SELECT COUNT(*) FROM members),
    (SELECT COUNT(*) FROM subscriptions),
    (SELECT COUNT(*) FROM contributions),
    (SELECT COUNT(*) FROM claims),
    (SELECT COUNT(*) FROM notifications),
    (SELECT COUNT(*) FROM audit_logs),
    pg_size_pretty(pg_total_relation_size('contributions')),
    pg_size_pretty(pg_total_relation_size('members')),
    (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active' AND datname = current_database()),
    (SELECT COUNT(*) FROM pg_stat_user_tables WHERE n_dead_tup > 10000);
$$;
