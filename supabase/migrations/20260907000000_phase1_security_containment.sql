-- ============================================================================
-- PHASE 1: SECURITY CONTAINMENT
--
-- 1. Constrain member INSERT/UPDATE policies on financial tables so
--    PostgREST clients cannot forge Paid/Completed/Approved statuses.
-- 2. Restrict public platform_settings reads to non-secret keys.
-- 3. Enable RLS on payouts and open_questions (service-role only; no
--    member/anon policies).
-- ============================================================================

-- ============================================================================
-- 1. FINANCIAL + CLAIM RLS WRITE HARDENING
-- ============================================================================

-- Payments: members may only insert Pending rows for themselves.
DROP POLICY IF EXISTS "payments_insert_own" ON payments;
CREATE POLICY "payments_insert_own" ON payments
  FOR INSERT
  WITH CHECK (
    member_id = auth.uid()
    AND status = 'Pending'
  );

-- Contributions: members may only insert Pending rows for themselves.
DROP POLICY IF EXISTS "contributions_insert_own" ON contributions;
CREATE POLICY "contributions_insert_own" ON contributions
  FOR INSERT
  WITH CHECK (
    member_id = auth.uid()
    AND status = 'Pending'
  );

-- Claims: members may only insert Draft or Submitted claims for themselves.
DROP POLICY IF EXISTS "claims_insert_own" ON claims;
CREATE POLICY "claims_insert_own" ON claims
  FOR INSERT
  WITH CHECK (
    member_id = auth.uid()
    AND status IN ('Draft', 'Submitted')
  );

-- Claims: draft updates may only transition to Draft or Submitted (no
-- escalation to Approved/Rejected/Paid via PostgREST).
DROP POLICY IF EXISTS "claims_update_own_draft" ON claims;
CREATE POLICY "claims_update_own_draft" ON claims
  FOR UPDATE
  USING (member_id = auth.uid() AND status = 'Draft')
  WITH CHECK (
    member_id = auth.uid()
    AND status IN ('Draft', 'Submitted')
  );

-- ============================================================================
-- 2. PLATFORM SETTINGS — PUBLIC KEY ALLOWLIST
-- ============================================================================
-- Edge Function public-data also allowlists these keys. RLS is defense-in-depth
-- for direct PostgREST access with the anon/publishable key.

DROP POLICY IF EXISTS "platform_settings_public_read" ON platform_settings;
CREATE POLICY "platform_settings_public_read" ON platform_settings
  FOR SELECT
  USING (key IN ('org_contact', 'stats'));

-- ============================================================================
-- 3. ENABLE RLS ON SENSITIVE TABLES WITHOUT MEMBER POLICIES
-- ============================================================================
-- No policies ⇒ authenticated/anon denied; service-role bypasses RLS.

ALTER TABLE IF EXISTS payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS open_questions ENABLE ROW LEVEL SECURITY;
