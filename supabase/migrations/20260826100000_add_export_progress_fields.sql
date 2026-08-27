-- ============================================================================
-- LUMA WELFARE — EXPORT JOBS: Progress Tracking + Background Processing
-- Migration: Add progress fields and worker support to export_jobs
-- ============================================================================

-- Add progress tracking columns
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS progress text;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS processed_rows bigint DEFAULT 0;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS total_rows bigint DEFAULT 0;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS worker_id text;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS file_size_bytes bigint;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS storage_path text;

-- Index for worker to find queued jobs
CREATE INDEX IF NOT EXISTS idx_export_jobs_status_created ON export_jobs(status, created_at ASC) WHERE status = 'pending';

-- Index for stale job recovery
CREATE INDEX IF NOT EXISTS idx_export_jobs_worker ON export_jobs(worker_id, started_at) WHERE worker_id IS NOT NULL;

-- Atomic job claiming function
-- Uses SELECT FOR UPDATE SKIP LOCKED to prevent two workers claiming the same job
CREATE OR REPLACE FUNCTION claim_export_job(p_worker_id text)
RETURNS TABLE (
  id uuid,
  type text,
  format text,
  status text,
  filters jsonb,
  created_by uuid,
  retry_count integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_job record;
BEGIN
  -- Find and lock the oldest pending job
  SELECT ej.id, ej.type, ej.format, ej.filters, ej.created_by, ej.retry_count
  INTO v_job
  FROM export_jobs ej
  WHERE ej.status = 'pending'
    AND ej.created_at < now() - interval '1 second'
  ORDER BY ej.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Claim the job
  UPDATE export_jobs
  SET status = 'processing',
      worker_id = p_worker_id,
      started_at = now()
  WHERE export_jobs.id = v_job.id;

  -- Return the claimed job
  id := v_job.id;
  type := v_job.type;
  format := v_job.format;
  status := 'processing';
  filters := v_job.filters;
  created_by := v_job.created_by;
  retry_count := v_job.retry_count;
  RETURN NEXT;
END;
$$;

-- Stale job recovery function
-- Requeues jobs stuck in 'processing' for more than 10 minutes
CREATE OR REPLACE FUNCTION recover_stale_export_jobs()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE export_jobs
  SET status = 'pending',
      worker_id = NULL,
      progress = 'Requeued after timeout',
      retry_count = retry_count + 1
  WHERE status = 'processing'
    AND started_at < now() - interval '10 minutes'
    AND retry_count < 3;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Cleanup expired exports function
CREATE OR REPLACE FUNCTION cleanup_expired_exports()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE export_jobs
  SET status = 'expired'
  WHERE status = 'completed'
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
