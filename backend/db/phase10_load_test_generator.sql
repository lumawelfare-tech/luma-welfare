-- ============================================================================
-- LUMA WELFARE — PHASE 10: ENHANCED SYNTHETIC DATA GENERATOR
-- Realistic distributions for 500K-scale capacity testing.
--
-- USAGE:
--   1. Run against STAGING ONLY — never production
--   2. Adjust v_member_count below for target scale
--   3. Run cleanup first to start fresh: SELECT cleanup_load_test_data();
-- ============================================================================

-- Cleanup function — removes all synthetic data
CREATE OR REPLACE FUNCTION cleanup_load_test_data()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE NOTICE 'Cleaning up synthetic load test data...';
  DELETE FROM audit_logs WHERE resource_id::uuid IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  DELETE FROM notifications WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  DELETE FROM claim_documents WHERE claim_id IN (SELECT id FROM claims WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com'));
  DELETE FROM claims WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  DELETE FROM qualifications WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  DELETE FROM contributions WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  DELETE FROM payments WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  DELETE FROM registration_fees WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  DELETE FROM family_members WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  DELETE FROM subscriptions WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  DELETE FROM members WHERE email LIKE '%@test-luma.com';
  RAISE NOTICE 'Cleanup complete.';
END;
$$;

-- Main generation function
CREATE OR REPLACE FUNCTION generate_load_test_data(p_member_count int DEFAULT 50000)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_time timestamptz := clock_timestamp();
  v_count bigint;
  v_result jsonb;
  v_batch_size int := 10000;
  v_members_per_batch int;
  v_total_members int := 0;
  v_total_subscriptions int := 0;
  v_total_contributions int := 0;
  v_total_claims int := 0;
  v_total_notifications int := 0;
  v_total_audit_logs int := 0;
  v_total_reg_fees int := 0;
BEGIN
  RAISE NOTICE '=== LUMA WELFARE LOAD TEST DATA GENERATION ===';
  RAISE NOTICE 'Target: % members', p_member_count;
  RAISE NOTICE 'Started: %', v_start_time;

  -- Ensure pgcrypto
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  -- ========================================================================
  -- STEP 1: Generate Members in batches
  -- ========================================================================
  RAISE NOTICE 'Step 1: Generating % members...', p_member_count;

  FOR batch_offset IN 0 BY v_batch_size WHILE batch_offset < p_member_count LOOP
    v_members_per_batch := least(v_batch_size, p_member_count - batch_offset);

    INSERT INTO members (id, membership_number, full_name, phone, email, county, status, joined_at, created_at)
    SELECT
      gen_random_uuid(),
      'LT-' || LPAD((batch_offset + s)::text, 7, '0'),
      -- Realistic Kenyan names with power-law distribution (common names more frequent)
      (ARRAY['James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','William','Elizabeth','David','Barbara','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen','Daniel','Nancy','Matthew','Betty','Mark','Sandra','Steven','Dorothy','Andrew','Emily','Paul','Donna','Kevin','Michelle','Brian','Amanda','George','Melissa','Timothy','Deborah','Ronald','Stephanie','Edward','Rebecca','Jason','Laura','Ryan','Cynthia','Jacob','Kathleen','Gary','Amy','Nicholas','Angela','Eric','Shirley','Jonathan','Anna','Stephen','Brenda','Larry','Pamela','Justin','Emma','Scott','Nicole','Brandon','Helen','Benjamin','Samantha','Samuel','Katherine','Raymond','Christine','Gregory','Debra','Frank','Rachel','Alexander','Carolyn','Patrick','Janet','Jack','Catherine','Dennis','Maria','Jerry','Heather','Tyler','Diane','Aaron','Olivia','Jose','Isabella','Henry','Mia','Douglas','Charlotte','Peter','Amelia']::text[])
      [1 + ((batch_offset + s) % 89)]
      || ' '
      || (ARRAY['Mwangi','Ochieng','Kamau','Odhiambo','Wanjiku','Njoroge','Otieno','Wambui','Kimani','Achieng','Njau','Onyango','Wairimu','Macharia','Ouma','Njeri','Karanja','Awino','Ndegwa','Owino','Nyambura','Maina','Atieno','Muthoni','Wafula','Kibaki','Okeyo','Simiyu','Barasa','Wekesa']::text[])
      [1 + ((batch_offset + s) % 30)] as full_name,
      -- Kenyan phone numbers with realistic distribution
      CASE
        WHEN (batch_offset + s) % 10 < 7 THEN '+2547' || LPAD(((10000000 + ((batch_offset + s) * 7919) % 90000000))::text, 8, '0')
        ELSE '+2541' || LPAD(((10000000 + ((batch_offset + s) * 6271) % 90000000))::text, 8, '0')
      END as phone,
      'loadtest-' || LPAD((batch_offset + s)::text, 7, '0') || '@test-luma.com' as email,
      -- Kenyan counties with realistic distribution (Nairobi dominant)
      CASE
        WHEN (batch_offset + s) % 100 < 25 THEN 'Nairobi'
        WHEN (batch_offset + s) % 100 < 35 THEN 'Mombasa'
        WHEN (batch_offset + s) % 100 < 43 THEN 'Kisumu'
        WHEN (batch_offset + s) % 100 < 50 THEN 'Nakuru'
        WHEN (batch_offset + s) % 100 < 56 THEN 'Eldoret'
        WHEN (batch_offset + s) % 100 < 61 THEN 'Thika'
        WHEN (batch_offset + s) % 100 < 65 THEN 'Malindi'
        WHEN (batch_offset + s) % 100 < 69 THEN 'Kitale'
        WHEN (batch_offset + s) % 100 < 72 THEN 'Garissa'
        WHEN (batch_offset + s) % 100 < 75 THEN 'Kakamega'
        WHEN (batch_offset + s) % 100 < 78 THEN 'Machakos'
        WHEN (batch_offset + s) % 100 < 81 THEN 'Meru'
        WHEN (batch_offset + s) % 100 < 84 THEN 'Nyeri'
        WHEN (batch_offset + s) % 100 < 87 THEN 'Kilifi'
        ELSE 'Uasin Gishu'
      END as county,
      -- Status distribution: 85% active, 8% pending, 5% suspended, 2% closed
      CASE
        WHEN (batch_offset + s) % 100 < 85 THEN 'active'::member_status
        WHEN (batch_offset + s) % 100 < 93 THEN 'pending_approval'::member_status
        WHEN (batch_offset + s) % 100 < 98 THEN 'suspended'::member_status
        ELSE 'closed'::member_status
      END as status,
      NOW() - ((random() * 365 * 2)::int * INTERVAL '1 day') as joined_at,
      NOW() - ((random() * 365 * 2)::int * INTERVAL '1 day') as created_at
    FROM generate_series(1, v_members_per_batch) AS s
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_members := v_total_members + v_count;
  END LOOP;

  RAISE NOTICE '  Generated % members', v_total_members;

  -- ========================================================================
  -- STEP 2: Registration Fees (one per member, 90% paid)
  -- ========================================================================
  RAISE NOTICE 'Step 2: Generating registration fees...';

  INSERT INTO registration_fees (member_id, fee_type, amount, currency, status, paid_at, created_at)
  SELECT
    id,
    'registration',
    300,
    'KES',
    CASE WHEN random() < 0.90 THEN 'paid' ELSE 'unpaid' END,
    CASE WHEN random() < 0.90 THEN created_at + (random() * INTERVAL '7 days') ELSE NULL END,
    created_at
  FROM members
  WHERE email LIKE '%@test-luma.com'
  ON CONFLICT (member_id, fee_type) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total_reg_fees := v_count;
  RAISE NOTICE '  Generated % registration fees', v_total_reg_fees;

  -- ========================================================================
  -- STEP 3: Subscriptions (power-law: some members have many, most have 1-2)
  -- ========================================================================
  RAISE NOTICE 'Step 3: Generating subscriptions...';

  INSERT INTO subscriptions (id, member_id, package_id, status, started_at, next_due_date, created_at)
  SELECT
    gen_random_uuid(),
    m.id,
    p.id,
    CASE
      WHEN random() < 0.70 THEN 'active'::subscription_status
      WHEN random() < 0.85 THEN 'pending'::subscription_status
      WHEN random() < 0.95 THEN 'paused'::subscription_status
      ELSE 'cancelled'::subscription_status
    END,
    (m.joined_at + (random() * INTERVAL '30 days'))::date,
    (m.joined_at + (random() * INTERVAL '60 days'))::date,
    m.joined_at + (random() * INTERVAL '30 days')
  FROM members m
  CROSS JOIN LATERAL (
    SELECT id FROM packages ORDER BY random() LIMIT 1
  ) p
  WHERE m.email LIKE '%@test-luma.com'
  AND m.status = 'active'
  AND random() < 0.75  -- 75% of active members have at least one subscription
  ON CONFLICT (member_id, package_id) DO NOTHING;

  -- Add second package for 25% of subscribers
  INSERT INTO subscriptions (id, member_id, package_id, status, started_at, next_due_date, created_at)
  SELECT
    gen_random_uuid(),
    s.member_id,
    p.id,
    'active'::subscription_status,
    s.started_at,
    s.next_due_date,
    s.created_at
  FROM subscriptions s
  CROSS JOIN LATERAL (
    SELECT id FROM packages WHERE id != s.package_id ORDER BY random() LIMIT 1
  ) p
  WHERE s.member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com')
  AND random() < 0.25
  ON CONFLICT (member_id, package_id) DO NOTHING;

  SELECT COUNT(*) INTO v_count FROM subscriptions WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  v_total_subscriptions := v_count;
  RAISE NOTICE '  Generated % subscriptions', v_total_subscriptions;

  -- ========================================================================
  -- STEP 4: Contributions (realistic monthly pattern per active subscription)
  -- ========================================================================
  RAISE NOTICE 'Step 4: Generating contributions...';

  INSERT INTO contributions (subscription_id, member_id, package_id, period, amount, status, created_at)
  SELECT
    s.id,
    s.member_id,
    s.package_id,
    TO_CHAR(s.started_at + (n * INTERVAL '1 month'), 'YYYY-MM') as period,
    COALESCE(pt.amount, 150) as amount,
    CASE
      WHEN random() < 0.60 THEN 'Paid'::contribution_status
      WHEN random() < 0.80 THEN 'Verified'::contribution_status
      WHEN random() < 0.90 THEN 'Pending'::contribution_status
      ELSE 'Late'::contribution_status
    END,
    s.started_at + (n * INTERVAL '1 month')
  FROM subscriptions s
  JOIN members m ON m.id = s.member_id
  LEFT JOIN package_tiers pt ON pt.package_id = s.package_id AND pt.sort_order = 0
  CROSS JOIN generate_series(0, (random() * 11)::int) AS n
  WHERE m.email LIKE '%@test-luma.com'
  AND s.status IN ('active', 'paused')
  ON CONFLICT (subscription_id, period) DO NOTHING;

  SELECT COUNT(*) INTO v_count FROM contributions WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  v_total_contributions := v_count;
  RAISE NOTICE '  Generated % contributions', v_total_contributions;

  -- ========================================================================
  -- STEP 5: Claims (10-15% of active subscribers, realistic status distribution)
  -- ========================================================================
  RAISE NOTICE 'Step 5: Generating claims...';

  INSERT INTO claims (claim_number, member_id, subscription_id, package_id, claim_type, amount_requested, status, description, submitted_at, created_at)
  SELECT
    'LT-CLM-' || LPAD(s::text, 7, '0'),
    sub.member_id,
    sub.id,
    sub.package_id,
    (ARRAY['Burial Support','Hospital Insurance','Education Support','Business Support','Building Support','Farming Support','Wedding Support','Disaster Relief','Youth Empowerment','Other']::text[])[1 + (s % 10)],
    (1000 + random() * 199000)::numeric(12,2),
    CASE
      WHEN random() < 0.15 THEN 'Draft'::claim_status
      WHEN random() < 0.30 THEN 'Submitted'::claim_status
      WHEN random() < 0.45 THEN 'Under Review'::claim_status
      WHEN random() < 0.60 THEN 'Additional Information Required'::claim_status
      WHEN random() < 0.80 THEN 'Approved'::claim_status
      WHEN random() < 0.90 THEN 'Rejected'::claim_status
      ELSE 'Paid'::claim_status
    END,
    'Synthetic claim for load testing — scenario ' || (s % 20),
    sub.created_at + (random() * INTERVAL '90 days'),
    sub.created_at + (random() * INTERVAL '90 days')
  FROM (
    SELECT sub_inner.*, m_inner.email
    FROM subscriptions sub_inner
    JOIN members m_inner ON m_inner.id = sub_inner.member_id
    WHERE m_inner.email LIKE '%@test-luma.com'
    AND sub_inner.status = 'active'
  ) sub
  CROSS JOIN generate_series(1, (1 + (random() * 2)::int)) AS s
  WHERE random() < 0.12  -- 12% of active subscribers file claims
  ON CONFLICT (claim_number) DO NOTHING;

  SELECT COUNT(*) INTO v_count FROM claims WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  v_total_claims := v_count;
  RAISE NOTICE '  Generated % claims', v_total_claims;

  -- ========================================================================
  -- STEP 6: Notifications (5-15 per active member, realistic read ratio)
  -- ========================================================================
  RAISE NOTICE 'Step 6: Generating notifications...';

  INSERT INTO notifications (member_id, channel, subject, body, status, created_at)
  SELECT
    m.id,
    'in_app',
    (ARRAY['Contribution Verified','Claim Update','Welcome to Luma Welfare','Monthly Reminder','Package Subscription Confirmed','Payment Received','Claim Approved','Claim Rejected','System Maintenance Notice','Profile Updated']::text[])[1 + (s % 10)],
    'This is a synthetic notification for load testing. Member: ' || m.membership_number,
    CASE
      WHEN random() < 0.20 THEN 'queued'::notification_status
      ELSE 'sent'::notification_status
    END,
    m.created_at + (random() * INTERVAL '365 days')
  FROM members m
  CROSS JOIN generate_series(1, (5 + (random() * 10)::int)) AS s
  WHERE m.email LIKE '%@test-luma.com'
  AND m.status = 'active';

  SELECT COUNT(*) INTO v_count FROM notifications WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-luma.com');
  v_total_notifications := v_count;
  RAISE NOTICE '  Generated % notifications', v_total_notifications;

  -- ========================================================================
  -- STEP 7: Audit Logs (10-30 per member)
  -- ========================================================================
  RAISE NOTICE 'Step 7: Generating audit logs...';

  INSERT INTO audit_logs (actor_id, actor_role, action, resource, resource_id, created_at)
  SELECT
    m.id,
    'member',
    (ARRAY['member_created','profile_updated','subscription_created','contribution_recorded','claim_created','claim_submitted','notification_read','password_changed']::text[])[1 + (s % 8)],
    (ARRAY['member','subscription','contribution','claim','notification']::text[])[1 + (s % 5)],
    m.id::text,
    m.created_at + (random() * INTERVAL '365 days')
  FROM members m
  CROSS JOIN generate_series(1, (10 + (random() * 20)::int)) AS s
  WHERE m.email LIKE '%@test-luma.com';

  SELECT COUNT(*) INTO v_count FROM audit_logs WHERE resource_id::text IN (SELECT id::text FROM members WHERE email LIKE '%@test-luma.com');
  v_total_audit_logs := v_count;
  RAISE NOTICE '  Generated % audit logs', v_total_audit_logs;

  -- ========================================================================
  -- SUMMARY
  -- ========================================================================
  v_result := jsonb_build_object(
    'members', v_total_members,
    'subscriptions', v_total_subscriptions,
    'contributions', v_total_contributions,
    'claims', v_total_claims,
    'notifications', v_total_notifications,
    'audit_logs', v_total_audit_logs,
    'registration_fees', v_total_reg_fees,
    'duration_ms', EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000
  );

  RAISE NOTICE '=== GENERATION COMPLETE ===';
  RAISE NOTICE 'Duration: %ms', EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  RAISE NOTICE 'Result: %', v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- QUICK COMMANDS:
--   SELECT generate_load_test_data(12000);   -- Baseline
--   SELECT generate_load_test_data(50000);   -- Early growth
--   SELECT generate_load_test_data(100000);  -- Major milestone
--   SELECT generate_load_test_data(250000);  -- Large scale
--   SELECT generate_load_test_data(500000);  -- Target
--   SELECT cleanup_load_test_data();          -- Remove all synthetic data
-- ============================================================================
