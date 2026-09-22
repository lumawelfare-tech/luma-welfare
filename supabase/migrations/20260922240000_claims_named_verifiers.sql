-- ============================================================================
-- Claims named officer verifiers (paper form parity)
-- Extends Phase 5 checklist: "Eligibility verified by" /
-- "Contribution status verified by" as named fields.
-- Does not enable M-Pesa / Daraja.
-- Rollback: ignore new columns; booleans remain authoritative for older rows.
-- ============================================================================

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS eligibility_verified_by text,
  ADD COLUMN IF NOT EXISTS contributions_verified_by text;

COMMENT ON COLUMN public.claims.eligibility_verified_by IS
  'Officer name for paper-form Eligibility verified by (set when membership checklist is true).';
COMMENT ON COLUMN public.claims.contributions_verified_by IS
  'Officer name for paper-form Contribution status verified by (set when contributions checklist is true).';

ALTER TABLE public.claims
  DROP CONSTRAINT IF EXISTS claims_eligibility_verified_by_len;
ALTER TABLE public.claims
  ADD CONSTRAINT claims_eligibility_verified_by_len
  CHECK (eligibility_verified_by IS NULL OR char_length(eligibility_verified_by) BETWEEN 1 AND 120);

ALTER TABLE public.claims
  DROP CONSTRAINT IF EXISTS claims_contributions_verified_by_len;
ALTER TABLE public.claims
  ADD CONSTRAINT claims_contributions_verified_by_len
  CHECK (contributions_verified_by IS NULL OR char_length(contributions_verified_by) BETWEEN 1 AND 120);
