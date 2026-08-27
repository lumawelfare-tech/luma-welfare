-- =============================================================================
-- HEALTH CHECK HISTORY — Automated health check results tracking
-- Stores results from daily Vercel cron health checks for trend analysis.
-- =============================================================================

CREATE TABLE IF NOT EXISTS health_check_history (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  overall     TEXT NOT NULL CHECK (overall IN ('healthy', 'degraded', 'unhealthy')),
  duration_ms INTEGER NOT NULL,
  checks      JSONB NOT NULL DEFAULT '{}',
  alerts_sent INTEGER NOT NULL DEFAULT 0,
  metadata    JSONB DEFAULT '{}'
);

-- Index for time-range queries (dashboard, trend analysis)
CREATE INDEX IF NOT EXISTS idx_health_check_history_checked_at
  ON health_check_history (checked_at DESC);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_health_check_history_overall
  ON health_check_history (overall, checked_at DESC);

-- RLS — only service role can access (cron runs server-side)
ALTER TABLE health_check_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
  ON health_check_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Block all other roles
CREATE POLICY "Block authenticated"
  ON health_check_history
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Block anon"
  ON health_check_history
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- RPC to get recent health check history (admin-only, via Edge Function)
CREATE OR REPLACE FUNCTION get_health_check_history(
  p_limit INTEGER DEFAULT 30,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  id UUID,
  checked_at TIMESTAMPTZ,
  overall TEXT,
  duration_ms INTEGER,
  checks JSONB,
  alerts_sent INTEGER,
  metadata JSONB
)
LANGUAGE SQL STABLE
AS $$
  SELECT h.id, h.checked_at, h.overall, h.duration_ms,
         h.checks, h.alerts_sent, h.metadata
  FROM health_check_history h
  WHERE h.checked_at >= now() - (p_days || ' days')::INTERVAL
  ORDER BY h.checked_at DESC
  LIMIT p_limit;
$$;

-- RPC to get health check summary/trends
CREATE OR REPLACE FUNCTION get_health_check_summary(
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_checks BIGINT,
  healthy_count BIGINT,
  degraded_count BIGINT,
  unhealthy_count BIGINT,
  avg_duration_ms NUMERIC,
  last_check_at TIMESTAMPTZ,
  last_check_overall TEXT,
  uptime_pct NUMERIC
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    COUNT(*) as total_checks,
    COUNT(*) FILTER (WHERE overall = 'healthy') as healthy_count,
    COUNT(*) FILTER (WHERE overall = 'degraded') as degraded_count,
    COUNT(*) FILTER (WHERE overall = 'unhealthy') as unhealthy_count,
    ROUND(AVG(duration_ms), 0) as avg_duration_ms,
    MAX(checked_at) as last_check_at,
    (SELECT overall FROM health_check_history ORDER BY checked_at DESC LIMIT 1) as last_check_overall,
    CASE
      WHEN COUNT(*) > 0
      THEN ROUND(100.0 * COUNT(*) FILTER (WHERE overall = 'healthy') / COUNT(*), 2)
      ELSE 100.0
    END as uptime_pct
  FROM health_check_history
  WHERE checked_at >= now() - (p_days || ' days')::INTERVAL;
$$;

COMMENT ON TABLE health_check_history IS 'Automated health check results from Vercel cron — tracks system health over time';
COMMENT ON FUNCTION get_health_check_history IS 'Returns recent health check history for admin dashboard';
COMMENT ON FUNCTION get_health_check_summary IS 'Returns health check summary with uptime percentage';
