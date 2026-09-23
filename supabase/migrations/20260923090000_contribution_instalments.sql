-- ============================================================================
-- Lipa Pole Pole — instalment ledger per member / package / YYYY-MM period
-- Reuses contributions as the period envelope (one row per subscription+period).
-- Does not change package pricing, registration fees, waiting periods, or M-Pesa.
-- ============================================================================

ALTER TABLE public.contributions
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contributions_amount_paid_nonneg'
  ) THEN
    ALTER TABLE public.contributions
      ADD CONSTRAINT contributions_amount_paid_nonneg CHECK (amount_paid >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.contributions.amount IS
  'Required monthly contribution for this period (package/tier amount at first record).';
COMMENT ON COLUMN public.contributions.amount_paid IS
  'Sum of verified/paid instalments toward this period. Period is fully paid when amount_paid >= amount.';

CREATE TABLE IF NOT EXISTS public.contribution_instalments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id uuid NOT NULL REFERENCES public.contributions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id),
  package_id uuid NOT NULL REFERENCES public.packages(id),
  period text NOT NULL,
  amount numeric(12,2) NOT NULL,
  running_balance_after numeric(12,2) NOT NULL,
  status public.contribution_status NOT NULL DEFAULT 'Pending',
  recorded_by uuid,
  recorded_as_admin boolean NOT NULL DEFAULT false,
  payment_method text,
  transaction_reference text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contribution_instalments_amount_positive CHECK (amount > 0 AND amount <= 1000000),
  CONSTRAINT contribution_instalments_period_ym CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT contribution_instalments_balance_nonneg CHECK (running_balance_after >= 0)
);

CREATE INDEX IF NOT EXISTS idx_contribution_instalments_contribution
  ON public.contribution_instalments (contribution_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_contribution_instalments_member_period
  ON public.contribution_instalments (member_id, period, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contribution_instalments_subscription
  ON public.contribution_instalments (subscription_id, period);

ALTER TABLE public.contribution_instalments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_instalments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "instalments_select_own" ON public.contribution_instalments;
CREATE POLICY "instalments_select_own" ON public.contribution_instalments
  FOR SELECT
  USING (member_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "instalments_insert_own_pending" ON public.contribution_instalments;
CREATE POLICY "instalments_insert_own_pending" ON public.contribution_instalments
  FOR INSERT
  WITH CHECK (
    member_id = (SELECT auth.uid())
    AND status = 'Pending'
    AND recorded_as_admin = false
  );

-- No member UPDATE/DELETE. Admins record/verify via service-role Edge Functions.

-- Backfill envelope paid totals from existing full-month rows
UPDATE public.contributions
SET amount_paid = amount
WHERE status::text IN ('Paid', 'Verified', 'Late')
  AND amount_paid = 0;

-- One ledger row per existing contribution so history is not empty
INSERT INTO public.contribution_instalments (
  contribution_id, member_id, subscription_id, package_id, period,
  amount, running_balance_after, status, recorded_by, recorded_as_admin,
  notes, paid_at, created_at, updated_at
)
SELECT
  c.id,
  c.member_id,
  c.subscription_id,
  c.package_id,
  c.period,
  c.amount,
  CASE WHEN c.status::text IN ('Paid', 'Verified', 'Late') THEN 0 ELSE c.amount END,
  c.status,
  c.recorded_by,
  false,
  c.notes,
  c.created_at,
  c.created_at,
  c.updated_at
FROM public.contributions c
WHERE c.period ~ '^\d{4}-(0[1-9]|1[0-2])$'
  AND NOT EXISTS (
    SELECT 1 FROM public.contribution_instalments i WHERE i.contribution_id = c.id
  );

-- ============================================================================
-- Atomic record: registration fee paid + active package + no overpay
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_contribution_instalment(
  p_member_id uuid,
  p_subscription_id uuid,
  p_period text,
  p_amount numeric,
  p_recorded_by uuid,
  p_as_admin boolean DEFAULT false,
  p_notes text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_transaction_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_fee_status text;
  v_required numeric(12,2);
  v_contrib RECORD;
  v_reserved numeric(12,2);
  v_remaining numeric(12,2);
  v_amount numeric(12,2);
  v_status public.contribution_status;
  v_paid numeric(12,2);
  v_inst RECORD;
  v_fully boolean;
BEGIN
  IF p_period IS NULL OR p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'PERIOD_INVALID' USING ERRCODE = 'P0001';
  END IF;

  v_amount := ROUND(COALESCE(p_amount, 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'AMOUNT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_fee_status
  FROM public.registration_fees
  WHERE member_id = p_member_id AND fee_type = 'registration'
  LIMIT 1;
  IF v_fee_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'REGISTRATION_FEE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.id, s.status, s.member_id, s.package_id, s.package_tier_id
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.id = p_subscription_id
  FOR UPDATE;
  IF NOT FOUND OR v_sub.member_id IS DISTINCT FROM p_member_id THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_sub.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'SUBSCRIPTION_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  SELECT ROUND(pt.amount, 2) INTO v_required
  FROM public.package_tiers pt
  WHERE pt.id = v_sub.package_tier_id;
  IF v_required IS NULL OR v_required <= 0 THEN
    RAISE EXCEPTION 'AMOUNT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.* INTO v_contrib
  FROM public.contributions c
  WHERE c.subscription_id = p_subscription_id AND c.period = p_period
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.contributions (
      subscription_id, member_id, package_id, period, amount, amount_paid, status, recorded_by, notes
    ) VALUES (
      p_subscription_id, p_member_id, v_sub.package_id, p_period, v_required, 0, 'Pending', p_recorded_by, p_notes
    )
    RETURNING * INTO v_contrib;
  END IF;

  SELECT COALESCE(SUM(i.amount), 0) INTO v_reserved
  FROM public.contribution_instalments i
  WHERE i.contribution_id = v_contrib.id
    AND i.status::text IN ('Pending', 'Verified', 'Paid', 'Late');

  v_remaining := ROUND(v_contrib.amount - v_reserved, 2);
  IF v_remaining < 0 THEN
    v_remaining := 0;
  END IF;
  IF v_amount > v_remaining THEN
    RAISE EXCEPTION 'OVERPAYMENT' USING ERRCODE = 'P0001';
  END IF;

  IF p_as_admin THEN
    v_status := 'Verified';
  ELSE
    v_status := 'Pending';
  END IF;

  INSERT INTO public.contribution_instalments (
    contribution_id, member_id, subscription_id, package_id, period,
    amount, running_balance_after, status, recorded_by, recorded_as_admin,
    payment_method, transaction_reference, notes, paid_at
  ) VALUES (
    v_contrib.id, p_member_id, p_subscription_id, v_sub.package_id, p_period,
    v_amount, ROUND(v_remaining - v_amount, 2), v_status, p_recorded_by, COALESCE(p_as_admin, false),
    p_payment_method, p_transaction_reference, p_notes, now()
  )
  RETURNING * INTO v_inst;

  SELECT COALESCE(SUM(i.amount), 0) INTO v_paid
  FROM public.contribution_instalments i
  WHERE i.contribution_id = v_contrib.id
    AND i.status::text IN ('Verified', 'Paid', 'Late');

  v_fully := v_paid >= v_contrib.amount;
  UPDATE public.contributions
  SET
    amount_paid = v_paid,
    status = CASE
      WHEN v_fully THEN 'Verified'::public.contribution_status
      ELSE 'Pending'::public.contribution_status
    END,
    updated_at = now()
  WHERE id = v_contrib.id
  RETURNING * INTO v_contrib;

  RETURN jsonb_build_object(
    'instalment', to_jsonb(v_inst),
    'contribution', to_jsonb(v_contrib),
    'required_amount', v_contrib.amount,
    'amount_paid', v_paid,
    'remaining', ROUND(v_contrib.amount - v_paid, 2),
    'fully_paid', v_fully
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_contribution_instalment(
  p_instalment_id uuid,
  p_action text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst RECORD;
  v_contrib RECORD;
  v_paid numeric(12,2);
  v_fully boolean;
  v_new_status public.contribution_status;
BEGIN
  IF p_action IS DISTINCT FROM 'verify' AND p_action IS DISTINCT FROM 'reject' THEN
    RAISE EXCEPTION 'AMOUNT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT i.* INTO v_inst
  FROM public.contribution_instalments i
  WHERE i.id = p_instalment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_inst.status::text IS DISTINCT FROM 'Pending' THEN
    RAISE EXCEPTION 'AMOUNT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.* INTO v_contrib
  FROM public.contributions c
  WHERE c.id = v_inst.contribution_id
  FOR UPDATE;

  IF p_action = 'verify' THEN
    v_new_status := 'Verified';
  ELSE
    v_new_status := 'Failed';
  END IF;

  UPDATE public.contribution_instalments
  SET
    status = v_new_status,
    notes = COALESCE(p_notes, notes),
    updated_at = now(),
    running_balance_after = CASE
      WHEN p_action = 'verify' THEN running_balance_after
      ELSE running_balance_after + amount
    END
  WHERE id = p_instalment_id
  RETURNING * INTO v_inst;

  SELECT COALESCE(SUM(i.amount), 0) INTO v_paid
  FROM public.contribution_instalments i
  WHERE i.contribution_id = v_contrib.id
    AND i.status::text IN ('Verified', 'Paid', 'Late');

  v_fully := v_paid >= v_contrib.amount AND v_contrib.amount > 0;

  UPDATE public.contributions
  SET
    amount_paid = v_paid,
    status = CASE
      WHEN v_fully THEN 'Verified'::public.contribution_status
      WHEN v_paid = 0 AND NOT EXISTS (
        SELECT 1 FROM public.contribution_instalments x
        WHERE x.contribution_id = v_contrib.id AND x.status = 'Pending'
      ) THEN 'Failed'::public.contribution_status
      ELSE 'Pending'::public.contribution_status
    END,
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = v_contrib.id
  RETURNING * INTO v_contrib;

  RETURN jsonb_build_object(
    'instalment', to_jsonb(v_inst),
    'contribution', to_jsonb(v_contrib),
    'required_amount', v_contrib.amount,
    'amount_paid', v_paid,
    'remaining', GREATEST(0, ROUND(v_contrib.amount - v_paid, 2)),
    'fully_paid', v_fully
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_contribution_instalment(uuid, uuid, text, numeric, uuid, boolean, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_contribution_instalment(uuid, uuid, text, numeric, uuid, boolean, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.verify_contribution_instalment(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_contribution_instalment(uuid, text, text)
  TO service_role;

-- Include amount_paid on member list RPC (keep ownership check)
CREATE OR REPLACE FUNCTION public.member_search_contributions(
  p_member_id UUID,
  p_subscription_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_per_page INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INT;
  v_total BIGINT;
  v_pages INT;
  v_contributions JSONB;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR p_member_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_page < 1 THEN p_page := 1; END IF;
  IF p_per_page < 1 THEN p_per_page := 20; END IF;
  IF p_per_page > 100 THEN p_per_page := 100; END IF;
  v_offset := (p_page - 1) * p_per_page;

  SELECT count(*) INTO v_total
  FROM contributions c
  WHERE c.member_id = p_member_id
    AND (p_subscription_id IS NULL OR c.subscription_id = p_subscription_id)
    AND (p_status IS NULL OR c.status = p_status);

  v_pages := GREATEST(1, CEIL(v_total::NUMERIC / p_per_page));

  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb)
  INTO v_contributions
  FROM (
    SELECT
      c.id,
      c.subscription_id,
      c.period,
      c.amount,
      c.amount_paid,
      GREATEST(0, ROUND(c.amount - c.amount_paid, 2)) AS remaining,
      c.status,
      c.notes,
      c.created_at,
      jsonb_build_object('code', p.code, 'name', p.name) AS packages
    FROM contributions c
    LEFT JOIN packages p ON p.id = c.package_id
    WHERE c.member_id = p_member_id
      AND (p_subscription_id IS NULL OR c.subscription_id = p_subscription_id)
      AND (p_status IS NULL OR c.status = p_status)
    ORDER BY c.period DESC, c.created_at DESC
    LIMIT p_per_page OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object(
    'contributions', v_contributions,
    'total', v_total,
    'page', p_page,
    'per_page', p_per_page,
    'pages', v_pages
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_search_contributions(
  p_q text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_page int DEFAULT 1,
  p_per_page int DEFAULT 50,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_package_id uuid DEFAULT NULL
)
RETURNS TABLE (
  contributions jsonb,
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
      c.id, c.period, c.amount, c.amount_paid,
      GREATEST(0, ROUND(c.amount - c.amount_paid, 2)) AS remaining,
      c.status, c.notes, c.created_at, c.member_id, c.subscription_id,
      jsonb_build_object(
        'full_name', m.full_name,
        'phone', m.phone,
        'email', m.email,
        'membership_number', m.membership_number
      ) as members,
      jsonb_build_object('code', p.code, 'name', p.name) as packages,
      jsonb_build_object('mpesa_receipt', pay.mpesa_receipt, 'channel', pay.channel) as payments
    FROM contributions c
    LEFT JOIN members m ON m.id = c.member_id
    LEFT JOIN packages p ON p.id = c.package_id
    LEFT JOIN payments pay ON pay.id = c.payment_id
    WHERE
      (p_status IS NULL OR p_status = '' OR c.status::text = p_status)
      AND (p_date_from IS NULL OR c.created_at >= p_date_from)
      AND (p_date_to IS NULL OR c.created_at < p_date_to + INTERVAL '1 day')
      AND (p_package_id IS NULL OR c.package_id = p_package_id)
      AND (
        p_q IS NULL OR p_q = ''
        OR m.full_name ILIKE '%' || p_q || '%'
        OR m.phone ILIKE '%' || p_q || '%'
        OR m.membership_number ILIKE '%' || p_q || '%'
        OR c.period ILIKE '%' || p_q || '%'
        OR pay.mpesa_receipt ILIKE '%' || p_q || '%'
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
    ORDER BY created_at DESC
    LIMIT p_per_page OFFSET (p_page - 1) * p_per_page
  ) c;
$$;
