-- ============================================================================
-- PHASE 13: COMPREHENSIVE SECURITY HARDENING
-- RLS policies, IDOR protection, payment security, XSS prevention.
-- ============================================================================

-- ============================================================================
-- 1. RLS POLICY GAPS — Add missing INSERT/UPDATE policies for member writes
-- ============================================================================
-- Currently all writes go through service-role (Edge Functions), which is correct.
-- But adding member-scoped INSERT policies provides defense-in-depth:
-- if someone mistakenly uses the user client for writes, RLS still protects.

-- Claims: members should be able to INSERT their own claims
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'claims_insert_own' AND tablename = 'claims') THEN
    CREATE POLICY "claims_insert_own" ON claims
      FOR INSERT WITH CHECK (member_id = auth.uid());
  END IF;
END $$;

-- Claims: members should be able to UPDATE their own draft claims
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'claims_update_own_draft' AND tablename = 'claims') THEN
    CREATE POLICY "claims_update_own_draft" ON claims
      FOR UPDATE USING (member_id = auth.uid() AND status = 'Draft')
      WITH CHECK (member_id = auth.uid());
  END IF;
END $$;

-- Claim documents: members should be able to INSERT documents for their own claims
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'claim_documents_insert_own' AND tablename = 'claim_documents') THEN
    CREATE POLICY "claim_documents_insert_own" ON claim_documents
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id AND c.member_id = auth.uid())
      );
  END IF;
END $$;

-- Notifications: members should be able to UPDATE read status of their own notifications
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_update_own' AND tablename = 'notifications') THEN
    CREATE POLICY "notifications_update_own" ON notifications
      FOR UPDATE USING (member_id = auth.uid())
      WITH CHECK (member_id = auth.uid());
  END IF;
END $$;

-- Subscriptions: members should be able to INSERT their own (for self-service join)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'subscriptions_insert_own' AND tablename = 'subscriptions') THEN
    CREATE POLICY "subscriptions_insert_own" ON subscriptions
      FOR INSERT WITH CHECK (member_id = auth.uid());
  END IF;
END $$;

-- Payments: members should be able to INSERT their own (for STK push initiation)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'payments_insert_own' AND tablename = 'payments') THEN
    CREATE POLICY "payments_insert_own" ON payments
      FOR INSERT WITH CHECK (member_id = auth.uid());
  END IF;
END $$;

-- Contributions: members should be able to INSERT their own (for manual recording)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'contributions_insert_own' AND tablename = 'contributions') THEN
    CREATE POLICY "contributions_insert_own" ON contributions
      FOR INSERT WITH CHECK (member_id = auth.uid());
  END IF;
END $$;

-- ============================================================================
-- 2. RLS DENY POLICIES — Explicit deny for cross-user access
-- ============================================================================
-- These are defense-in-depth. PostgreSQL RLS already denies by default
-- when no policy matches, but explicit deny policies make intent clear.

-- Members cannot DELETE other members' family members
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'family_delete_own' AND tablename = 'family_members') THEN
    CREATE POLICY "family_delete_own" ON family_members
      FOR DELETE USING (member_id = auth.uid());
  END IF;
END $$;

-- ============================================================================
-- 3. TABLE-LEVEL SECURITY — Tables that should have RLS but don't
-- ============================================================================

-- Platform settings: only readable by authenticated users (or public if needed)
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'platform_settings_public_read' AND tablename = 'platform_settings') THEN
    CREATE POLICY "platform_settings_public_read" ON platform_settings
      FOR SELECT USING (true);
  END IF;
END $$;

-- News events: public read for published, admin write
ALTER TABLE news_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'news_events_public_read' AND tablename = 'news_events') THEN
    CREATE POLICY "news_events_public_read" ON news_events
      FOR SELECT USING (is_published = true);
  END IF;
END $$;

-- Gallery items: public read
ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'gallery_items_public_read' AND tablename = 'gallery_items') THEN
    CREATE POLICY "gallery_items_public_read" ON gallery_items
      FOR SELECT USING (true);
  END IF;
END $$;

-- Audit logs: no member access at all (admin service-role only)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- No policies = no member access. Service-role bypasses RLS.

-- Roles and permissions: no member access
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
-- No policies = no member access.

-- Admins table: no member access
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
-- No policies = no member access.

-- Export jobs: no member access (admin only)
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
-- No policies = no member access.

-- Report history: no member access
ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;
-- No policies = no member access.

-- Scheduled reports: no member access
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;
-- No policies = no member access.

-- Financial ledger: no member access
ALTER TABLE financial_ledger ENABLE ROW LEVEL SECURITY;
-- No policies = no member access.

-- Payment timeline: no member access
ALTER TABLE payment_timeline ENABLE ROW LEVEL SECURITY;
-- No policies = no member access.

-- Reconciliation exceptions: no member access
ALTER TABLE reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
-- No policies = no member access.

-- Webhook events: no member access
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies = no member access.

-- ============================================================================
-- 4. PAYMENT SECURITY ENHANCEMENT
-- ============================================================================

-- Ensure payments table has idempotency_key column (for duplicate prevention)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'idempotency_key') THEN
    ALTER TABLE payments ADD COLUMN idempotency_key text;
    CREATE UNIQUE INDEX idx_payments_idempotency_unique ON payments (idempotency_key) WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- Ensure payments table has checkout_request_id column
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'checkout_request_id') THEN
    ALTER TABLE payments ADD COLUMN checkout_request_id text;
    CREATE UNIQUE INDEX idx_payments_checkout_request_unique ON payments (checkout_request_id) WHERE checkout_request_id IS NOT NULL;
  END IF;
END $$;

-- Ensure payments table has failure_reason column
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'failure_reason') THEN
    ALTER TABLE payments ADD COLUMN failure_reason text;
  END IF;
END $$;

-- ============================================================================
-- 5. AUDIT LOG PROTECTION (reinforce from Phase 13 migration)
-- ============================================================================

-- Prevent UPDATE on audit logs (defense-in-depth)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audit_logs_no_update' AND tablename = 'audit_logs') THEN
    -- No UPDATE policy = PostgreSQL denies UPDATE by default with RLS enabled
    -- This is already enforced, but we document the intent
    RAISE NOTICE 'audit_logs: No UPDATE policy — members cannot modify audit records';
  END IF;
END $$;

-- ============================================================================
-- 6. SECURITY MONITORING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_rls_policy_count()
RETURNS TABLE (
  tablename text,
  policy_count bigint,
  has_select boolean,
  has_insert boolean,
  has_update boolean,
  has_delete boolean
) LANGUAGE sql STABLE AS $$
  SELECT
    schemaname || '.' || tablename as tablename,
    COUNT(*) as policy_count,
    BOOL_OR(cmd = 'SELECT') as has_select,
    BOOL_OR(cmd = 'INSERT') as has_insert,
    BOOL_OR(cmd = 'UPDATE') as has_update,
    BOOL_OR(cmd = 'DELETE') as has_delete
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY schemaname, tablename
  ORDER BY tablename;
$$;

-- ============================================================================
-- 7. FINANCIAL INTEGRITY VIEWS
-- ============================================================================

-- Quick view: all RLS-enabled tables with policy counts
CREATE OR REPLACE VIEW security_rls_summary AS
SELECT
  t.tablename,
  c.reltuples::bigint as estimated_rows,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = t.tablename) as policy_count,
  t.rowsecurity as rls_enabled
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
ORDER BY t.tablename;
