-- ============================================================================
-- Membership application: persist remaining consent + admin list summary fields.
-- Does not change approval, payments, RLS, or package activation.
-- ============================================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS self_submission_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS constitution_version text;

COMMENT ON COLUMN public.members.self_submission_confirmed_at IS
  'When the applicant confirmed they submitted the membership application themselves.';
COMMENT ON COLUMN public.members.constitution_version IS
  'LUMA Welfare Constitution / Membership Terms version accepted at registration.';

-- Versioned consent history: constitution + self-submission (privacy/terms already allowed).
ALTER TABLE public.member_legal_acceptances
  DROP CONSTRAINT IF EXISTS member_legal_acceptances_document_type_check;

ALTER TABLE public.member_legal_acceptances
  ADD CONSTRAINT member_legal_acceptances_document_type_check
  CHECK (document_type IN ('privacy', 'terms', 'constitution', 'self_submission'));

-- Admin list: return application summary fields (county, coverage, programs, dates).
-- Preserve anonymized default hide + identity/contact search.
CREATE OR REPLACE FUNCTION public.admin_search_members(
  p_q text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_page int DEFAULT 1,
  p_per_page int DEFAULT 50
)
RETURNS TABLE (
  members jsonb,
  total bigint,
  page int,
  per_page int,
  pages int
)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT
      m.id, m.membership_number, m.application_number, m.full_name, m.phone, m.email,
      m.id_number, m.status, m.joined_at, m.approved_at, m.anonymized_at,
      m.county, m.family_coverage, m.application_program_codes, m.application_submitted_at
    FROM members m
    WHERE
      CASE
        WHEN p_status = 'anonymized' THEN m.anonymized_at IS NOT NULL
        WHEN p_status IS NULL OR p_status = '' THEN m.anonymized_at IS NULL
        ELSE m.anonymized_at IS NULL
          AND m.status::text = p_status
      END
      AND (
        p_q IS NULL OR p_q = ''
        OR m.full_name ILIKE '%' || p_q || '%'
        OR m.phone ILIKE '%' || p_q || '%'
        OR m.membership_number ILIKE '%' || p_q || '%'
        OR (m.application_number IS NOT NULL AND m.application_number ILIKE '%' || p_q || '%')
        OR (m.email IS NOT NULL AND m.email ILIKE '%' || p_q || '%')
        OR (m.county IS NOT NULL AND m.county ILIKE '%' || p_q || '%')
        OR (m.id_number IS NOT NULL AND (
          m.id_number ILIKE '%' || p_q || '%'
          OR right(regexp_replace(m.id_number, '\D', '', 'g'), 4) = right(regexp_replace(p_q, '\D', '', 'g'), 4)
        ))
      )
  ),
  counted AS (
    SELECT f.*, COUNT(*) OVER() as full_count
    FROM filtered f
  )
  SELECT
    coalesce(jsonb_agg(c.*), '[]'::jsonb),
    coalesce(MAX(c.full_count), 0),
    p_page,
    p_per_page,
    GREATEST(1, CEIL(coalesce(MAX(c.full_count), 0)::numeric / p_per_page))
  FROM (
    SELECT * FROM counted
    ORDER BY
      CASE WHEN p_q IS NOT NULL AND p_q != '' THEN
        CASE
          WHEN full_name ILIKE p_q THEN 0
          WHEN membership_number ILIKE p_q THEN 1
          WHEN application_number ILIKE p_q THEN 2
          WHEN phone ILIKE p_q THEN 3
          WHEN email ILIKE p_q THEN 4
          WHEN county ILIKE p_q THEN 5
          WHEN id_number ILIKE '%' || p_q || '%' THEN 6
          ELSE 7
        END
      ELSE 0 END,
      coalesce(application_submitted_at, joined_at) DESC NULLS LAST
    LIMIT p_per_page OFFSET (p_page - 1) * p_per_page
  ) c;
$$;

COMMENT ON FUNCTION public.admin_search_members IS
  'Admin member search. Default/status filters exclude anonymized_at IS NOT NULL; p_status=anonymized returns only anonymized shells. Returns application summary fields for the members queue.';
