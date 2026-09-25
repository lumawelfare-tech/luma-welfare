-- Pre-deploy hardening (idempotent). No payment / Daraja / family-merge changes.
-- 1) FORCE RLS on remaining ENABLE-only tables
-- 2) Restrict package_rules to active packages
-- 3) Revoke members.kra_pin UPDATE from client roles; block self-update
-- 4) saved_reports admin-own policies
-- 5) Private document buckets: 5MB new-upload cap; claim objects service-role only
-- 6) Ensure public gallery bucket exists (admin-gallery already uploads here)

-- ============================================================================
-- FORCE RLS
-- ============================================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'packages',
    'package_tiers',
    'package_rules',
    'news_events',
    'gallery_items',
    'platform_settings',
    'media_items',
    'notification_preferences',
    'email_verifications',
    'announcements',
    'export_admin_quotas',
    'scheduled_reports',
    'report_history',
    'saved_reports',
    'payouts',
    'open_questions'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- package_rules — public catalog for active packages only
-- ============================================================================
DROP POLICY IF EXISTS "package_rules_public_read" ON public.package_rules;
CREATE POLICY "package_rules_public_read" ON public.package_rules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.packages p
      WHERE p.id = package_rules.package_id
        AND p.is_active = true
    )
  );

-- ============================================================================
-- saved_reports — admin-own rows (Edge still uses service_role)
-- ============================================================================
DROP POLICY IF EXISTS "saved_reports_admin_read" ON public.saved_reports;
CREATE POLICY "saved_reports_admin_read" ON public.saved_reports
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.admins a
      WHERE a.id = auth.uid() AND a.is_active = true
    )
  );

DROP POLICY IF EXISTS "saved_reports_admin_insert" ON public.saved_reports;
CREATE POLICY "saved_reports_admin_insert" ON public.saved_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.admins a
      WHERE a.id = auth.uid() AND a.is_active = true
    )
  );

DROP POLICY IF EXISTS "saved_reports_admin_delete" ON public.saved_reports;
CREATE POLICY "saved_reports_admin_delete" ON public.saved_reports
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.admins a
      WHERE a.id = auth.uid() AND a.is_active = true
    )
  );

-- ============================================================================
-- kra_pin — no client UPDATE; trigger covers RLS-passing row updates
-- ============================================================================
REVOKE UPDATE (kra_pin) ON public.members FROM PUBLIC;
REVOKE UPDATE (kra_pin) ON public.members FROM anon;
REVOKE UPDATE (kra_pin) ON public.members FROM authenticated;

CREATE OR REPLACE FUNCTION public.prevent_member_privileged_column_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.membership_number IS DISTINCT FROM OLD.membership_number
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
     OR NEW.kra_pin IS DISTINCT FROM OLD.kra_pin
  THEN
    RAISE EXCEPTION 'Cannot modify privileged membership fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Storage: 5MB document buckets + no authenticated claim object access
-- Historical CHECKs stay at 10MB so existing rows remain readable.
-- ============================================================================
UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['application/pdf']::text[]
WHERE id = 'member-documents';

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 5242880
WHERE id = 'claim-documents';

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 5242880
WHERE id = 'kb-documents';

DROP POLICY IF EXISTS "claim_docs_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "claim_docs_read_own" ON storage.objects;
DROP POLICY IF EXISTS claim_docs_insert_own ON storage.objects;
DROP POLICY IF EXISTS claim_docs_read_own ON storage.objects;

DROP POLICY IF EXISTS "exports_admin_select_own" ON storage.objects;
DROP POLICY IF EXISTS exports_admin_select_own ON storage.objects;

-- gallery bucket used by admin-gallery (public images, service-role writes)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gallery',
  'gallery',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS gallery_storage_public_read ON storage.objects;
CREATE POLICY gallery_storage_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'gallery');

DROP POLICY IF EXISTS gallery_storage_admin_insert ON storage.objects;
DROP POLICY IF EXISTS gallery_storage_admin_update ON storage.objects;
DROP POLICY IF EXISTS gallery_storage_admin_delete ON storage.objects;
