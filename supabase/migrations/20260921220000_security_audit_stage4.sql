-- Stage 4 security audit patches (H-04, M-02, M-03).
-- Safe / reversible. No payment behavior changes.

-- ============================================================================
-- H-04: Partial unique index on members.phone (non-empty only)
-- BEFORE APPLYING: ensure no duplicate non-null phones:
--   SELECT phone, COUNT(*) FROM members
--   WHERE phone IS NOT NULL AND btrim(phone) <> ''
--   GROUP BY phone HAVING COUNT(*) > 1;
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS members_phone_unique
  ON public.members (phone)
  WHERE phone IS NOT NULL AND btrim(phone) <> '';

COMMENT ON INDEX members_phone_unique IS
  'Ensures phone uniqueness when present; nulls allowed for incomplete profiles.';

-- ============================================================================
-- M-02: Restrict exports bucket — drop authenticated own-folder policies.
-- Edge Functions use service_role for upload + signed download URLs.
-- ============================================================================
DROP POLICY IF EXISTS "exports_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "exports_select_own" ON storage.objects;
DROP POLICY IF EXISTS "exports_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "exports_admin_select_own" ON storage.objects;

-- Active admins may SELECT their own export folder (defense in depth; downloads
-- still prefer short-lived signed URLs from admin-exports).
CREATE POLICY "exports_admin_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'exports'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.admins a
      WHERE a.id = auth.uid() AND a.is_active = true
    )
  );

-- ============================================================================
-- M-03: Drop residual member self-read on financial_ledger (if table exists)
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.financial_ledger') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "ledger_read_own" ON public.financial_ledger';
  END IF;
END $$;
