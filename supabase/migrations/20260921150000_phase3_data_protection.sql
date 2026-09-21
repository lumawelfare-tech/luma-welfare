-- Phase 3: data protection — consent timestamps + deletion requests (no payment changes).

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

CREATE TABLE IF NOT EXISTS public.data_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  admin_notes text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_member
  ON public.data_deletion_requests (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_status
  ON public.data_deletion_requests (status, created_at DESC);

ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_deletion_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deletion_requests_select_own" ON public.data_deletion_requests;
CREATE POLICY "deletion_requests_select_own"
  ON public.data_deletion_requests
  FOR SELECT
  TO authenticated
  USING (member_id = auth.uid());

DROP POLICY IF EXISTS "deletion_requests_insert_own" ON public.data_deletion_requests;
CREATE POLICY "deletion_requests_insert_own"
  ON public.data_deletion_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (member_id = auth.uid());

-- No UPDATE/DELETE for authenticated members — admins use service role via Edge Functions.

COMMENT ON TABLE public.data_deletion_requests IS
  'Member-initiated deletion requests. Fulfilment is manual; financial records may be retained.';
