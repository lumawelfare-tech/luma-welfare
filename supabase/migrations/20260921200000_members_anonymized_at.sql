-- ============================================================================
-- Mark anonymized (PII-scrubbed) members and hide them from default admin list.
-- Safe / reversible:
--   ALTER TABLE members DROP COLUMN IF EXISTS anonymized_at;
--   DROP INDEX IF EXISTS idx_members_anonymized_at;
--   Then restore prior admin_search_members + admin_purge_closed_member from
--   20260921170000 / 20260921190000 if rolling back the function bodies.
--
-- BEFORE APPLY: confirm with counsel that retaining anonymized shells is required
-- for financial FK integrity, and that hiding them from default lists is OK.
-- ============================================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz NULL;

COMMENT ON COLUMN public.members.anonymized_at IS
  'Set when a closed member is PII-scrubbed (purge anonymize path). NULL = not anonymized.';

CREATE INDEX IF NOT EXISTS idx_members_anonymized_at
  ON public.members (anonymized_at)
  WHERE anonymized_at IS NOT NULL;

-- Backfill shells already anonymized by prior purge runs (heuristic, reversible via SET NULL).
UPDATE public.members
SET anonymized_at = coalesce(updated_at, now())
WHERE anonymized_at IS NULL
  AND status = 'closed'
  AND full_name = 'Deleted member'
  AND phone IN ('0700000000', '254700000000', '+254700000000')
  AND email IS NULL
  AND id_number IS NULL;

-- ---------------------------------------------------------------------------
-- admin_search_members — hide anonymized by default; p_status='anonymized' shows only them
-- ---------------------------------------------------------------------------
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
      m.id, m.membership_number, m.full_name, m.phone, m.email,
      m.id_number, m.status, m.joined_at, m.approved_at, m.anonymized_at
    FROM members m
    WHERE
      CASE
        WHEN p_status = 'anonymized' THEN m.anonymized_at IS NOT NULL
        WHEN p_status IS NULL OR p_status = '' THEN m.anonymized_at IS NULL
          AND (TRUE) -- all non-anonymized statuses
        ELSE m.anonymized_at IS NULL
          AND m.status::text = p_status
      END
      AND (
        p_q IS NULL OR p_q = ''
        OR m.full_name ILIKE '%' || p_q || '%'
        OR m.phone ILIKE '%' || p_q || '%'
        OR m.membership_number ILIKE '%' || p_q || '%'
        OR (m.email IS NOT NULL AND m.email ILIKE '%' || p_q || '%')
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
          WHEN phone ILIKE p_q THEN 2
          WHEN email ILIKE p_q THEN 3
          WHEN id_number ILIKE '%' || p_q || '%' THEN 4
          ELSE 5
        END
      ELSE 0 END,
      joined_at DESC NULLS LAST
    LIMIT p_per_page OFFSET (p_page - 1) * p_per_page
  ) c;
$$;

COMMENT ON FUNCTION public.admin_search_members IS
  'Admin member search. Default/status filters exclude anonymized_at IS NOT NULL; p_status=anonymized returns only anonymized shells.';

-- ---------------------------------------------------------------------------
-- admin_purge_closed_member — set anonymized_at on anonymize path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_purge_closed_member(
  p_member_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_has_financial boolean;
  v_ref text;
  v_photo text;
  v_claim_paths text[];
BEGIN
  IF p_member_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_member_id = p_actor_id THEN
    RAISE EXCEPTION 'self_delete_blocked' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.admins a WHERE a.id = p_member_id) THEN
    RAISE EXCEPTION 'admin_delete_blocked' USING ERRCODE = '42501';
  END IF;

  SELECT m.status::text, m.photo_url
  INTO v_status, v_photo
  FROM public.members m
  WHERE m.id = p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION 'member_not_closed' USING ERRCODE = '42501';
  END IF;

  v_has_financial := EXISTS (SELECT 1 FROM public.contributions c WHERE c.member_id = p_member_id)
    OR EXISTS (SELECT 1 FROM public.payments p WHERE p.member_id = p_member_id)
    OR EXISTS (SELECT 1 FROM public.claims cl WHERE cl.member_id = p_member_id)
    OR EXISTS (SELECT 1 FROM public.payouts po WHERE po.member_id = p_member_id)
    OR EXISTS (SELECT 1 FROM public.registration_fees rf WHERE rf.member_id = p_member_id);

  SELECT coalesce(array_agg(cd.file_url), ARRAY[]::text[])
  INTO v_claim_paths
  FROM public.claim_documents cd
  JOIN public.claims cl ON cl.id = cd.claim_id
  WHERE cl.member_id = p_member_id;

  DELETE FROM public.notifications WHERE member_id = p_member_id;
  DELETE FROM public.family_members WHERE member_id = p_member_id;
  DELETE FROM public.notification_preferences WHERE member_id = p_member_id;
  DELETE FROM public.data_deletion_requests WHERE member_id = p_member_id;
  DELETE FROM public.member_legal_acceptances WHERE member_id = p_member_id;
  DELETE FROM public.email_verifications WHERE user_id = p_member_id;

  IF NOT v_has_financial THEN
    DELETE FROM public.qualifications WHERE member_id = p_member_id;
    DELETE FROM public.members WHERE id = p_member_id;

    RETURN jsonb_build_object(
      'path', 'hard_delete',
      'member_id', p_member_id,
      'photo_url', v_photo,
      'claim_document_paths', to_jsonb(v_claim_paths),
      'auth_action', 'delete_user'
    );
  END IF;

  v_ref := 'DEL-' || upper(substr(replace(p_member_id::text, '-', ''), 1, 8));

  UPDATE public.members SET
    full_name = 'Deleted member',
    membership_number = coalesce(membership_number, v_ref),
    id_number = NULL,
    phone = '0700000000',
    alt_phone = NULL,
    email = NULL,
    date_of_birth = NULL,
    county = NULL,
    location = NULL,
    occupation = NULL,
    photo_url = NULL,
    status = 'closed',
    anonymized_at = coalesce(anonymized_at, now()),
    updated_at = now()
  WHERE id = p_member_id;

  UPDATE public.payments
  SET phone = '0700000000',
      payload = NULL,
      updated_at = now()
  WHERE member_id = p_member_id;

  UPDATE public.claim_documents cd
  SET file_url = 'purged',
      file_name = 'purged'
  FROM public.claims cl
  WHERE cd.claim_id = cl.id
    AND cl.member_id = p_member_id;

  RETURN jsonb_build_object(
    'path', 'anonymize',
    'member_id', p_member_id,
    'reference', v_ref,
    'photo_url', v_photo,
    'claim_document_paths', to_jsonb(v_claim_paths),
    'auth_action', 'ban_user'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_closed_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_closed_member(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.admin_purge_closed_member(uuid, uuid) IS
  'Superadmin-only closed-member purge. hard_delete vs anonymize (sets anonymized_at); never logs PII.';
