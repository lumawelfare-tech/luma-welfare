-- ============================================================================
-- LUMA WELFARE — EXPORT JOBS TABLE
-- Migration: Add export_jobs for server-side export processing
-- ============================================================================

-- Export job status enum
DO $$ BEGIN
  CREATE TYPE export_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Export jobs table
CREATE TABLE IF NOT EXISTS export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  export_type text NOT NULL,  -- 'members', 'subscriptions', 'contributions', 'claims', 'payments', 'registration_fees', 'reports'
  format text NOT NULL DEFAULT 'csv' CHECK (format IN ('csv', 'xlsx', 'pdf')),
  filters jsonb NOT NULL DEFAULT '{}',  -- stored filters for reproducibility
  status export_status NOT NULL DEFAULT 'queued',
  progress text,  -- human-readable progress message
  file_path text,  -- Supabase Storage path
  file_name text,  -- display filename
  row_count bigint,
  file_size_bytes bigint,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz  -- when the export file should be cleaned up
);

-- Indexes for export_jobs
CREATE INDEX IF NOT EXISTS idx_export_jobs_requested_by ON export_jobs(requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_expires ON export_jobs(expires_at) WHERE expires_at IS NOT NULL;

-- RLS: admins can only see their own exports
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;

-- Admin users can read their own export jobs
CREATE POLICY "export_jobs_admin_read" ON export_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins a
      WHERE a.id = auth.uid() AND a.is_active = true
    )
  );

-- Admin users can create export jobs
CREATE POLICY "export_jobs_admin_insert" ON export_jobs
  FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM admins a
      WHERE a.id = auth.uid() AND a.is_active = true
    )
  );

-- Admin users can update their own export jobs (for status updates)
CREATE POLICY "export_jobs_admin_update" ON export_jobs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admins a
      WHERE a.id = auth.uid() AND a.is_active = true
    )
  );

-- Function to clean up expired exports
CREATE OR REPLACE FUNCTION cleanup_expired_exports()
RETURNS void
LANGUAGE sql
AS $$
  UPDATE export_jobs SET status = 'expired' WHERE status = 'completed' AND expires_at < now();
$$;
