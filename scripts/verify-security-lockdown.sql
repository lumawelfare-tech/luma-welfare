-- ============================================================================
-- Verify production security lockdown (20260919160000) is applied.
-- Run in Supabase SQL editor. Does not print secrets.
-- ============================================================================

-- 1) Migration applied?
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version LIKE '20260919%' OR name ILIKE '%production_security_lockdown%'
ORDER BY version;

-- 2) package_rules RLS enabled?
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'package_rules';

-- 3) Dangerous RPCs not executable by anon/authenticated (sample)
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_all_active_push_subscriptions',
    'cleanup_old_notifications',
    'claim_export_job',
    'complete_export_job'
  );

-- 4) registration_fees insert policy mentions unpaid/pending
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.registration_fees'::regclass;

-- 5) export_jobs policies require admins (table may be absent)
SELECT to_regclass('public.export_jobs') AS export_jobs_exists;
SELECT polname, pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE to_regclass('public.export_jobs') IS NOT NULL
  AND polrelid = 'public.export_jobs'::regclass;

-- 6) privileged column self-update trigger
SELECT tgname
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid = 'public.members'::regclass
  AND tgname = 'trg_prevent_member_privileged_column_self_update';
