-- ============================================================================
-- Go-live content safety (Daraja still off):
-- 1) Rename Hospital Insurance display name → Outpatient Hospital Support
--    (code stays 'hospital'; avoids sounding like a regulated insurance product)
-- 2) Approve three official KB PDFs under_review → approved so staff/members
--    can use the lifecycle; public Our Story becomes RAG-eligible metadata.
-- ============================================================================

UPDATE public.packages
SET
  name = 'Outpatient Hospital Support',
  updated_at = now()
WHERE code = 'hospital'
  AND name ILIKE '%insurance%';

UPDATE public.kb_documents
SET
  status = 'approved',
  approved_at = COALESCE(approved_at, now()),
  summary = CASE slug
    WHEN 'luma-welfare-master-organization-document' THEN
      'Official organizational knowledge, policies, governance, programs, claims procedures, and digital-development framework. Staff reference — not publicly downloadable.'
    WHEN 'luma-welfare-our-story' THEN
      'Public-facing organizational story, history, vision, mission and program information.'
    WHEN 'online-membership-registration-form' THEN
      'Internal/reference document for the LUMA membership application workflow. Contains PII field definitions — STAFF only; not publicly downloadable.'
    ELSE summary
  END,
  updated_at = now()
WHERE slug IN (
  'luma-welfare-master-organization-document',
  'luma-welfare-our-story',
  'online-membership-registration-form'
)
AND status = 'under_review';
