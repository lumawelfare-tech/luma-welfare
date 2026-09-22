-- ============================================================================
-- Phase 6: Knowledge-base documents — ACL + lifecycle
-- Private bucket by default. No RAG/embeddings. Does not enable M-Pesa.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Private kb-documents bucket (service-role uploads; signed URL downloads)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kb-documents',
  'kb-documents',
  false,
  20971520, -- 20MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No authenticated storage.object policies — Edge Functions (service_role) only.
-- Deny default: members/anon cannot list or download without a signed URL.

-- ---------------------------------------------------------------------------
-- kb_documents metadata
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kb_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text,
  summary text,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  access_level text NOT NULL DEFAULT 'member'
    CHECK (access_level IN ('public', 'member', 'staff', 'admin', 'restricted')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'archived')),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.admins(id),
  archived_at timestamptz,
  archived_by uuid REFERENCES public.admins(id),
  created_by uuid REFERENCES public.admins(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_documents_title_len CHECK (char_length(title) BETWEEN 2 AND 200),
  CONSTRAINT kb_documents_summary_len CHECK (summary IS NULL OR char_length(summary) <= 2000),
  CONSTRAINT kb_documents_category_len CHECK (category IS NULL OR char_length(category) <= 100),
  CONSTRAINT kb_documents_file_name_len CHECK (char_length(file_name) BETWEEN 1 AND 255),
  CONSTRAINT kb_documents_storage_path_len CHECK (char_length(storage_path) BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS kb_documents_slug_unique
  ON public.kb_documents (slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS kb_documents_status_access_idx
  ON public.kb_documents (status, access_level, created_at DESC);

CREATE INDEX IF NOT EXISTS kb_documents_category_idx
  ON public.kb_documents (category)
  WHERE category IS NOT NULL;

ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_documents FORCE ROW LEVEL SECURITY;

-- Public metadata only (approved + public). File bytes still via signed URL from EF.
DROP POLICY IF EXISTS "kb_documents_public_metadata_read" ON public.kb_documents;
CREATE POLICY "kb_documents_public_metadata_read" ON public.kb_documents
  FOR SELECT
  USING (status = 'approved' AND access_level = 'public');

-- Authenticated members may see approved public + member metadata (not staff/admin/restricted)
DROP POLICY IF EXISTS "kb_documents_member_metadata_read" ON public.kb_documents;
CREATE POLICY "kb_documents_member_metadata_read" ON public.kb_documents
  FOR SELECT
  TO authenticated
  USING (
    status = 'approved'
    AND access_level IN ('public', 'member')
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = auth.uid()
        AND m.status IN ('active', 'pending_approval')
    )
  );

-- Active admins can read all metadata (mutations still via Edge / service_role)
DROP POLICY IF EXISTS "kb_documents_admin_read" ON public.kb_documents;
CREATE POLICY "kb_documents_admin_read" ON public.kb_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admins a
      WHERE a.id = auth.uid() AND a.is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- RBAC: documents permissions
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, v.resource, v.action
FROM public.roles r
CROSS JOIN (
  VALUES
    ('documents', 'read'),
    ('documents', 'create'),
    ('documents', 'update'),
    ('documents', 'approve'),
    ('documents', 'delete')
) AS v(resource, action)
WHERE r.name IN ('superadmin', 'admin')
  AND NOT EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE p.role_id = r.id
      AND p.resource = v.resource
      AND p.action = v.action
  );

INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, 'documents', 'read'
FROM public.roles r
WHERE r.name = 'support'
  AND NOT EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE p.role_id = r.id
      AND p.resource = 'documents'
      AND p.action = 'read'
  );
