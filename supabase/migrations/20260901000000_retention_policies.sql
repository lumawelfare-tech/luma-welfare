-- ============================================================================
-- NOTIFICATION RETENTION POLICY
-- ============================================================================
-- Notifications older than 90 days are cleaned up in batches.
-- Unread critical notifications (payment, claim) are retained for 180 days.
-- In-app notifications are the primary retention concern.

-- Function to clean up old notifications in safe batches
CREATE OR REPLACE FUNCTION cleanup_old_notifications(p_batch_size INT DEFAULT 1000)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT := 0;
  v_total_deleted INT := 0;
  v_cutoff_90d TIMESTAMPTZ := NOW() - INTERVAL '90 days';
  v_cutoff_180d TIMESTAMPTZ := NOW() - INTERVAL '180 days';
BEGIN
  -- Batch 1: Delete read notifications older than 90 days
  LOOP
    DELETE FROM notifications
    WHERE id IN (
      SELECT id FROM notifications
      WHERE status = 'sent'
        AND created_at < v_cutoff_90d
      LIMIT p_batch_size
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total_deleted := v_total_deleted + v_deleted;

    -- Exit when no more rows deleted
    EXIT WHEN v_deleted = 0;

    -- Commit batch and pause briefly
    COMMIT;
    PERFORM pg_sleep(0.1);
  END LOOP;

  -- Batch 2: Delete unread notifications older than 180 days
  -- (even unread notifications shouldn't live forever)
  LOOP
    DELETE FROM notifications
    WHERE id IN (
      SELECT id FROM notifications
      WHERE created_at < v_cutoff_180d
      LIMIT p_batch_size
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total_deleted := v_total_deleted + v_deleted;

    EXIT WHEN v_deleted = 0;

    COMMIT;
    PERFORM pg_sleep(0.1);
  END LOOP;

  RETURN v_total_deleted;
END;
$$;

-- Function to get notification retention stats
CREATE OR REPLACE FUNCTION get_notification_retention_stats()
RETURNS TABLE (
  total_notifications BIGINT,
  older_than_90d BIGINT,
  older_than_180d BIGINT,
  read_older_than_90d BIGINT,
  estimated_cleanup_rows BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT count(*) FROM notifications)::BIGINT,
    (SELECT count(*) FROM notifications WHERE created_at < NOW() - INTERVAL '90 days')::BIGINT,
    (SELECT count(*) FROM notifications WHERE created_at < NOW() - INTERVAL '180 days')::BIGINT,
    (SELECT count(*) FROM notifications WHERE status = 'sent' AND created_at < NOW() - INTERVAL '90 days')::BIGINT,
    (SELECT count(*) FROM notifications WHERE status = 'sent' AND created_at < NOW() - INTERVAL '90 days')::BIGINT;
END;
$$;

-- ============================================================================
-- AUDIT LOG RETENTION POLICY
-- ============================================================================
-- Audit logs are critical for compliance but grow unboundedly.
-- Strategy: Keep last 2 years online, archive older records.
-- Financial audit logs (payments, contributions, claims) are retained permanently.

-- Function to clean up old audit logs in safe batches
-- Only deletes non-financial audit logs older than 2 years
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(p_batch_size INT DEFAULT 1000)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT := 0;
  v_total_deleted INT := 0;
  v_cutoff TIMESTAMPTZ := NOW() - INTERVAL '2 years';
  -- Financial actions that must NEVER be deleted
  v_financial_actions TEXT[] := ARRAY[
    'verified_contribution', 'rejected_contribution',
    'approved_claim', 'rejected_claim', 'paid_claim',
    'approved_payout', 'processed_payout',
    'completed_payment', 'failed_payment',
    'recorded_contribution', 'membership_activated'
  ];
BEGIN
  -- Delete non-financial audit logs older than 2 years
  LOOP
    DELETE FROM audit_logs
    WHERE id IN (
      SELECT id FROM audit_logs
      WHERE created_at < v_cutoff
        AND NOT (action = ANY(v_financial_actions))
      LIMIT p_batch_size
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total_deleted := v_total_deleted + v_deleted;

    EXIT WHEN v_deleted = 0;

    COMMIT;
    PERFORM pg_sleep(0.1);
  END LOOP;

  RETURN v_total_deleted;
END;
$$;

-- Function to get audit log retention stats
CREATE OR REPLACE FUNCTION get_audit_log_retention_stats()
RETURNS TABLE (
  total_logs BIGINT,
  older_than_1y BIGINT,
  older_than_2y BIGINT,
  financial_logs BIGINT,
  non_financial_older_than_2y BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_financial_actions TEXT[] := ARRAY[
    'verified_contribution', 'rejected_contribution',
    'approved_claim', 'rejected_claim', 'paid_claim',
    'approved_payout', 'processed_payout',
    'completed_payment', 'failed_payment',
    'recorded_contribution', 'membership_activated'
  ];
BEGIN
  RETURN QUERY
  SELECT
    (SELECT count(*) FROM audit_logs)::BIGINT,
    (SELECT count(*) FROM audit_logs WHERE created_at < NOW() - INTERVAL '1 year')::BIGINT,
    (SELECT count(*) FROM audit_logs WHERE created_at < NOW() - INTERVAL '2 years')::BIGINT,
    (SELECT count(*) FROM audit_logs WHERE action = ANY(v_financial_actions))::BIGINT,
    (SELECT count(*) FROM audit_logs WHERE created_at < NOW() - INTERVAL '2 years' AND NOT (action = ANY(v_financial_actions)))::BIGINT;
END;
$$;

-- ============================================================================
-- INDEXES FOR RETENTION CLEANUP
-- ============================================================================

-- Notification cleanup index (status + created_at)
CREATE INDEX IF NOT EXISTS idx_notifications_cleanup
  ON notifications (status, created_at)
  WHERE status = 'sent';

-- Audit log cleanup index (non-financial actions by date)
CREATE INDEX IF NOT EXISTS idx_audit_logs_cleanup
  ON audit_logs (created_at, action);

-- ============================================================================
-- EXPORT JOB RETENTION
-- ============================================================================

-- Function to clean up completed/failed export jobs older than 30 days
CREATE OR REPLACE FUNCTION cleanup_old_export_jobs(p_batch_size INT DEFAULT 100)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT := 0;
  v_total_deleted INT := 0;
  v_cutoff TIMESTAMPTZ := NOW() - INTERVAL '30 days';
BEGIN
  LOOP
    DELETE FROM export_jobs
    WHERE id IN (
      SELECT id FROM export_jobs
      WHERE status IN ('completed', 'failed', 'cancelled')
        AND created_at < v_cutoff
      LIMIT p_batch_size
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total_deleted := v_total_deleted + v_deleted;

    EXIT WHEN v_deleted = 0;

    COMMIT;
    PERFORM pg_sleep(0.05);
  END LOOP;

  RETURN v_total_deleted;
END;
$$;
