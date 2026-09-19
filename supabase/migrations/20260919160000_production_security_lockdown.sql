-- ============================================================================
-- PRODUCTION SECURITY LOCKDOWN (2026-09-19)
--
-- 1. SECURITY DEFINER RPC ownership checks + EXECUTE lockdown
-- 2. export_jobs / registration_fees / subscriptions INSERT hardening
-- 3. package_rules RLS enable
-- 4. media storage admin-only writes
-- 5. prevent privileged member column self-updates
-- ============================================================================

-- ============================================================================
-- 1a. member_search_contributions — require caller owns p_member_id
-- ============================================================================
CREATE OR REPLACE FUNCTION member_search_contributions(
  p_member_id UUID,
  p_subscription_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_per_page INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INT;
  v_total BIGINT;
  v_pages INT;
  v_contributions JSONB;
BEGIN
  -- Edge Functions may call this with the service role (auth.uid() is null).
  -- Direct PostgREST callers must own p_member_id.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR p_member_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_page < 1 THEN p_page := 1; END IF;
  IF p_per_page < 1 THEN p_per_page := 20; END IF;
  IF p_per_page > 100 THEN p_per_page := 100; END IF;
  v_offset := (p_page - 1) * p_per_page;

  SELECT count(*) INTO v_total
  FROM contributions c
  WHERE c.member_id = p_member_id
    AND (p_subscription_id IS NULL OR c.subscription_id = p_subscription_id)
    AND (p_status IS NULL OR c.status = p_status);

  v_pages := GREATEST(1, CEIL(v_total::NUMERIC / p_per_page));

  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb)
  INTO v_contributions
  FROM (
    SELECT
      c.id,
      c.subscription_id,
      c.period,
      c.amount,
      c.status,
      c.notes,
      c.created_at,
      jsonb_build_object('code', p.code, 'name', p.name) AS packages
    FROM contributions c
    LEFT JOIN packages p ON p.id = c.package_id
    WHERE c.member_id = p_member_id
      AND (p_subscription_id IS NULL OR c.subscription_id = p_subscription_id)
      AND (p_status IS NULL OR c.status = p_status)
    ORDER BY c.period DESC, c.created_at DESC
    LIMIT p_per_page OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object(
    'contributions', v_contributions,
    'total', v_total,
    'page', p_page,
    'per_page', p_per_page,
    'pages', v_pages
  );
END;
$$;

REVOKE ALL ON FUNCTION member_search_contributions(UUID, UUID, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION member_search_contributions(UUID, UUID, TEXT, INT, INT) TO authenticated, service_role;

-- ============================================================================
-- 1b. Push subscription getters
-- ============================================================================
CREATE OR REPLACE FUNCTION get_member_push_subscriptions(p_member_id UUID)
RETURNS TABLE (
  endpoint TEXT,
  p256dh TEXT,
  auth TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR p_member_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ps.endpoint, ps.p256dh, ps.auth
  FROM push_subscriptions ps
  WHERE ps.member_id = p_member_id
    AND ps.is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION get_all_active_push_subscriptions()
RETURNS TABLE (
  member_id UUID,
  endpoint TEXT,
  p256dh TEXT,
  auth TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role only (auth.uid() is null under service role JWT / bypass).
  -- Authenticated end-users must not enumerate push keys.
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user IS DISTINCT FROM 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM admins a
      WHERE a.id = auth.uid() AND a.is_active = true
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT ps.member_id, ps.endpoint, ps.p256dh, ps.auth
  FROM push_subscriptions ps
  WHERE ps.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION get_member_push_subscriptions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_member_push_subscriptions(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION get_all_active_push_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_all_active_push_subscriptions() TO service_role;

-- ============================================================================
-- 1c. Retention / cleanup / export worker RPCs — service_role only
-- ============================================================================
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'cleanup_old_notifications(integer)',
    'cleanup_old_audit_logs(integer)',
    'cleanup_old_export_jobs(integer)',
    'cleanup_old_email_verifications()'
  ]
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL; -- function may not exist in all environments
    END;
  END LOOP;
END $$;

-- Export worker helpers — revoke by name so missing/altered signatures cannot fail the migration
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'can_start_export',
        'claim_export_job',
        'complete_export_job',
        'increment_export_hourly_count'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ============================================================================
-- 2. export_jobs — drop weak policies; admin-only INSERT/SELECT
--    (table may be absent on some environments — skip safely)
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.export_jobs') IS NULL THEN
    RAISE NOTICE 'export_jobs missing — skipping export_jobs RLS hardening';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "export_jobs_select_own" ON export_jobs';
  EXECUTE 'DROP POLICY IF EXISTS "export_jobs_insert_admin" ON export_jobs';
  EXECUTE 'DROP POLICY IF EXISTS "export_jobs_admin_read" ON export_jobs';
  EXECUTE 'DROP POLICY IF EXISTS "export_jobs_admin_update" ON export_jobs';
  EXECUTE 'DROP POLICY IF EXISTS "export_jobs_admin_insert" ON export_jobs';

  EXECUTE $pol$
    CREATE POLICY "export_jobs_admin_read" ON export_jobs
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM admins a WHERE a.id = auth.uid() AND a.is_active = true)
      )
  $pol$;

  EXECUTE $pol$
    CREATE POLICY "export_jobs_admin_insert" ON export_jobs
      FOR INSERT WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (SELECT 1 FROM admins a WHERE a.id = auth.uid() AND a.is_active = true)
      )
  $pol$;

  EXECUTE $pol$
    CREATE POLICY "export_jobs_admin_update" ON export_jobs
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM admins a WHERE a.id = auth.uid() AND a.is_active = true)
      )
  $pol$;
END $$;

-- ============================================================================
-- 3. registration_fees — cannot self-insert as paid
-- ============================================================================
DROP POLICY IF EXISTS "registration_fees_insert_own" ON registration_fees;
CREATE POLICY "registration_fees_insert_own" ON registration_fees
  FOR INSERT WITH CHECK (
    member_id = auth.uid()
    AND status IN ('unpaid', 'pending')
    AND amount = 300
  );

-- ============================================================================
-- 4. subscriptions — members may only insert pending rows
-- ============================================================================
DROP POLICY IF EXISTS "subscriptions_insert_own" ON subscriptions;
CREATE POLICY "subscriptions_insert_own" ON subscriptions
  FOR INSERT WITH CHECK (
    member_id = auth.uid()
    AND status = 'pending'
  );

-- ============================================================================
-- 5. package_rules — enable RLS (policy already exists in schema)
-- ============================================================================
ALTER TABLE IF EXISTS package_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "package_rules_public_read" ON package_rules;
CREATE POLICY "package_rules_public_read" ON package_rules
  FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE ON package_rules FROM anon, authenticated;

-- ============================================================================
-- 6. Media storage — service-role only writes (admin EFs use service role)
-- ============================================================================
DROP POLICY IF EXISTS media_storage_admin_insert ON storage.objects;
DROP POLICY IF EXISTS media_storage_admin_update ON storage.objects;
DROP POLICY IF EXISTS media_storage_admin_delete ON storage.objects;

-- No authenticated write policies. Service-role bypasses RLS for admin uploads.
-- Public read policy (media_storage_public_read) is retained.

-- ============================================================================
-- 7. Privileged member columns — block self-update
-- ============================================================================
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
  THEN
    RAISE EXCEPTION 'Cannot modify privileged membership fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_member_privileged_column_self_update ON members;
CREATE TRIGGER trg_prevent_member_privileged_column_self_update
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_member_privileged_column_self_update();

REVOKE ALL ON FUNCTION public.prevent_member_privileged_column_self_update() FROM PUBLIC, anon, authenticated;

-- Normalize legacy boolean package_rules string values so parsers match
UPDATE package_rules
SET value = to_jsonb(lower(value #>> '{}'))
WHERE key = 'requires_current_contributions'
  AND jsonb_typeof(value) = 'string'
  AND lower(value #>> '{}') IN ('true', 'false');
