-- ============================================================================
-- Phase 4: Admin operations — complaints + community support records
-- Extends RBAC; does not enable M-Pesa / Daraja. No parallel applications table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Complaints (Master Blueprint §14)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.complaint_number_seq;

CREATE OR REPLACE FUNCTION public.generate_complaint_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  v := 'LUMA-CMP-' || to_char((now() AT TIME ZONE 'Africa/Nairobi'), 'YYYYMMDD')
    || '-' || lpad(nextval('public.complaint_number_seq')::text, 5, '0');
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_complaint_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_complaint_number() TO service_role;

CREATE TABLE IF NOT EXISTS public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text NOT NULL,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN (
      'submitted',
      'acknowledged',
      'under_review',
      'resolved',
      'closed',
      'escalated'
    )),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES public.admins(id),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.admins(id),
  resolution_notes text,
  appeal_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT complaints_subject_len CHECK (char_length(subject) BETWEEN 3 AND 200),
  CONSTRAINT complaints_body_len CHECK (char_length(body) BETWEEN 10 AND 5000),
  CONSTRAINT complaints_resolution_len CHECK (resolution_notes IS NULL OR char_length(resolution_notes) <= 4000)
);

CREATE UNIQUE INDEX IF NOT EXISTS complaints_reference_number_unique
  ON public.complaints (reference_number);

CREATE INDEX IF NOT EXISTS complaints_member_id_created_idx
  ON public.complaints (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS complaints_status_created_idx
  ON public.complaints (status, created_at DESC);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "complaints_select_own" ON public.complaints;
CREATE POLICY "complaints_select_own" ON public.complaints
  FOR SELECT
  USING (member_id = auth.uid());

DROP POLICY IF EXISTS "complaints_insert_own" ON public.complaints;
CREATE POLICY "complaints_insert_own" ON public.complaints
  FOR INSERT
  WITH CHECK (member_id = auth.uid());

-- Members cannot update/delete — status transitions via admin Edge Functions (service_role)

-- ---------------------------------------------------------------------------
-- Community support records (Mission of Mercy / Master §12)
-- Admin-only ops log. No child PII / images.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_support_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_date date NOT NULL,
  location text NOT NULL,
  purpose text NOT NULL,
  resources_used text,
  responsible_officials text,
  partner_organization text,
  outcome text,
  notes text,
  created_by uuid REFERENCES public.admins(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_location_len CHECK (char_length(location) BETWEEN 2 AND 300),
  CONSTRAINT community_purpose_len CHECK (char_length(purpose) BETWEEN 3 AND 500),
  CONSTRAINT community_resources_len CHECK (resources_used IS NULL OR char_length(resources_used) <= 2000),
  CONSTRAINT community_officials_len CHECK (responsible_officials IS NULL OR char_length(responsible_officials) <= 500),
  CONSTRAINT community_partner_len CHECK (partner_organization IS NULL OR char_length(partner_organization) <= 300),
  CONSTRAINT community_outcome_len CHECK (outcome IS NULL OR char_length(outcome) <= 2000),
  CONSTRAINT community_notes_len CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE INDEX IF NOT EXISTS community_support_records_date_idx
  ON public.community_support_records (record_date DESC);

ALTER TABLE public.community_support_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_support_records FORCE ROW LEVEL SECURITY;

-- No anon/member policies — service_role / admin Edge Functions only
DROP POLICY IF EXISTS "community_support_admin_read" ON public.community_support_records;
CREATE POLICY "community_support_admin_read" ON public.community_support_records
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admins a
      WHERE a.id = auth.uid() AND a.is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- RBAC: complaints + community permissions
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, v.resource, v.action
FROM public.roles r
CROSS JOIN (
  VALUES
    ('complaints', 'read'),
    ('complaints', 'create'),
    ('complaints', 'update'),
    ('complaints', 'approve'),
    ('community', 'read'),
    ('community', 'create'),
    ('community', 'update'),
    ('community', 'delete')
) AS v(resource, action)
WHERE r.name IN ('superadmin', 'admin')
  AND NOT EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE p.role_id = r.id
      AND p.resource = v.resource
      AND p.action = v.action
  );

INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, v.resource, v.action
FROM public.roles r
CROSS JOIN (
  VALUES
    ('complaints', 'read'),
    ('complaints', 'update'),
    ('complaints', 'approve')
) AS v(resource, action)
WHERE r.name = 'support'
  AND NOT EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE p.role_id = r.id
      AND p.resource = v.resource
      AND p.action = v.action
  );
