-- Live verification of rate_limit_buckets + consume_rate_limit (no secrets).
-- Safe probe key; cleaned up at end.

SELECT to_regclass('public.rate_limit_buckets') AS rate_limit_buckets_table;

SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'INVOKER' END AS security
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'consume_rate_limit';

SELECT
  r.rolname,
  has_function_privilege(r.oid, 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE') AS can_execute
FROM pg_roles r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
ORDER BY r.rolname;

-- Atomic consume probe (max 2)
SELECT public.consume_rate_limit('verify:gate:probe', 60000, 2) AS hit1;
SELECT public.consume_rate_limit('verify:gate:probe', 60000, 2) AS hit2;
SELECT public.consume_rate_limit('verify:gate:probe', 60000, 2) AS hit3_should_deny;

SELECT bucket_key, hit_count, reset_at IS NOT NULL AS has_reset
FROM public.rate_limit_buckets
WHERE bucket_key = 'verify:gate:probe';

DELETE FROM public.rate_limit_buckets WHERE bucket_key = 'verify:gate:probe';
