-- ============================================================================
-- LUMA WELFARE — PHASE 5: SYNTHETIC DATA GENERATION FOR LOAD TESTING
--
-- USAGE:
--   1. Run this against a STAGING/TEST database (NEVER production)
--   2. Set the target scale by changing @member_count below
--   3. Run: psql -f generate_load_test_data.sql
--   4. Or run individual sections in Supabase SQL Editor
--
-- WARNING: This generates大量 fake data. Do NOT run against production.
-- ============================================================================

-- ============================================================================
-- CONFIGURATION — Change this to set target scale
-- ============================================================================
DO $$
DECLARE
  v_member_count INT := 50000;  -- TARGET: Change to 12000, 50000, 100000, 250000, 500000
  v_batch_size INT := 5000;
  v_start_time TIMESTAMPTZ := clock_timestamp();
  v_count INT;
BEGIN
  RAISE NOTICE '=== LUMA WELFARE LOAD TEST DATA GENERATION ===';
  RAISE NOTICE 'Target members: %', v_member_count;
  RAISE NOTICE 'Started at: %', v_start_time;

  -- ============================================================================
  -- STEP 1: Generate auth.users records
  -- We need to create auth.users first since members reference them.
  -- For Supabase, we use the auth.users table directly.
  -- ============================================================================
  RAISE NOTICE 'Step 1: Generating auth.users records...';

  -- Create member records directly (skip auth.users for speed — use service role)
  -- In staging, we create member IDs as gen_random_uuid() and skip auth.users
  -- This simulates the data shape without needing actual auth setup

  -- ============================================================================
  -- STEP 2: Generate Members
  -- ============================================================================
  RAISE NOTICE 'Step 2: Generating % members...', v_member_count;

  -- Use a temporary table for batch generation
  CREATE TEMPORARY TABLE IF NOT EXISTS gen_members AS
  SELECT
    gen_random_uuid() as id,
    'LW-' || LPAD(s::text, 6, '0') as membership_number,
    (ARRAY['James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','William','Elizabeth','David','Barbara','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen','Christopher','Lisa','Daniel','Nancy','Matthew','Betty','Anthony','Margaret','Mark','Sandra','Donald','Ashley','Steven','Dorothy','Paul','Kimberly','Andrew','Emily','Joshua','Donna','Kenneth','Michelle','Kevin','Carol','Brian','Amanda','George','Melissa','Timothy','Deborah','Ronald','Stephanie','Edward','Rebecca','Jason','Sharon','Jeffrey','Laura','Ryan','Cynthia','Jacob','Kathleen','Gary','Amy','Nicholas','Angela','Eric','Shirley','Jonathan','Anna','Stephen','Brenda','Larry','Pamela','Justin','Emma','Scott','Nicole','Brandon','Helen','Benjamin','Samantha','Samuel','Katherine','Raymond','Christine','Gregory','Debra','Frank','Rachel','Alexander','Carolyn','Patrick','Janet','Jack','Catherine','Dennis','Maria','Jerry','Heather','Tyler','Diane']::text[]
    [1 + (s % 51)] ||
    ' ' ||
    (ARRAY['Mwangi','Ochieng','Kamau','Odhiambo','Wanjiku','Njoroge','Otieno','Wambui','Kipchoge','Akinyi','Kimani','Achieng','Njau','Onyango','Wairimu','Macharia','Ouma','Njeri','Karanja','Awino','Ndegwa','Owino','Nyambura','Maina','Atieno','Ouma','Muthoni','Wafula','Kibaki','Okeyo']::text[]
    [1 + (s % 30)] as full_name,
    '+2547' || LPAD((10000000 + (s * 7919) % 90000000)::text, 8, '0') as phone,
    'member' || s || '@test-luma.com' as email,
    (ARRAY['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret','Thika','Malindi','Kitale','Garissa','Kakamega','Machakos','Meru','Nyeri','Kilifi','Uasin Gishu']::text[])[1 + (s % 15)] as county,
    (ARRAY['active','active','active','active','active','active','active','active','pending_approval','suspended']::text[])[1 + (s % 10)] as status,
    NOW() - (random() * INTERVAL '365 days') as joined_at,
    NOW() - (random() * INTERVAL '365 days') as created_at
  FROM generate_series(1, v_member_count) AS s;

  -- Batch insert members
  INSERT INTO members (id, membership_number, full_name, phone, email, county, status, joined_at, created_at)
  SELECT id, membership_number, full_name, phone, email, county, status, joined_at, created_at
  FROM gen_members
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  Inserted % members', v_count;

  -- ============================================================================
  -- STEP 3: Generate Registration Fees (one per member)
  -- ============================================================================
  RAISE NOTICE 'Step 3: Generating registration fees...';

  INSERT INTO registration_fees (member_id, fee_type, amount, currency, status, paid_at, created_at)
  SELECT
    id,
    'registration',
    300,
    'KES',
    (ARRAY['paid','paid','paid','paid','pending','unpaid']::text[])[1 + (s % 6)],
    CASE WHEN random() > 0.2 THEN created_at + INTERVAL '1 day' ELSE NULL END,
    created_at
  FROM gen_members
  ON CONFLICT (member_id, fee_type) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  Inserted % registration fees', v_count;

  -- ============================================================================
  -- STEP 4: Generate Subscriptions (1-3 per member)
  -- ============================================================================
  RAISE NOTICE 'Step 4: Generating subscriptions...';

  -- Get package IDs
  CREATE TEMPORARY TABLE IF NOT EXISTS gen_packages AS
  SELECT id, code, sort_order FROM packages ORDER BY sort_order;

  -- Each member gets 1-3 subscriptions
  INSERT INTO subscriptions (id, member_id, package_id, status, started_at, next_due_date, created_at)
  SELECT
    gen_random_uuid(),
    m.id,
    p.id,
    (ARRAY['active','active','active','active','pending','paused','cancelled']::text[])[1 + (s % 7)]::subscription_status,
    (m.created_at + INTERVAL '1 day')::date,
    (m.created_at + INTERVAL '30 days')::date,
    m.created_at + INTERVAL '1 day'
  FROM gen_members m
  CROSS JOIN LATERAL (
    SELECT id FROM gen_packages
    WHERE sort_order <= (1 + (random() * 3)::int)
    ORDER BY random()
    LIMIT 1
  ) p
  WHERE m.status = 'active'
  AND random() > 0.3  -- 70% of active members have at least one subscription
  ON CONFLICT (member_id, package_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  Inserted % subscriptions', v_count;

  -- ============================================================================
  -- STEP 5: Generate Contributions (up to 12 months per subscription)
  -- ============================================================================
  RAISE NOTICE 'Step 5: Generating contributions...';

  -- For each active subscription, generate 1-12 months of contributions
  INSERT INTO contributions (subscription_id, member_id, package_id, period, amount, status, created_at)
  SELECT
    s.id,
    s.member_id,
    s.package_id,
    TO_CHAR(s.started_at + (n || ' months')::interval, 'YYYY-MM') as period,
    COALESCE(pt.amount, 100) as amount,
    (ARRAY['Paid','Paid','Paid','Paid','Paid','Verified','Verified','Pending','Late']::text[])[1 + (random() * 8)::int]::contribution_status,
    s.started_at + (n || ' months')::interval
  FROM gen_members m
  JOIN subscriptions s ON s.member_id = m.id AND s.status = 'active'
  JOIN gen_packages gp ON gp.id = s.package_id
  LEFT JOIN package_tiers pt ON pt.package_id = s.package_id
  CROSS JOIN generate_series(0, (random() * 11)::int) AS n
  WHERE m.status = 'active'
  ON CONFLICT (subscription_id, period) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  Inserted % contributions', v_count;

  -- ============================================================================
  -- STEP 6: Generate Claims (5-15% of members)
  -- ============================================================================
  RAISE NOTICE 'Step 6: Generating claims...';

  INSERT INTO claims (claim_number, member_id, subscription_id, package_id, claim_type, amount_requested, status, description, submitted_at, created_at)
  SELECT
    'CLM-' || LPAD(s::text, 6, '0'),
    m.id,
    sub.id,
    sub.package_id,
    (ARRAY['medical','burial','education','business','building']::text[])[1 + (s % 5)],
    (1000 + random() * 49000)::numeric(12,2),
    (ARRAY['Draft','Submitted','Under Review','Approved','Rejected','Paid']::text[])[1 + (s % 6)]::claim_status,
    'Synthetic claim for load testing',
    m.joined_at + INTERVAL '30 days',
    m.joined_at + INTERVAL '30 days'
  FROM gen_members m
  JOIN LATERAL (
    SELECT id, package_id FROM subscriptions
    WHERE member_id = m.id AND status = 'active'
    LIMIT 1
  ) sub ON true
  CROSS JOIN generate_series(1, (1 + (random() * 2)::int)) AS s
  WHERE m.status = 'active'
  AND random() < 0.10  -- 10% of active members file claims
  ON CONFLICT (claim_number) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  Inserted % claims', v_count;

  -- ============================================================================
  -- STEP 7: Generate Notifications (3-10 per member)
  -- ============================================================================
  RAISE NOTICE 'Step 7: Generating notifications...';

  INSERT INTO notifications (member_id, channel, subject, body, status, created_at)
  SELECT
    m.id,
    'in_app',
    (ARRAY['Contribution Verified','Claim Update','Welcome','Package Reminder','System Notice']::text[])[1 + (s % 5)],
    'This is a synthetic notification for load testing purposes.',
    (ARRAY['queued','sent','sent','sent']::text[])[1 + (s % 4)]::notification_status,
    m.created_at + (random() * INTERVAL '180 days')
  FROM gen_members m
  CROSS JOIN generate_series(1, (3 + (random() * 7)::int)) AS s
  WHERE m.status = 'active';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  Inserted % notifications', v_count;

  -- ============================================================================
  -- STEP 8: Generate Audit Logs (5-20 per member)
  -- ============================================================================
  RAISE NOTICE 'Step 8: Generating audit logs...';

  INSERT INTO audit_logs (actor_id, actor_role, action, resource, resource_id, created_at)
  SELECT
    m.id,
    'member',
    (ARRAY['created','updated_profile','requested_subscription','recorded_contribution','claim_created']::text[])[1 + (s % 5)],
    (ARRAY['member','subscription','contribution','claim']::text[])[1 + (s % 4)],
    m.id::text,
    m.created_at + (random() * INTERVAL '180 days')
  FROM gen_members m
  CROSS JOIN generate_series(1, (5 + (random() * 15)::int)) AS s;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  Inserted % audit logs', v_count;

  -- ============================================================================
  -- CLEANUP
  -- ============================================================================
  DROP TABLE IF EXISTS gen_members;
  DROP TABLE IF EXISTS gen_packages;

  RAISE NOTICE '=== GENERATION COMPLETE ===';
  RAISE NOTICE 'Total time: %', clock_timestamp() - v_start_time;

  -- Summary
  SELECT
    (SELECT COUNT(*) FROM members) as total_members,
    (SELECT COUNT(*) FROM subscriptions) as total_subscriptions,
    (SELECT COUNT(*) FROM contributions) as total_contributions,
    (SELECT COUNT(*) FROM claims) as total_claims,
    (SELECT COUNT(*) FROM notifications) as total_notifications,
    (SELECT COUNT(*) FROM audit_logs) as total_audit_logs,
    (SELECT COUNT(*) FROM registration_fees) as total_registration_fees;

END $$;
