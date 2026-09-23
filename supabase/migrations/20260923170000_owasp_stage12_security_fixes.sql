-- OWASP Stage 1+2 security fixes:
-- 1) Split privileged admin permissions away from members:read
-- 2) Scrub leftover application PII on anonymize
-- 3) Block UPDATE on audit_logs (append-only; DELETE already blocked)

INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, v.resource, v.action
FROM public.roles r
CROSS JOIN (
  VALUES
    ('settings', 'read'),
    ('settings', 'update'),
    ('members', 'reveal'),
    ('exports', 'create')
) AS v(resource, action)
WHERE r.name IN ('superadmin', 'admin')
  AND NOT EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE p.role_id = r.id
      AND p.resource = v.resource
      AND p.action = v.action
  );

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
    residential_address = NULL,
    whatsapp_phone = NULL,
    emergency_contact_name = NULL,
    emergency_contact_relationship = NULL,
    emergency_contact_phone = NULL,
    emergency_contact_alt_phone = NULL,
    admin_remarks = NULL,
    status = 'closed',
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

CREATE OR REPLACE FUNCTION public.prevent_audit_log_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be updated';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_update ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_update();
