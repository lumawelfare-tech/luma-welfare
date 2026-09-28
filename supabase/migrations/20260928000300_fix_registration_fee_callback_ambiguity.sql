-- ============================================================================
-- LUMA WELFARE — FIX 42702 IN process_registration_fee_callback
--
-- Rollback: restore the body from
--   supabase/migrations/20260928000200_restore_phase6_phase7_financial_objects.sql
--   (the `SELECT id, member_id, status` line), then push again.
--
-- WHY THIS FILE EXISTS
--   Step 2.4 of the Phase 6/7 restore verification found that
--   process_registration_fee_callback() aborts with
--       42702  column reference "member_id" is ambiguous
--   on every call, under both the postgres and service_role roles.
--
--   The function declares an OUT parameter named `member_id` in its RETURNS
--   TABLE clause, and the body then runs
--       SELECT id, member_id, status INTO v_fee FROM registration_fees ...
--   In plpgsql a bare `member_id` in that statement resolves to the OUT
--   parameter first; because it is also a real column of registration_fees
--   the reference is ambiguous and the statement errors before any row is
--   read. The defect is inherited verbatim from
--   20260827000000_phase6_financial_hardening.sql — it was simply never
--   reachable before now, because the function itself was never created.
--
-- THE FIX
--   Qualify the column as `registration_fees.member_id`. Nothing else
--   changes:
--     * the OUT parameter keeps the name `member_id`, because
--       payments-callback reads `result?.[0]?.member_id`;
--     * the signature is untouched, so the EXECUTE revocations from
--       20260928000200 keep applying and PostgREST keeps the same RPC key;
--     * the `v_fee.member_id` field accesses are already explicit.
--
-- SCOPE
--   One function body. No table, policy, grant, constraint, trigger or other
--   object is created, altered or dropped, and 20260928000200 is not
--   modified in any way.
-- ============================================================================

CREATE OR REPLACE FUNCTION process_registration_fee_callback(
  p_checkout_request_id text,
  p_mpesa_receipt text,
  p_result_code integer,
  p_result_desc text
)
RETURNS TABLE (
  success boolean,
  message text,
  member_id uuid
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_fee RECORD;
BEGIN
  -- Qualified on purpose: the OUT parameter `member_id` would otherwise make
  -- this a 42702 ambiguous column reference. See the header of this file.
  SELECT id, registration_fees.member_id, status
  INTO v_fee
  FROM registration_fees
  WHERE transaction_reference = p_checkout_request_id
    AND fee_type = 'registration'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Registration fee not found'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_fee.status = 'paid' THEN
    RETURN QUERY SELECT true, 'Already processed'::text, v_fee.member_id;
    RETURN;
  END IF;

  IF p_result_code = 0 THEN
    UPDATE registration_fees
    SET status = 'paid',
        mpesa_receipt = p_mpesa_receipt,
        paid_at = now()
    WHERE id = v_fee.id;

    RETURN QUERY SELECT true, 'Registration fee paid'::text, v_fee.member_id;
  ELSE
    UPDATE registration_fees
    SET status = 'failed'
    WHERE id = v_fee.id;

    RETURN QUERY SELECT false, 'Registration fee payment failed'::text, v_fee.member_id;
  END IF;
END;
$$;

-- Hard post-condition: abort the migration — so schema_migrations gains no
-- row — if the qualified reference did not land, if the OUT parameter was
-- renamed, if the signature drifted, or if the search_path / EXECUTE revokes
-- that 20260928000200 established were lost.
DO $$
DECLARE
  ok boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'process_registration_fee_callback'
      AND p.prosrc LIKE '%registration_fees.member_id%'
      AND 'member_id' = ANY (p.proargnames)
      AND pg_get_function_identity_arguments(p.oid)
          = 'p_checkout_request_id text, p_mpesa_receipt text, p_result_code integer, p_result_desc text'
      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=public']
      AND NOT has_function_privilege('anon', 'public.process_registration_fee_callback(text,text,integer,text)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.process_registration_fee_callback(text,text,integer,text)', 'EXECUTE')
      AND has_function_privilege('service_role', 'public.process_registration_fee_callback(text,text,integer,text)', 'EXECUTE')
  ) INTO ok;

  IF NOT ok THEN
    RAISE EXCEPTION 'fix phase6 callback: process_registration_fee_callback post-condition failed (qualified member_id / OUT name / signature / search_path / EXECUTE grants)';
  END IF;

  RAISE NOTICE 'fix phase6 callback: process_registration_fee_callback requalified, signature, search_path and EXECUTE revokes intact';
END $$;

-- Make PostgREST pick the corrected RPC up without waiting on its cache.
NOTIFY pgrst, 'reload schema';
