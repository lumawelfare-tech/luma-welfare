-- PHASE 1: SECURITY CONTAINMENT
-- 1. Constrain member INSERT/UPDATE policies on financial tables
-- 2. Restrict public platform_settings reads to non-secret keys
-- 3. Enable RLS on payouts and open_questions

DROP POLICY IF EXISTS "payments_insert_own" ON payments;
CREATE POLICY "payments_insert_own" ON payments
  FOR INSERT
  WITH CHECK (
    member_id = auth.uid()
    AND status = 'Pending'
  );

DROP POLICY IF EXISTS "contributions_insert_own" ON contributions;
CREATE POLICY "contributions_insert_own" ON contributions
  FOR INSERT
  WITH CHECK (
    member_id = auth.uid()
    AND status = 'Pending'
  );

DROP POLICY IF EXISTS "claims_insert_own" ON claims;
CREATE POLICY "claims_insert_own" ON claims
  FOR INSERT
  WITH CHECK (
    member_id = auth.uid()
    AND status IN ('Draft', 'Submitted')
  );

DROP POLICY IF EXISTS "claims_update_own_draft" ON claims;
CREATE POLICY "claims_update_own_draft" ON claims
  FOR UPDATE
  USING (member_id = auth.uid() AND status = 'Draft')
  WITH CHECK (
    member_id = auth.uid()
    AND status IN ('Draft', 'Submitted')
  );

DROP POLICY IF EXISTS "platform_settings_public_read" ON platform_settings;
CREATE POLICY "platform_settings_public_read" ON platform_settings
  FOR SELECT
  USING (key IN ('org_contact', 'stats'));

ALTER TABLE IF EXISTS payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS open_questions ENABLE ROW LEVEL SECURITY;;
