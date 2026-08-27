-- ============================================================================
-- EXPORT WORKER HARDENING
-- ============================================================================
-- Adds concurrency limits, per-admin quotas, and job priority system.

-- Add priority column to export_jobs
ALTER TABLE export_jobs
  ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 5;

-- Add admin concurrency tracking
CREATE TABLE IF NOT EXISTS export_admin_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  max_concurrent INT NOT NULL DEFAULT 2,
  max_per_hour INT NOT NULL DEFAULT 10,
  current_running INT NOT NULL DEFAULT 0,
  hourly_count INT NOT NULL DEFAULT 0,
  hourly_reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(admin_id)
);

-- RLS for export admin quotas
ALTER TABLE export_admin_quotas ENABLE ROW LEVEL SECURITY;

-- Only admins can see their own quotas
CREATE POLICY "export_quotas_admin_read"
  ON export_admin_quotas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid() AND is_active = true
    )
  );

-- Function to check if admin can start a new export
CREATE OR REPLACE FUNCTION can_start_export(p_admin_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota RECORD;
  v_global_running INT;
  v_max_global INT := 10; -- Maximum concurrent exports system-wide
BEGIN
  -- Get or create admin quota
  INSERT INTO export_admin_quotas (admin_id, max_concurrent, max_per_hour)
  VALUES (p_admin_id, 2, 10)
  ON CONFLICT (admin_id) DO NOTHING;

  SELECT * INTO v_quota
  FROM export_admin_quotas
  WHERE admin_id = p_admin_id;

  -- Reset hourly count if needed
  IF v_quota.hourly_reset_at < NOW() THEN
    UPDATE export_admin_quotas
    SET hourly_count = 0, hourly_reset_at = NOW()
    WHERE admin_id = p_admin_id;
    v_quota.hourly_count := 0;
  END IF;

  -- Check per-admin limits
  IF v_quota.current_running >= v_quota.max_concurrent THEN
    RETURN FALSE;
  END IF;

  IF v_quota.hourly_count >= v_quota.max_per_hour THEN
    RETURN FALSE;
  END IF;

  -- Check global concurrency
  SELECT count(*) INTO v_global_running
  FROM export_jobs
  WHERE status = 'processing';

  IF v_global_running >= v_max_global THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- Function to claim an export job (atomic)
CREATE OR REPLACE FUNCTION claim_export_job(p_worker_id TEXT)
RETURNS TABLE (
  job_id UUID,
  job_type TEXT,
  job_params JSONB,
  created_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
BEGIN
  -- Find and claim the highest priority pending job
  SELECT id, type, params, created_by INTO v_job
  FROM export_jobs
  WHERE status = 'pending'
    AND (started_at IS NULL OR started_at < NOW() - INTERVAL '10 minutes')
  ORDER BY priority ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Update job status
  UPDATE export_jobs
  SET
    status = 'processing',
    worker_id = p_worker_id,
    started_at = NOW(),
    retry_count = retry_count + 1
  WHERE id = v_job.id;

  -- Increment admin running count
  UPDATE export_admin_quotas
  SET current_running = current_running + 1
  WHERE admin_id = v_job.created_by;

  job_id := v_job.id;
  job_type := v_job.type;
  job_params := v_job.params;
  created_by := v_job.created_by;
  RETURN NEXT;
END;
$$;

-- Function to complete an export job
CREATE OR REPLACE FUNCTION complete_export_job(
  p_job_id UUID,
  p_status TEXT DEFAULT 'completed',
  p_file_path TEXT DEFAULT NULL,
  p_file_size BIGINT DEFAULT NULL,
  p_row_count INT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by UUID;
BEGIN
  -- Get the job's creator
  SELECT created_by INTO v_created_by
  FROM export_jobs WHERE id = p_job_id;

  -- Update job status
  UPDATE export_jobs
  SET
    status = p_status,
    completed_at = NOW(),
    file_path = COALESCE(p_file_path, file_path),
    file_size = COALESCE(p_file_size, file_size),
    row_count = COALESCE(p_row_count, row_count),
    error_message = p_error
  WHERE id = p_job_id;

  -- Decrement admin running count
  IF v_created_by IS NOT NULL THEN
    UPDATE export_admin_quotas
    SET current_running = GREATEST(0, current_running - 1)
    WHERE admin_id = v_created_by;
  END IF;
END;
$$;

-- Function to increment admin hourly count
CREATE OR REPLACE FUNCTION increment_export_hourly_count(p_admin_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO export_admin_quotas (admin_id, hourly_count, hourly_reset_at)
  VALUES (p_admin_id, 1, NOW())
  ON CONFLICT (admin_id) DO UPDATE
  SET hourly_count = CASE
    WHEN export_admin_quotas.hourly_reset_at < NOW() THEN 1
    ELSE export_admin_quotas.hourly_count + 1
  END,
  hourly_reset_at = CASE
    WHEN export_admin_quotas.hourly_reset_at < NOW() THEN NOW()
    ELSE export_admin_quotas.hourly_reset_at
  END;
END;
$$;

-- updated_at trigger for export_admin_quotas
CREATE TRIGGER trg_export_admin_quotas_updated
  BEFORE UPDATE ON export_admin_quotas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Index for efficient job claiming
CREATE INDEX IF NOT EXISTS idx_export_jobs_claim
  ON export_jobs (status, priority, created_at)
  WHERE status = 'pending';
