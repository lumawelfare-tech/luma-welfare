-- Phase 2 security verification: storage + RLS hardening (no payment behavior changes).
-- 1) Ensure private exports bucket exists with size/MIME limits
-- 2) FORCE ROW LEVEL SECURITY on sensitive tables (defense in depth for table owners)
-- 3) Document intentional public-read policies remain allowlisted below

-- ============================================================================
-- EXPORTS BUCKET (private admin downloads via signed URLs)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exports',
  'exports',
  false,
  52428800, -- 50MB
  ARRAY[
    'text/csv',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/json'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- FORCE RLS on member-owned / sensitive tables
-- ============================================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'members',
    'family_members',
    'subscriptions',
    'contributions',
    'payments',
    'claims',
    'claim_documents',
    'qualifications',
    'notifications',
    'registration_fees',
    'push_subscriptions',
    'audit_logs',
    'admins',
    'roles',
    'permissions',
    'export_jobs',
    'financial_ledger',
    'payment_timeline',
    'reconciliation_exceptions',
    'webhook_events',
    'rate_limit_buckets',
    'system_webhooks',
    'health_check_history'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- Intentional public SELECT USING (true) policies (content, not PII):
--   package_rules_public_read, news_events_public_read, gallery_items_public_read,
--   media_items_public_read, platform_settings_public_read (keys restricted to org_contact/stats)
-- Service-role-only tables with USING (true) for service_role role:
--   system_webhooks, health_check_history — paired with Block authenticated/anon policies
