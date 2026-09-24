-- Least-privilege: raw kra_pin is server-only (service_role / Edge).
-- Frontend and member JWTs never need PostgREST SELECT on this column.
-- GDPR export and profile PATCH continue via createAdminClient (service_role).
-- Reversible: GRANT SELECT (kra_pin) ON public.members TO authenticated;

REVOKE SELECT (kra_pin) ON public.members FROM PUBLIC;
REVOKE SELECT (kra_pin) ON public.members FROM anon;
REVOKE SELECT (kra_pin) ON public.members FROM authenticated;

COMMENT ON COLUMN public.members.kra_pin IS
  'Kenya KRA PIN (A#########X). Column SELECT revoked from anon/authenticated. Mask in APIs; service_role only for raw reads.';
