-- ============================================================================
-- LUMA WELFARE — PHASE 4: DATABASE PERFORMANCE & RLS OPTIMIZATION
-- Migration: Optimized RPC functions, RLS policies, search indexes
-- Target: Ready for 500K+ users with millions of related records
-- ============================================================================

-- ============================================================================
-- 1. ENABLE pg_trgm EXTENSION FOR SEARCH
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 2. OPTIMIZED ADMIN DASHBOARD RPC FUNCTIONS
-- Replaces multiple sequential count queries with single aggregation calls
-- ============================================================================

-- Admin dashboard summary: all counts in a single query
-- At 500K members, avoids 7+ separate COUNT(*) queries
CREATE OR REPLACE FUNCTION get_admin_dashboard_summary()
RETURNS TABLE (
  total_members bigint,
  total_subscriptions bigint,
  active_subscriptions bigint,
  pending_contributions bigint,
  pending_claims bigint,
  approved_claims bigint,
  paid_claims bigint,
  total_registration_fees bigint,
  paid_registration_fees bigint,
  unpaid_registration_fees bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    (SELECT COUNT(*) FROM members),
    (SELECT COUNT(*) FROM subscriptions),
    (SELECT COUNT(*) FROM subscriptions WHERE status = 'active'),
    (SELECT COUNT(*) FROM contributions WHERE status = 'Pending'),
    (SELECT COUNT(*) FROM claims WHERE status IN ('Submitted', 'Under Review', 'Additional Information Required')),
    (SELECT COUNT(*) FROM claims WHERE status = 'Approved'),
    (SELECT COUNT(*) FROM claims WHERE status = 'Paid'),
    (SELECT COUNT(*) FROM registration_fees WHERE fee_type = 'registration'),
    (SELECT COUNT(*) FROM registration_fees WHERE fee_type = 'registration' AND status = 'paid'),
    (SELECT COUNT(*) FROM registration_fees WHERE fee_type = 'registration' AND status = 'unpaid');
$$;

-- Admin dashboard: monthly contribution aggregation (replaces fetching 5000 rows to JS)
CREATE OR REPLACE FUNCTION get_admin_contributions_by_month(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  month text,
  total numeric,
  verified numeric,
  pending numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    to_char(c.created_at, 'YYYY-MM') as month,
    COALESCE(SUM(c.amount), 0) as total,
    COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'Verified'), 0) as verified,
    COALESCE(SUM(c.amount) FILTER (WHERE c.status != 'Verified'), 0) as pending
  FROM contributions c
  WHERE (p_from IS NULL OR c.created_at >= p_from)
    AND (p_to IS NULL OR c.created_at <= p_to)
  GROUP BY to_char(c.created_at, 'YYYY-MM')
  ORDER BY month;
$$;

-- Admin dashboard: claims by status (replaces fetching rows to JS)
CREATE OR REPLACE FUNCTION get_admin_claims_by_status(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  status text,
  count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.status,
    COUNT(*) as count
  FROM claims c
  WHERE (p_from IS NULL OR c.created_at >= p_from)
    AND (p_to IS NULL OR c.created_at <= p_to)
  GROUP BY c.status;
$$;

-- Admin dashboard: package breakdown (replaces fetching all active subscriptions to JS)
CREATE OR REPLACE FUNCTION get_admin_package_breakdown()
RETURNS TABLE (
  name text,
  count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.name,
    COUNT(*) as count
  FROM subscriptions s
  JOIN packages p ON p.id = s.package_id
  WHERE s.status = 'active'
  GROUP BY p.name
  ORDER BY count DESC;
$$;

-- Admin dashboard: report analytics (replaces fetching all reports to JS)
CREATE OR REPLACE FUNCTION get_admin_report_analytics(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_reports bigint,
  successful bigint,
  failed bigint,
  avg_records numeric,
  total_records bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status = 'error'),
    COALESCE(AVG(record_count), 0),
    COALESCE(SUM(record_count), 0)
  FROM report_history
  WHERE (p_from IS NULL OR generated_at >= p_from)
    AND (p_to IS NULL OR generated_at <= p_to);
$$;

-- ============================================================================
-- 3. OPTIMIZED MEMBER DASHBOARD RPC
-- Consolidates the fallback path (subscriptions + contributions + rules + quals)
-- into a single efficient query
-- ============================================================================

-- Drop and recreate build_member_dashboard with optimized query
CREATE OR REPLACE FUNCTION build_member_dashboard(p_member_id uuid)
RETURNS TABLE (
  subscription_id uuid,
  package jsonb,
  tier_name text,
  monthly_amount numeric,
  status text,
  waiting_period_months integer,
  contributions jsonb,
  qualification jsonb,
  welfare_cover_at_risk boolean,
  next_due_date date
)
LANGUAGE sql STABLE
AS $$
  WITH sub_data AS (
    SELECT
      s.id as subscription_id,
      s.status,
      s.started_at,
      s.next_due_date,
      s.package_id,
      jsonb_build_object('code', p.code, 'name', p.name, 'waiting_period_months', p.waiting_period_months) as package,
      s.package_tier_id
    FROM subscriptions s
    JOIN packages p ON p.id = s.package_id
    WHERE s.member_id = p_member_id
  ),
  tier_data AS (
    SELECT
      sd.subscription_id,
      pt.name as tier_name,
      COALESCE(pt.amount, 0) as monthly_amount
    FROM sub_data sd
    LEFT JOIN package_tiers pt ON pt.id = sd.package_tier_id
  ),
  contrib_data AS (
    SELECT
      c.subscription_id,
      COUNT(*) as total_count,
      COUNT(*) FILTER (WHERE c.status IN ('Paid', 'Verified', 'Late')) as paid_count,
      ARRAY_AGG(c.period) FILTER (WHERE c.status IN ('Paid', 'Verified', 'Late')) as covered_periods
    FROM contributions c
    WHERE c.member_id = p_member_id
    GROUP BY c.subscription_id
  ),
  qual_data AS (
    SELECT
      q.subscription_id,
      q.status as qual_status,
      q.eligible_from,
      q.criteria_met
    FROM qualifications q
    WHERE q.member_id = p_member_id
  ),
  rules_data AS (
    SELECT
      pr.package_id,
      jsonb_object_agg(pr.key, pr.value) as rules
    FROM package_rules pr
    WHERE pr.package_id IN (SELECT package_id FROM sub_data)
    GROUP BY pr.package_id
  ),
  current_period AS (
    SELECT to_char(now(), 'YYYY-MM') as period
  )
  SELECT
    sd.subscription_id,
    sd.package,
    td.tier_name,
    td.monthly_amount,
    sd.status,
    CASE
      WHEN sd.package->>'waiting_period_months' IS NULL OR sd.package->>'waiting_period_months' = '' THEN NULL
      ELSE (sd.package->>'waiting_period_months')::integer
    END as waiting_period_months,
    jsonb_build_object(
      'paid', COALESCE(cd.paid_count, 0),
      'required', CASE
        WHEN sd.package->>'waiting_period_months' IS NULL OR sd.package->>'waiting_period_months' = '' THEN NULL
        ELSE (sd.package->>'waiting_period_months')::integer
      END,
      'months_to_go', CASE
        WHEN sd.package->>'waiting_period_months' IS NULL OR sd.package->>'waiting_period_months' = '' THEN NULL
        ELSE GREATEST(0, (sd.package->>'waiting_period_months')::integer - COALESCE(cd.paid_count, 0))
      END,
      'current_month_paid', EXISTS (
        SELECT 1 FROM contributions c2
        WHERE c2.subscription_id = sd.subscription_id
          AND c2.period = cp.period
          AND c2.status IN ('Paid', 'Verified', 'Late')
      )
    ) as contributions,
    jsonb_build_object(
      'status', COALESCE(qd.qual_status, 'not_eligible'),
      'eligible_from', qd.eligible_from,
      'criteria_met', COALESCE(qd.criteria_met, '{}'::jsonb)
    ) as qualification,
    (sd.package->>'code' = 'welfare' AND NOT EXISTS (
      SELECT 1 FROM contributions c3
      WHERE c3.subscription_id = sd.subscription_id
        AND c3.period = cp.period
        AND c3.status IN ('Paid', 'Verified', 'Late')
    )) as welfare_cover_at_risk,
    sd.next_due_date
  FROM sub_data sd
  LEFT JOIN tier_data td ON td.subscription_id = sd.subscription_id
  LEFT JOIN contrib_data cd ON cd.subscription_id = sd.subscription_id
  LEFT JOIN qual_data qd ON qd.subscription_id = sd.subscription_id
  CROSS JOIN current_period cp
  ORDER BY sd.subscription_id;
$$;

-- ============================================================================
-- 4. SEARCH OPTIMIZATION: pg_trgm INDEXES
-- Enable efficient ILIKE '%search%' queries on high-traffic tables
-- ============================================================================

-- Members: admin search by name, phone, email, membership_number
CREATE INDEX IF NOT EXISTS idx_members_name_trgm ON members USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_members_phone_trgm ON members USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_members_email_trgm ON members USING gin (email gin_trgm_ops) WHERE email IS NOT NULL;

-- News: admin search by title
CREATE INDEX IF NOT EXISTS idx_news_events_title_trgm ON news_events USING gin (title gin_trgm_ops);

-- Gallery: admin search by title
CREATE INDEX IF NOT EXISTS idx_gallery_items_title_trgm ON gallery_items USING gin (title gin_trgm_ops) WHERE title IS NOT NULL;

-- ============================================================================
-- 5. RLS POLICY OPTIMIZATION
-- Use (SELECT auth.uid()) to evaluate once per query instead of per-row
-- ============================================================================

-- Members
DROP POLICY IF EXISTS "members_read_own" ON members;
CREATE POLICY "members_read_own" ON members
  FOR SELECT USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "members_update_own" ON members;
CREATE POLICY "members_update_own" ON members
  FOR UPDATE USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);

-- Family members
DROP POLICY IF EXISTS "family_read_own" ON family_members;
CREATE POLICY "family_read_own" ON family_members
  FOR SELECT USING ((SELECT auth.uid()) = member_id);

DROP POLICY IF EXISTS "family_write_own" ON family_members;
CREATE POLICY "family_write_own" ON family_members
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = member_id);

DROP POLICY IF EXISTS "family_update_own" ON family_members;
CREATE POLICY "family_update_own" ON family_members
  FOR UPDATE USING ((SELECT auth.uid()) = member_id) WITH CHECK ((SELECT auth.uid()) = member_id);

-- Subscriptions
DROP POLICY IF EXISTS "subscriptions_read_own" ON subscriptions;
CREATE POLICY "subscriptions_read_own" ON subscriptions
  FOR SELECT USING ((SELECT auth.uid()) = member_id);

-- Contributions
DROP POLICY IF EXISTS "contributions_read_own" ON contributions;
CREATE POLICY "contributions_read_own" ON contributions
  FOR SELECT USING ((SELECT auth.uid()) = member_id);

-- Payments
DROP POLICY IF EXISTS "payments_read_own" ON payments;
CREATE POLICY "payments_read_own" ON payments
  FOR SELECT USING ((SELECT auth.uid()) = member_id);

-- Claims
DROP POLICY IF EXISTS "claims_read_own" ON claims;
CREATE POLICY "claims_read_own" ON claims
  FOR SELECT USING ((SELECT auth.uid()) = member_id);

-- Claim documents (uses subquery - optimize the exists)
DROP POLICY IF EXISTS "claim_documents_read_own" ON claim_documents;
CREATE POLICY "claim_documents_read_own" ON claim_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id AND c.member_id = (SELECT auth.uid()))
  );

-- Qualifications
DROP POLICY IF EXISTS "qualifications_read_own" ON qualifications;
CREATE POLICY "qualifications_read_own" ON qualifications
  FOR SELECT USING ((SELECT auth.uid()) = member_id);

-- Notifications
DROP POLICY IF EXISTS "notifications_read_own" ON notifications;
CREATE POLICY "notifications_read_own" ON notifications
  FOR SELECT USING ((SELECT auth.uid()) = member_id);

-- Registration fees
DROP POLICY IF EXISTS "registration_fees_read_own" ON registration_fees;
CREATE POLICY "registration_fees_read_own" ON registration_fees
  FOR SELECT USING ((SELECT auth.uid()) = member_id);

DROP POLICY IF EXISTS "registration_fees_insert_own" ON registration_fees;
CREATE POLICY "registration_fees_insert_own" ON registration_fees
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = member_id);

-- Export jobs (optimize exists subquery)
DROP POLICY IF EXISTS "export_jobs_admin_read" ON export_jobs;
CREATE POLICY "export_jobs_admin_read" ON export_jobs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admins a WHERE a.id = (SELECT auth.uid()) AND a.is_active = true)
  );

DROP POLICY IF EXISTS "export_jobs_admin_insert" ON export_jobs;
CREATE POLICY "export_jobs_admin_insert" ON export_jobs
  FOR INSERT WITH CHECK (
    requested_by = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM admins a WHERE a.id = (SELECT auth.uid()) AND a.is_active = true)
  );

DROP POLICY IF EXISTS "export_jobs_admin_update" ON export_jobs;
CREATE POLICY "export_jobs_admin_update" ON export_jobs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM admins a WHERE a.id = (SELECT auth.uid()) AND a.is_active = true)
  );

-- ============================================================================
-- 6. INDEX CLEANUP — REMOVE REDUNDANT INDEXES
-- These are subsets of better composite indexes and add write overhead
-- ============================================================================

-- idx_subscriptions_status is redundant: idx_subscriptions_status_created already covers status filtering
-- (keeping it for now as the planner may still use it, but documenting redundancy)
-- idx_contributions_member is redundant: idx_contributions_member_period covers member_id
-- idx_claims_member is redundant: idx_claims_member_created covers member_id
-- idx_payments_member is redundant: idx_payments_member_created covers member_id
-- idx_family_members_member is redundant: idx_family_members_member_active covers member_id

-- NOTE: We do NOT drop these indexes in this migration.
-- They are documented as redundant and can be removed in a future cleanup
-- after confirming the composite indexes are active and used.

-- ============================================================================
-- 7. ADD MISSING COMPOSITE INDEXES
-- Cover common filter+sort patterns
-- ============================================================================

-- Admin claims: status + created_at DESC (most common admin query)
-- Already exists: idx_claims_status_created — verified

-- Contributions: subscription_id + status (for duplicate checks)
CREATE INDEX IF NOT EXISTS idx_contributions_subscription_status
  ON contributions(subscription_id, status);

-- Claims: member_id + status (for member claims list + admin filter)
CREATE INDEX IF NOT EXISTS idx_claims_member_status
  ON claims(member_id, status);

-- Notifications: member_id + status + created_at (for unread count + list)
CREATE INDEX IF NOT EXISTS idx_notifications_member_status_created
  ON notifications(member_id, status, created_at DESC);

-- Members: status + full_name (for admin filtered list + search)
CREATE INDEX IF NOT EXISTS idx_members_status_name
  ON members(status, full_name);

-- Export jobs: created_by + type + status (for concurrency guard check)
CREATE INDEX IF NOT EXISTS idx_export_jobs_creator_type_status
  ON export_jobs(created_by, type, status);

-- ============================================================================
-- 8. REPORT HISTORY INDEXES (if table exists)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'report_history') THEN
    -- Report history: schedule_name ilike search
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_report_history_schedule_name_trgm') THEN
      CREATE INDEX idx_report_history_schedule_name_trgm ON report_history USING gin (schedule_name gin_trgm_ops);
    END IF;

    -- Report history: status + generated_at (for filtered list)
    CREATE INDEX IF NOT EXISTS idx_report_history_status_generated
      ON report_history(status, generated_at DESC);

    -- Report history: report_type + generated_at (for type filter)
    CREATE INDEX IF NOT EXISTS idx_report_history_type_generated
      ON report_history(report_type, generated_at DESC);
  END IF;
END $$;

-- Scheduled reports: enabled + next_run_at (for process-all query)
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_enabled_next_run
  ON scheduled_reports(enabled, next_run_at) WHERE enabled = true;
