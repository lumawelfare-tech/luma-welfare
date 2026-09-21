-- ============================================================================
-- PHASE 14: DISASTER RECOVERY VERIFICATION QUERIES
-- Run after every database restore to verify integrity.
-- ============================================================================

-- ============================================================================
-- 1. TABLE EXISTENCE & SIZE
-- ============================================================================

SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) as total_size,
  (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) as estimated_rows
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'members', 'subscriptions', 'contributions', 'payments',
    'claims', 'payouts', 'qualifications', 'family_members',
    'notifications', 'audit_logs', 'registration_fees',
    'packages', 'package_tiers', 'package_rules',
    'roles', 'permissions', 'admins',
    'export_jobs', 'report_history', 'scheduled_reports',
    'financial_ledger', 'payment_timeline', 'reconciliation_exceptions',
    'webhook_events', 'platform_settings', 'news_events', 'gallery_items'
  )
ORDER BY pg_total_relation_size('public.' || tablename) DESC;

-- ============================================================================
-- 2. RLS VERIFICATION
-- ============================================================================

-- Check RLS is enabled on critical tables
SELECT
  tablename,
  rowsecurity as rls_enabled,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = t.tablename) as policy_count
FROM pg_tables t
WHERE schemaname = 'public'
  AND tablename IN ('members', 'subscriptions', 'contributions', 'payments', 'claims')
ORDER BY tablename;

-- List all policies
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual IS NOT NULL as has_using,
  with_check IS NOT NULL as has_with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================================
-- 3. INDEX VERIFICATION
-- ============================================================================

SELECT
  indexname,
  tablename,
  pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('members', 'payments', 'contributions', 'claims', 'subscriptions')
ORDER BY tablename, indexname;

-- ============================================================================
-- 4. FOREIGN KEY INTEGRITY
-- ============================================================================

SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ============================================================================
-- 5. FUNCTION VERIFICATION
-- ============================================================================

SELECT
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_admin_dashboard_summary',
    'get_admin_contributions_by_month',
    'get_admin_package_breakdown',
    'get_admin_claims_by_status',
    'get_admin_report_analytics',
    'get_member_growth',
    'get_payment_health',
    'get_outstanding_obligations',
    'get_qualification_analytics',
    'get_contribution_retention',
    'get_membership_funnel',
    'get_reconciliation_summary',
    'get_payment_timeline',
    'process_payment_callback_v2',
    'process_registration_fee_callback',
    'record_payment_initiation',
    'flag_stale_pending_payments',
    'check_orphan_payments_v2',
    'check_stale_pending_v2',
    'get_security_status',
    'get_rls_policy_count',
    'admin_search_members',
    'admin_search_contributions',
    'admin_search_claims'
  )
ORDER BY routine_name;

-- ============================================================================
-- 6. TRIGGER VERIFICATION
-- ============================================================================

SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_orientation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ============================================================================
-- 7. FINANCIAL INTEGRITY — POST-RESTORE
-- ============================================================================

-- Payment summary
SELECT
  'payments' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'Completed') as completed,
  COUNT(*) FILTER (WHERE status = 'Pending') as pending,
  COUNT(*) FILTER (WHERE status = 'Failed') as failed,
  COALESCE(SUM(amount), 0) as total_amount,
  COALESCE(SUM(amount) FILTER (WHERE status = 'Completed'), 0) as completed_amount
FROM payments

UNION ALL

-- Contribution summary
SELECT
  'contributions',
  COUNT(*),
  COUNT(*) FILTER (WHERE status IN ('Paid', 'Verified')),
  COUNT(*) FILTER (WHERE status = 'Pending'),
  COUNT(*) FILTER (WHERE status = 'Failed'),
  COALESCE(SUM(amount), 0),
  COALESCE(SUM(amount) FILTER (WHERE status IN ('Paid', 'Verified')), 0)
FROM contributions

UNION ALL

-- Claim summary
SELECT
  'claims',
  COUNT(*),
  COUNT(*) FILTER (WHERE status = 'Approved'),
  COUNT(*) FILTER (WHERE status IN ('Submitted', 'Under Review')),
  COUNT(*) FILTER (WHERE status = 'Rejected'),
  COALESCE(SUM(amount_requested), 0),
  COALESCE(SUM(amount_requested) FILTER (WHERE status = 'Approved'), 0)
FROM claims

UNION ALL

-- Payout summary
SELECT
  'payouts',
  COUNT(*),
  COUNT(*) FILTER (WHERE status = 'Completed'),
  COUNT(*) FILTER (WHERE status = 'Pending'),
  COUNT(*) FILTER (WHERE status = 'Failed'),
  COALESCE(SUM(amount), 0),
  COALESCE(SUM(amount) FILTER (WHERE status = 'Completed'), 0)
FROM payouts;

-- ============================================================================
-- 8. DUPLICATE DETECTION
-- ============================================================================

-- Duplicate contributions (same subscription + period)
SELECT
  subscription_id,
  period,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id) as contribution_ids
FROM contributions
GROUP BY subscription_id, period
HAVING COUNT(*) > 1;

-- Duplicate payments (same checkout_request_id)
SELECT
  checkout_request_id,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id) as payment_ids
FROM payments
WHERE checkout_request_id IS NOT NULL
GROUP BY checkout_request_id
HAVING COUNT(*) > 1;

-- Duplicate M-Pesa receipts
SELECT
  mpesa_receipt,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id) as payment_ids
FROM payments
WHERE mpesa_receipt IS NOT NULL
GROUP BY mpesa_receipt
HAVING COUNT(*) > 1;

-- ============================================================================
-- 9. ORPHAN DETECTION
-- ============================================================================

-- Completed payments without contributions
SELECT
  p.id as payment_id,
  p.amount,
  p.member_id,
  p.created_at,
  m.full_name as member_name
FROM payments p
LEFT JOIN members m ON m.id = p.member_id
WHERE p.status = 'Completed'
  AND NOT EXISTS (
    SELECT 1 FROM contributions c WHERE c.payment_id = p.id
  )
ORDER BY p.created_at DESC
LIMIT 20;

-- Verified contributions without payments
SELECT
  c.id as contribution_id,
  c.amount,
  c.period,
  c.member_id,
  m.full_name as member_name
FROM contributions c
LEFT JOIN members m ON m.id = c.member_id
WHERE c.payment_id IS NULL
  AND c.status IN ('Paid', 'Verified')
ORDER BY c.created_at DESC
LIMIT 20;

-- Active subscriptions without members
SELECT
  s.id as subscription_id,
  s.member_id,
  s.status,
  s.created_at
FROM subscriptions s
WHERE NOT EXISTS (
  SELECT 1 FROM members m WHERE m.id = s.member_id
);

-- Claims without active subscriptions
SELECT
  cl.id as claim_id,
  cl.claim_number,
  cl.member_id,
  cl.subscription_id,
  cl.status
FROM claims cl
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s
  WHERE s.id = cl.subscription_id AND s.status = 'active'
);

-- ============================================================================
-- 10. AUDIT LOG INTEGRITY
-- ============================================================================

-- Recent audit entries (verify logging is working)
SELECT
  action,
  resource,
  COUNT(*) as count,
  MIN(created_at) as earliest,
  MAX(created_at) as latest
FROM audit_logs
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY action, resource
ORDER BY count DESC
LIMIT 20;

-- ============================================================================
-- 11. NOTIFICATION HEALTH
-- ============================================================================

SELECT
  status,
  channel,
  COUNT(*) as count
FROM notifications
WHERE created_at > now() - INTERVAL '30 days'
GROUP BY status, channel
ORDER BY status, channel;

-- ============================================================================
-- 12. EXPORT JOB HEALTH
-- ============================================================================

SELECT
  status,
  COUNT(*) as count,
  MIN(created_at) as earliest,
  MAX(created_at) as latest
FROM export_jobs
WHERE created_at > now() - INTERVAL '30 days'
GROUP BY status
ORDER BY count DESC;
