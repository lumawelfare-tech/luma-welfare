-- ============================================================================
-- Phase 2: Membership application foundation
-- Extends members (no luma_members). Aligns portal with official registration form.
-- Does not enable M-Pesa / Daraja.
-- ============================================================================

-- Application + membership number sequences
CREATE SEQUENCE IF NOT EXISTS public.application_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.membership_number_seq;

CREATE OR REPLACE FUNCTION public.generate_application_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  v := 'LUMA-APP-' || to_char((now() AT TIME ZONE 'Africa/Nairobi'), 'YYYYMMDD')
    || '-' || lpad(nextval('public.application_number_seq')::text, 5, '0');
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_membership_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  v := 'LUMA-M-' || lpad(nextval('public.membership_number_seq')::text, 6, '0');
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_application_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_membership_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_application_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_membership_number() TO service_role;

-- Application / profile columns from official form (extend members)
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS application_number text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS marital_status text,
  ADD COLUMN IF NOT EXISTS residential_address text,
  ADD COLUMN IF NOT EXISTS whatsapp_phone text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS emergency_contact_alt_phone text,
  ADD COLUMN IF NOT EXISTS family_coverage text,
  ADD COLUMN IF NOT EXISTS application_program_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS application_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS constitution_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_remarks text,
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_gender_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_gender_check
      CHECK (gender IS NULL OR gender IN ('male', 'female', 'prefer_not_to_say'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_marital_status_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_marital_status_check
      CHECK (marital_status IS NULL OR marital_status IN ('single', 'married', 'other'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_family_coverage_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_family_coverage_check
      CHECK (family_coverage IS NULL OR family_coverage IN ('individual', 'nuclear', 'extended'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS members_application_number_unique
  ON public.members (application_number)
  WHERE application_number IS NOT NULL;

-- Backfill application numbers for existing pending applicants without one
UPDATE public.members
SET application_number = public.generate_application_number(),
    application_submitted_at = coalesce(application_submitted_at, created_at, now())
WHERE status = 'pending_approval'
  AND application_number IS NULL;

-- Privileged columns: block member self-update of application_number + approval fields
CREATE OR REPLACE FUNCTION public.prevent_member_privileged_column_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.membership_number IS DISTINCT FROM OLD.membership_number
     OR NEW.application_number IS DISTINCT FROM OLD.application_number
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
     OR NEW.payment_verified_at IS DISTINCT FROM OLD.payment_verified_at
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.admin_remarks IS DISTINCT FROM OLD.admin_remarks
  THEN
    RAISE EXCEPTION 'Cannot modify privileged membership fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
