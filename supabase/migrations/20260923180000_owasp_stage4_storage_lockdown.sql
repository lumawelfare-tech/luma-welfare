-- Stage 4: storage lockdown (idempotent).
-- Media / exports / kb / report-files writes stay service-role only.
-- Claim documents stay path-bound to the member's own claim id.
-- No payment behavior changes.

-- Media: drop any leftover authenticated write policies (20260904 added them;
-- 20260919 dropped them). Re-assert the drop so they cannot come back silently.
DROP POLICY IF EXISTS media_storage_admin_insert ON storage.objects;
DROP POLICY IF EXISTS media_storage_admin_update ON storage.objects;
DROP POLICY IF EXISTS media_storage_admin_delete ON storage.objects;

-- Exports: no authenticated INSERT/UPDATE/DELETE. SELECT remains admin-own-folder.
DROP POLICY IF EXISTS "exports_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "exports_select_own" ON storage.objects;
DROP POLICY IF EXISTS "exports_delete_own" ON storage.objects;
DROP POLICY IF EXISTS exports_insert_own ON storage.objects;
DROP POLICY IF EXISTS exports_delete_own ON storage.objects;

-- Claim documents: members may not UPDATE/DELETE objects even on their own path.
DROP POLICY IF EXISTS "claim_docs_update_own" ON storage.objects;
DROP POLICY IF EXISTS "claim_docs_delete_own" ON storage.objects;

-- Private buckets must not have public-read policies.
DROP POLICY IF EXISTS "kb_documents_public_read" ON storage.objects;
DROP POLICY IF EXISTS "report_files_public_read" ON storage.objects;
DROP POLICY IF EXISTS "exports_public_read" ON storage.objects;
