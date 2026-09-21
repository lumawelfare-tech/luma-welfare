-- RLS inventory helper (read-only).
-- Run in Supabase SQL editor against the target project after migrations.
-- Lists public base tables without RLS enabled and policies that use USING (true).

SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY 1;

-- Policies that are fully open (review whether intentional public reads)
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual ILIKE '%true%'
    OR with_check ILIKE '%true%'
  )
ORDER BY tablename, policyname;
