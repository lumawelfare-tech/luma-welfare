-- ============================================================================
-- Phase 5: Claims & welfare ops — checklist stages + paid_at
-- Extends claims only. Does not enable M-Pesa / Daraja.
-- Rollback: ignore new columns; payouts/recording remains unused.
-- ============================================================================

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS checklist_docs_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_membership_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_contributions_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS checklist_updated_by uuid REFERENCES public.admins(id),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

COMMENT ON COLUMN public.claims.checklist_docs_ok IS 'Admin verified supporting documents for this claim.';
COMMENT ON COLUMN public.claims.checklist_membership_ok IS 'Admin verified membership status for this claim.';
COMMENT ON COLUMN public.claims.checklist_contributions_ok IS 'Admin verified contribution history for this claim.';
COMMENT ON COLUMN public.claims.paid_at IS 'When claim was marked Paid after manual payout recording.';
