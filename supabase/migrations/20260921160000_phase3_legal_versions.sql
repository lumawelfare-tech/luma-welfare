-- Phase 3b: versioned Privacy/Terms consent + acceptance history (RLS-safe).
-- Extends 20260921150000_phase3_data_protection.sql — no payment changes.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS privacy_policy_version text,
  ADD COLUMN IF NOT EXISTS terms_version text;

COMMENT ON COLUMN public.members.privacy_policy_version IS
  'Privacy Policy version string last accepted by the member (see legal-versions).';
COMMENT ON COLUMN public.members.terms_version IS
  'Terms & Conditions version string last accepted by the member.';

CREATE TABLE IF NOT EXISTS public.member_legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('privacy', 'terms')),
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'registration'
    CHECK (source IN ('registration', 'reconsent', 'admin_backfill')),
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_legal_acceptances_member
  ON public.member_legal_acceptances (member_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_legal_acceptances_doc
  ON public.member_legal_acceptances (document_type, document_version);

ALTER TABLE public.member_legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_legal_acceptances FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legal_acceptances_select_own" ON public.member_legal_acceptances;
CREATE POLICY "legal_acceptances_select_own"
  ON public.member_legal_acceptances
  FOR SELECT
  TO authenticated
  USING (member_id = auth.uid());

-- Members must not insert/update/delete directly — Edge Functions use service role.

COMMENT ON TABLE public.member_legal_acceptances IS
  'Append-only history of Privacy/Terms acceptances. Writes via Edge Functions (service role).';
