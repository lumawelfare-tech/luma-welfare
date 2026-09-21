-- ============================================================================
-- LUMA WELFARE — SCALABILITY INDEXES & DATABASE OPTIMIZATION
-- Migration: Add indexes for 500K+ user scale
-- ============================================================================

-- ============================================================================
-- 1. COMPOSITE INDEXES FOR AUTH FLOWS (hit on EVERY request)
-- ============================================================================

-- members: auth-me, auth-login, auth-google-authorize check status
CREATE INDEX IF NOT EXISTS idx_members_id_status ON members(id, status);

-- members: bulk import email lookup, password change verification
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email) WHERE email IS NOT NULL;

-- members: admin list filter + ORDER BY
CREATE INDEX IF NOT EXISTS idx_members_status_joined ON members(status, joined_at DESC);

-- members: membership number lookup (unique already, but explicit)
CREATE INDEX IF NOT EXISTS idx_members_membership_number ON members(membership_number) WHERE membership_number IS NOT NULL;

-- ============================================================================
-- 2. SUBSCRIPTIONS — MEMBER + STATUS COMPOSITE (highest query volume)
-- ============================================================================

-- subscriptions: member-dashboard, auth-me, member-contributions
CREATE INDEX IF NOT EXISTS idx_subscriptions_member_status ON subscriptions(member_id, status);

-- subscriptions: admin-subscriptions filter, admin-dashboard package breakdown
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- subscriptions: admin-subscriptions list ORDER BY
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON subscriptions(created_at DESC);

-- subscriptions: admin-reports package filter
CREATE INDEX IF NOT EXISTS idx_subscriptions_package_id ON subscriptions(package_id);

-- ============================================================================
-- 3. CONTRIBUTIONS — PERIOD AND STATUS COMPOSITES
-- ============================================================================

-- contributions: member-contributions, member-dashboard
CREATE INDEX IF NOT EXISTS idx_contributions_member_period ON contributions(member_id, period DESC);

-- contributions: admin-contributions filter, admin-dashboard counts
CREATE INDEX IF NOT EXISTS idx_contributions_status_created ON contributions(status, created_at);

-- contributions: payments-callback duplicate check
CREATE INDEX IF NOT EXISTS idx_contributions_subscription_period ON contributions(subscription_id, period);

-- contributions: admin-dashboard chart data (date range queries)
CREATE INDEX IF NOT EXISTS idx_contributions_created_at ON contributions(created_at);

-- ============================================================================
-- 4. CLAIMS — MEMBER + STATUS COMPOSITES
-- ============================================================================

-- claims: member-claims list ORDER BY
CREATE INDEX IF NOT EXISTS idx_claims_member_created ON claims(member_id, created_at DESC);

-- claims: admin-dashboard status counts, admin-claims filter
CREATE INDEX IF NOT EXISTS idx_claims_status_created ON claims(status, created_at);

-- claims: admin-reports package filter
CREATE INDEX IF NOT EXISTS idx_claims_package_id ON claims(package_id);

-- ============================================================================
-- 5. NOTIFICATIONS — UNREAD COUNT QUERIES
-- ============================================================================

-- notifications: member-notifications unread count + list
CREATE INDEX IF NOT EXISTS idx_notifications_member_status ON notifications(member_id, status);

-- notifications: admin-notifications unread count + list
CREATE INDEX IF NOT EXISTS idx_notifications_member_channel ON notifications(member_id, channel, status);

-- ============================================================================
-- 6. PAYMENTS — LOOKUP AND AUDIT
-- ============================================================================

-- payments: member list ORDER BY
CREATE INDEX IF NOT EXISTS idx_payments_member_created ON payments(member_id, created_at DESC);

-- payments: M-Pesa callback lookup (unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_payment_reference ON payments(payment_reference) WHERE payment_reference IS NOT NULL;

-- ============================================================================
-- 7. AUDIT LOGS — RETENTION AND QUERYING
-- ============================================================================

-- audit_logs: admin-settings list ORDER BY
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- audit_logs: filter by resource type
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource, created_at DESC);

-- audit_logs: filter by actor
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

-- ============================================================================
-- 8. NEWS EVENTS — PUBLIC PUBLISH FILTER
-- ============================================================================

-- news_events: published news listing
CREATE INDEX IF NOT EXISTS idx_news_events_published ON news_events(is_published, published_at DESC) WHERE is_published = true;

-- ============================================================================
-- 9. REGISTRATION FEES — ADDITIONAL LOOKUPS
-- ============================================================================

-- registration_fees: fee_type + status filter (admin pending fees)
CREATE INDEX IF NOT EXISTS idx_registration_fees_type_status ON registration_fees(fee_type, status);

-- registration_fees: transaction reference lookup (M-Pesa callback)
CREATE INDEX IF NOT EXISTS idx_registration_fees_transaction_ref ON registration_fees(transaction_reference) WHERE transaction_reference IS NOT NULL;

-- ============================================================================
-- 10. PACKAGE TIERS AND RULES — FK INDEXES
-- ============================================================================

-- package_tiers: FK lookup
CREATE INDEX IF NOT EXISTS idx_package_tiers_package ON package_tiers(package_id);

-- package_rules: FK lookup
CREATE INDEX IF NOT EXISTS idx_package_rules_package ON package_rules(package_id);

-- ============================================================================
-- 11. FAMILY MEMBERS — MEMBER + ACTIVE
-- ============================================================================

-- family_members: member's active dependents
CREATE INDEX IF NOT EXISTS idx_family_members_member_active ON family_members(member_id, is_active);

-- ============================================================================
-- 12. QUALIFICATIONS — LOOKUP
-- ============================================================================

-- qualifications: member_id lookup
CREATE INDEX IF NOT EXISTS idx_qualifications_member ON qualifications(member_id);

-- ============================================================================
-- 13. PAYOUTS — MEMBER AND CLAIM LOOKUPS
-- ============================================================================

-- payouts: member payouts list
CREATE INDEX IF NOT EXISTS idx_payouts_member ON payouts(member_id);

-- payouts: claim lookup
CREATE INDEX IF NOT EXISTS idx_payouts_claim ON payouts(claim_id);

-- ============================================================================
-- 14. PLATFORM SETTINGS — UNIQUE KEY (already PK, but explicit)
-- ============================================================================

-- platform_settings: already has PK on key, no additional index needed

-- ============================================================================
-- 15. REPORT HISTORY — IF TABLE EXISTS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'report_history') THEN
    CREATE INDEX IF NOT EXISTS idx_report_history_generated_at ON report_history(generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_report_history_created_by ON report_history(created_by);
  END IF;
END $$;

-- ============================================================================
-- 16. SAVED REPORTS — IF TABLE EXISTS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'saved_reports') THEN
    CREATE INDEX IF NOT EXISTS idx_saved_reports_created_by ON saved_reports(created_by);
  END IF;
END $$;

-- ============================================================================
-- 17. DATABASE FUNCTIONS FOR AGGREGATE QUERIES
-- (Replace JS-side aggregation with SQL-side for dashboard/reports)
-- ============================================================================

-- Dashboard contribution stats for date range
CREATE OR REPLACE FUNCTION get_contribution_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_amount numeric,
  verified_amount numeric,
  pending_amount numeric,
  count bigint,
  verified_count bigint,
  pending_count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(SUM(amount), 0) as total_amount,
    COALESCE(SUM(amount) FILTER (WHERE status = 'Verified'), 0) as verified_amount,
    COALESCE(SUM(amount) FILTER (WHERE status = 'Pending'), 0) as pending_amount,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE status = 'Verified') as verified_count,
    COUNT(*) FILTER (WHERE status = 'Pending') as pending_count
  FROM contributions
  WHERE (p_from IS NULL OR created_at >= p_from)
    AND (p_to IS NULL OR created_at <= p_to);
$$;

-- Dashboard claim stats for date range
CREATE OR REPLACE FUNCTION get_claim_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_amount numeric,
  approved_amount numeric,
  paid_amount numeric,
  count bigint,
  submitted_count bigint,
  approved_count bigint,
  paid_count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(SUM(amount_requested), 0) as total_amount,
    COALESCE(SUM(amount_requested) FILTER (WHERE status = 'Approved'), 0) as approved_amount,
    COALESCE(SUM(amount_requested) FILTER (WHERE status = 'Paid'), 0) as paid_amount,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE status = 'Submitted') as submitted_count,
    COUNT(*) FILTER (WHERE status = 'Approved') as approved_count,
    COUNT(*) FILTER (WHERE status = 'Paid') as paid_count
  FROM claims
  WHERE (p_from IS NULL OR created_at >= p_from)
    AND (p_to IS NULL OR created_at <= p_to);
$$;

-- Dashboard registration fee stats
CREATE OR REPLACE FUNCTION get_registration_fee_stats()
RETURNS TABLE (
  total_amount numeric,
  paid_amount numeric,
  pending_count bigint,
  paid_count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(SUM(amount), 0) as total_amount,
    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as paid_amount,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'paid') as paid_count
  FROM registration_fees
  WHERE fee_type = 'registration';
$$;

-- Active subscription count
CREATE OR REPLACE FUNCTION get_active_subscription_count()
RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*) FROM subscriptions WHERE status = 'active';
$$;

-- Member dashboard summary (replaces fallback JS queries)
CREATE OR REPLACE FUNCTION get_member_dashboard(p_member_id uuid)
RETURNS TABLE (
  member_full_name text,
  member_status text,
  subscription_count bigint,
  active_subscription_count bigint,
  contribution_total numeric,
  contribution_count bigint,
  latest_contribution_date timestamptz,
  claim_count bigint,
  pending_claim_count bigint,
  unread_notifications bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    m.full_name,
    m.status::text,
    (SELECT COUNT(*) FROM subscriptions s WHERE s.member_id = p_member_id),
    (SELECT COUNT(*) FROM subscriptions s WHERE s.member_id = p_member_id AND s.status = 'active'),
    (SELECT COALESCE(SUM(c.amount), 0) FROM contributions c WHERE c.member_id = p_member_id),
    (SELECT COUNT(*) FROM contributions c WHERE c.member_id = p_member_id),
    (SELECT MAX(c.created_at) FROM contributions c WHERE c.member_id = p_member_id),
    (SELECT COUNT(*) FROM claims cl WHERE cl.member_id = p_member_id),
    (SELECT COUNT(*) FROM claims cl WHERE cl.member_id = p_member_id AND cl.status IN ('Draft', 'Submitted', 'Under Review')),
    (SELECT COUNT(*) FROM notifications n WHERE n.member_id = p_member_id AND n.status = 'queued')
  FROM members m
  WHERE m.id = p_member_id;
$$;

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

-- Report KPI aggregation (replaces fetching all rows to JS)
CREATE OR REPLACE FUNCTION get_report_kpi(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  contribution_total numeric,
  contribution_verified numeric,
  contribution_pending numeric,
  claim_total numeric,
  claim_approved numeric,
  claim_paid numeric,
  registration_fee_total numeric,
  registration_fee_paid numeric,
  active_subscriptions bigint,
  total_members bigint,
  active_members bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    (SELECT COALESCE(SUM(amount), 0) FROM contributions c
     WHERE (p_from IS NULL OR c.created_at >= p_from) AND (p_to IS NULL OR c.created_at <= p_to)),
    (SELECT COALESCE(SUM(amount), 0) FROM contributions c
     WHERE c.status = 'Verified' AND (p_from IS NULL OR c.created_at >= p_from) AND (p_to IS NULL OR c.created_at <= p_to)),
    (SELECT COALESCE(SUM(amount), 0) FROM contributions c
     WHERE c.status = 'Pending' AND (p_from IS NULL OR c.created_at >= p_from) AND (p_to IS NULL OR c.created_at <= p_to)),
    (SELECT COALESCE(SUM(amount_requested), 0) FROM claims cl
     WHERE (p_from IS NULL OR cl.created_at >= p_from) AND (p_to IS NULL OR cl.created_at <= p_to)),
    (SELECT COALESCE(SUM(amount_requested), 0) FROM claims cl
     WHERE cl.status = 'Approved' AND (p_from IS NULL OR cl.created_at >= p_from) AND (p_to IS NULL OR cl.created_at <= p_to)),
    (SELECT COALESCE(SUM(amount_requested), 0) FROM claims cl
     WHERE cl.status = 'Paid' AND (p_from IS NULL OR cl.created_at >= p_from) AND (p_to IS NULL OR cl.created_at <= p_to)),
    (SELECT COALESCE(SUM(amount), 0) FROM registration_fees rf WHERE rf.fee_type = 'registration'),
    (SELECT COALESCE(SUM(amount), 0) FROM registration_fees rf WHERE rf.fee_type = 'registration' AND rf.status = 'paid'),
    (SELECT COUNT(*) FROM subscriptions WHERE status = 'active'),
    (SELECT COUNT(*) FROM members),
    (SELECT COUNT(*) FROM members WHERE status = 'active');
$$;

-- ============================================================================
-- 18. PHASE 4: SEARCH OPTIMIZATION (pg_trgm)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Members: admin search by name, phone, email
CREATE INDEX IF NOT EXISTS idx_members_name_trgm ON members USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_members_phone_trgm ON members USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_members_email_trgm ON members USING gin (email gin_trgm_ops) WHERE email IS NOT NULL;

-- News: admin search by title
CREATE INDEX IF NOT EXISTS idx_news_events_title_trgm ON news_events USING gin (title gin_trgm_ops);

-- Gallery: admin search by title
CREATE INDEX IF NOT EXISTS idx_gallery_items_title_trgm ON gallery_items USING gin (title gin_trgm_ops) WHERE title IS NOT NULL;

-- ============================================================================
-- 19. PHASE 4: ADDITIONAL COMPOSITE INDEXES
-- ============================================================================

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

-- Report history: schedule_name trgm search
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'report_history') THEN
    CREATE INDEX IF NOT EXISTS idx_report_history_schedule_name_trgm
      ON report_history USING gin (schedule_name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_report_history_status_generated
      ON report_history(status, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_report_history_type_generated
      ON report_history(report_type, generated_at DESC);
  END IF;
END $$;

-- Scheduled reports: enabled + next_run_at (for process-all query)
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_enabled_next_run
  ON scheduled_reports(enabled, next_run_at) WHERE enabled = true;
