-- ============================================================================
-- Registration fee: authoritative amount in platform_settings (KES 300).
-- Removes fixed amount equality check so configured amounts can be stored;
-- keeps structural monetary guards. Does not rewrite historical fee rows.
-- ============================================================================

INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'registration_fee',
  '{"amount": 300, "currency": "KES"}'::jsonb,
  'One-time membership activation fee. Edge Functions read this for new registration_fees rows; do not hardcode amounts in application logic.'
)
ON CONFLICT (key) DO NOTHING;

-- Structural amount validation (positive whole KES, reasonable upper bound)
ALTER TABLE public.registration_fees
  DROP CONSTRAINT IF EXISTS chk_registration_fee_amount;

ALTER TABLE public.registration_fees
  ADD CONSTRAINT chk_registration_fee_amount
  CHECK (
    amount > 0
    AND amount = trunc(amount)
    AND amount <= 1000000
  );

ALTER TABLE public.registration_fees
  DROP CONSTRAINT IF EXISTS chk_registration_fee_currency;

ALTER TABLE public.registration_fees
  ADD CONSTRAINT chk_registration_fee_currency
  CHECK (currency = 'KES');

-- Member self-insert: unpaid/pending only; amount must be positive KES (server sets value)
DROP POLICY IF EXISTS "registration_fees_insert_own" ON public.registration_fees;
CREATE POLICY "registration_fees_insert_own" ON public.registration_fees
  FOR INSERT WITH CHECK (
    member_id = auth.uid()
    AND status IN ('unpaid', 'pending')
    AND amount > 0
    AND amount = trunc(amount)
    AND currency = 'KES'
  );

-- Allow public read of the fee amount for display (non-secret configuration)
DROP POLICY IF EXISTS "platform_settings_public_read" ON public.platform_settings;
CREATE POLICY "platform_settings_public_read" ON public.platform_settings
  FOR SELECT
  USING (key IN ('org_contact', 'stats', 'registration_fee'));
