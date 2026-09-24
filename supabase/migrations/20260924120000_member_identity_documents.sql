-- Member identity / KRA / beneficiary documents.
-- Extends members + family_members. Does not touch contributions or payments.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS kra_pin text;

COMMENT ON COLUMN public.members.kra_pin IS 'Kenya KRA PIN (A#########X). Mask in list APIs.';

ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS beneficiary_status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'family_members_beneficiary_status_check'
  ) THEN
    ALTER TABLE public.family_members
      ADD CONSTRAINT family_members_beneficiary_status_check
      CHECK (beneficiary_status IN ('pending', 'active', 'inactive', 'rejected'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.member_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  family_member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  document_type text NOT NULL
    CHECK (document_type IN (
      'national_id',
      'kra_certificate',
      'beneficiary_id',
      'beneficiary_kra',
      'other'
    )),
  storage_path text NOT NULL,
  original_filename text,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  uploaded_by uuid NOT NULL,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected', 'superseded')),
  verified_by uuid,
  verified_at timestamptz,
  rejection_reason text,
  expires_at date,
  supersedes_id uuid REFERENCES public.member_documents(id) ON DELETE SET NULL,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_documents_member
  ON public.member_documents (member_id, document_type, is_current);

CREATE INDEX IF NOT EXISTS idx_member_documents_family
  ON public.member_documents (family_member_id)
  WHERE family_member_id IS NOT NULL;

ALTER TABLE public.member_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_docs_select_own ON public.member_documents;
CREATE POLICY member_docs_select_own ON public.member_documents
  FOR SELECT TO authenticated
  USING (member_id = auth.uid());

DROP POLICY IF EXISTS member_docs_insert_own ON public.member_documents;
CREATE POLICY member_docs_insert_own ON public.member_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = auth.uid()
    AND uploaded_by = auth.uid()
    AND verification_status = 'pending'
    AND verified_by IS NULL
    AND verified_at IS NULL
  );

-- Members cannot change verification or reassign owner. Writes go through Edge (service role).
DROP POLICY IF EXISTS member_docs_no_update ON public.member_documents;
CREATE POLICY member_docs_no_update ON public.member_documents
  FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS member_docs_no_delete ON public.member_documents;
CREATE POLICY member_docs_no_delete ON public.member_documents
  FOR DELETE TO authenticated
  USING (false);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'member-documents',
  'member-documents',
  false,
  10485760,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf']::text[];

-- No authenticated object policies: service-role upload + signed URLs only.

INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, 'documents', 'verify'
FROM public.roles r
WHERE r.name IN ('superadmin', 'admin')
  AND NOT EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE p.role_id = r.id
      AND p.resource = 'documents'
      AND p.action = 'verify'
  );
