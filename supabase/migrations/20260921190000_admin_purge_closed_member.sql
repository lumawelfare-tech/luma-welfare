-- ============================================================================
-- Superadmin purge of closed members (transactional).
-- Safe / reversible: DROP FUNCTION IF EXISTS admin_purge_closed_member(uuid, uuid);
--
-- Paths:
--   hard_delete  — no financial rows; remove member (+ CASCADE dependents)
--   anonymize    — has financial rows; scrub PII, keep member id for FK integrity
--
-- Auth.users deletion is intentionally NOT done here:
--   members.id REFERENCES auth.users(id) ON DELETE CASCADE — deleting Auth would
--   attempt to remove the member row and break NO ACTION financial FKs.
--   Edge Function: deleteUser only after hard_delete; ban+anonymize email after anonymize.
--
-- BEFORE APPLY: review with counsel how long financial records must be retained.
-- ============================================================================

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

  -- Collect claim document storage paths before any claim mutation (anonymize keeps claims)
  SELECT coalesce(array_agg(cd.file_url), ARRAY[]::text[])
  INTO v_claim_paths
  FROM public.claim_documents cd
  JOIN public.claims cl ON cl.id = cd.claim_id
  WHERE cl.member_id = p_member_id;

  -- Always scrub non-financial PII side tables
  DELETE FROM public.notifications WHERE member_id = p_member_id;
  DELETE FROM public.family_members WHERE member_id = p_member_id;
  DELETE FROM public.notification_preferences WHERE member_id = p_member_id;
  DELETE FROM public.data_deletion_requests WHERE member_id = p_member_id;
  DELETE FROM public.member_legal_acceptances WHERE member_id = p_member_id;
  DELETE FROM public.email_verifications WHERE user_id = p_member_id;

  IF NOT v_has_financial THEN
    DELETE FROM public.qualifications WHERE member_id = p_member_id;
    -- Clear claim docs if any orphan path (should be none without claims)
    DELETE FROM public.members WHERE id = p_member_id;

    RETURN jsonb_build_object(
      'path', 'hard_delete',
      'member_id', p_member_id,
      'photo_url', v_photo,
      'claim_document_paths', to_jsonb(v_claim_paths),
      'auth_action', 'delete_user'
    );
  END IF;

  -- Anonymize path — keep member row for financial FKs
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
    updated_at = now()
  WHERE id = p_member_id;

  -- Scrub phone on payment rows (PII); keep amounts/status
  UPDATE public.payments
  SET phone = '0700000000',
      payload = NULL,
      updated_at = now()
  WHERE member_id = p_member_id;

  -- Detach claim document URLs (files removed by Edge); keep claim financial rows
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
  'Superadmin-only closed-member purge (called from Edge). hard_delete vs anonymize; never logs PII.';
