-- ============================================================================
-- Phase 1 (Blueprint): schema foundation + funnel drift fix
-- Idempotent. Does not touch payments / Daraja.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fix get_membership_funnel: stop depending on missing members.email_verified
--    Use Auth email_confirmed_at (members.id = auth.users.id).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_membership_funnel()
RETURNS TABLE (
  stage text,
  count bigint,
  pct_of_total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH total AS (
    SELECT COUNT(*)::bigint AS t FROM public.members
  ),
  funnel AS (
    SELECT 'Registered'::text AS stage, COUNT(*)::bigint AS count FROM public.members
    UNION ALL
    SELECT 'Email Verified', COUNT(*)::bigint
    FROM public.members m
    INNER JOIN auth.users u ON u.id = m.id
    WHERE u.email_confirmed_at IS NOT NULL
    UNION ALL
    SELECT 'Active', COUNT(*)::bigint FROM public.members WHERE status = 'active'
    UNION ALL
    SELECT 'Has Subscription', COUNT(*)::bigint FROM (
      SELECT DISTINCT m.id
      FROM public.members m
      JOIN public.subscriptions s ON s.member_id = m.id AND s.status = 'active'
    ) x
    UNION ALL
    SELECT 'Has Contribution', COUNT(*)::bigint FROM (
      SELECT DISTINCT m.id
      FROM public.members m
      JOIN public.contributions c ON c.member_id = m.id AND c.status IN ('Paid', 'Verified')
    ) x
    UNION ALL
    SELECT 'Qualified', COUNT(*)::bigint FROM public.qualifications WHERE status = 'eligible'
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

REVOKE ALL ON FUNCTION public.get_membership_funnel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_membership_funnel() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. scheduled_reports (idempotent) — used by admin-scheduled-reports EF
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  report_type text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  frequency text NOT NULL,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_generated_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_enabled_next_run
  ON public.scheduled_reports (enabled, next_run_at)
  WHERE enabled = true;

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
-- No member/anon policies — service_role / admin Edge only

-- ---------------------------------------------------------------------------
-- 3. report_history (idempotent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES public.scheduled_reports(id) ON DELETE SET NULL,
  schedule_name text,
  report_type text NOT NULL,
  filename text,
  record_count integer,
  status text NOT NULL DEFAULT 'success',
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_history_status_generated
  ON public.report_history (status, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_history_type_generated
  ON public.report_history (report_type, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_history_generated_at
  ON public.report_history (generated_at DESC);

ALTER TABLE public.report_history ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. saved_reports bookmarks (idempotent) — admin-reports EF
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  report_type text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_created_by
  ON public.saved_reports (created_by);

ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. report-files storage bucket (private)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-files',
  'report-files',
  false,
  52428800,
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/pdf',
    'application/json'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- No public storage policies — uploads/downloads via service_role + signed URLs
