-- ============================================================================
-- Official org documents foundation — extend kb_documents (no luma_documents duplicate)
-- Adds under_review status + version_label/effective_date; seeds 3 UNDER_REVIEW metadata rows.
-- Storage uploads are applied separately (private kb-documents bucket).
-- Does NOT auto-approve. Does NOT enable RAG/M-Pesa.
-- ============================================================================

-- Expand status lifecycle: draft → under_review → approved → archived
ALTER TABLE public.kb_documents DROP CONSTRAINT IF EXISTS kb_documents_status_check;
ALTER TABLE public.kb_documents
  ADD CONSTRAINT kb_documents_status_check
  CHECK (status IN ('draft', 'under_review', 'approved', 'archived'));

ALTER TABLE public.kb_documents
  ADD COLUMN IF NOT EXISTS version_label text,
  ADD COLUMN IF NOT EXISTS effective_date date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kb_documents_version_label_len'
  ) THEN
    ALTER TABLE public.kb_documents
      ADD CONSTRAINT kb_documents_version_label_len
      CHECK (version_label IS NULL OR char_length(version_label) BETWEEN 1 AND 40);
  END IF;
END $$;

-- Optional category vocabulary (null/other still allowed via OTHER)
ALTER TABLE public.kb_documents DROP CONSTRAINT IF EXISTS kb_documents_category_vocab_check;
ALTER TABLE public.kb_documents
  ADD CONSTRAINT kb_documents_category_vocab_check
  CHECK (
    category IS NULL
    OR category IN (
      'ORGANIZATIONAL',
      'PUBLIC_CONTENT',
      'MEMBERSHIP',
      'POLICY',
      'PROGRAM',
      'CLAIMS',
      'FINANCE',
      'COMMUNITY',
      'OTHER'
    )
  );

COMMENT ON COLUMN public.kb_documents.version_label IS 'Human version label (e.g. 1.0); integer version column remains for ordering.';
COMMENT ON COLUMN public.kb_documents.effective_date IS 'Optional effective date for approved schedules.';

-- ---------------------------------------------------------------------------
-- Seed three official source documents as UNDER_REVIEW (not approved)
-- Files uploaded to matching storage_path by ops script / storage cp.
-- ---------------------------------------------------------------------------
INSERT INTO public.kb_documents (
  title, slug, summary, category, access_level, status,
  storage_path, file_name, mime_type, version, version_label
)
SELECT
  'LUMA Welfare Master Organization Document',
  'luma-welfare-master-organization-document',
  'Official organizational knowledge, policies, governance, programs, claims procedures, and digital-development framework. UNDER_REVIEW — not public knowledge until approved.',
  'ORGANIZATIONAL',
  'staff',
  'under_review',
  'organizational/luma-welfare-master-organization-document.pdf',
  'LUMA_WELFARE_MASTER_DOCUMENT_UPDATED.pdf',
  'application/pdf',
  1,
  '1.0'
WHERE NOT EXISTS (
  SELECT 1 FROM public.kb_documents d
  WHERE d.slug = 'luma-welfare-master-organization-document'
     OR d.storage_path = 'organizational/luma-welfare-master-organization-document.pdf'
);

INSERT INTO public.kb_documents (
  title, slug, summary, category, access_level, status,
  storage_path, file_name, mime_type, version, version_label
)
SELECT
  'LUMA Welfare Our Story',
  'luma-welfare-our-story',
  'Public-facing organizational story, history, vision, mission and program information. access_level=public but status=under_review — not treated as official public knowledge until approved.',
  'PUBLIC_CONTENT',
  'public',
  'under_review',
  'public-content/luma-welfare-our-story.pdf',
  'LUMA_Welfare_Our_Story.pdf',
  'application/pdf',
  1,
  '1.0'
WHERE NOT EXISTS (
  SELECT 1 FROM public.kb_documents d
  WHERE d.slug = 'luma-welfare-our-story'
     OR d.storage_path = 'public-content/luma-welfare-our-story.pdf'
);

INSERT INTO public.kb_documents (
  title, slug, summary, category, access_level, status,
  storage_path, file_name, mime_type, version, version_label
)
SELECT
  'Online Membership Registration Form',
  'online-membership-registration-form',
  'Internal/reference document for the LUMA membership application workflow. Contains PII field definitions — STAFF only; not publicly downloadable.',
  'MEMBERSHIP',
  'staff',
  'under_review',
  'membership/online-membership-registration-form.pdf',
  'LUMA_Welfare_Online_Membership_Registration_Form.pdf',
  'application/pdf',
  1,
  '1.0'
WHERE NOT EXISTS (
  SELECT 1 FROM public.kb_documents d
  WHERE d.slug = 'online-membership-registration-form'
     OR d.storage_path = 'membership/online-membership-registration-form.pdf'
);
