-- ============================================================================
-- PHASE 17: ENHANCED SYNTHETIC DATA GENERATOR
-- ============================================================================
-- Generates realistic synthetic data for load testing at 100K-1M scale.
-- NEVER copies production data. All values are clearly synthetic.

-- Main generation function
CREATE OR REPLACE FUNCTION generate_phase17_test_data(p_member_count INT DEFAULT 10000)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_member_id UUID;
  v_package_id UUID;
  v_tier_id UUID;
  v_sub_id UUID;
  v_payment_ref TEXT;
  v_phone TEXT;
  v_email TEXT;
  v_full_name TEXT;
  v_names TEXT[] := ARRAY['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel', 'Lisa', 'Matthew', 'Nancy', 'Anthony', 'Betty', 'Mark', 'Margaret', 'Donald', 'Sandra', 'Steven', 'Ashley', 'Paul', 'Dorothy', 'Andrew', 'Kimberly', 'Joshua', 'Emily', 'Kenneth', 'Donna', 'Kevin', 'Michelle', 'Brian', 'Carol', 'George', 'Amanda', 'Timothy', 'Melissa', 'Ronald', 'Deborah'];
  v_surnames TEXT[] := ARRAY['Mwangi', 'Kamau', 'Ochieng', 'Wanjiku', 'Kipchoge', 'Otieno', 'Njoroge', 'Wambui', 'Odhiambo', 'Njeri', 'Kimani', 'Akinyi', 'Macharia', 'Nyambura', 'Omondi', 'Wairimu', 'Kariuki', 'Achieng', 'Gichuru', 'Onyango', 'Mutua', 'Adhiambo', 'Karanja', 'Jepkoech', 'Njuguna', 'Awuor', 'Kibaki', 'Mumbi', 'Ouma', 'Atieno', 'Ndungu', 'Ogada', 'Muthoni', 'Wekesa', 'Njenga', 'Auma', 'Gitonga', 'Nyokabi', 'Owuor', 'Waceke'];
  v_counties TEXT[] := ARRAY['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Kiambu', 'Uasin Gishu', 'Machakos', 'Meru', 'Kilifi', 'Kajiado', 'Nyeri', 'Muranga', 'Kakamega', 'Bungoma', 'Siaya', 'Homa Bay', 'Migori', 'Kitui', 'Makueni', 'Embu'];
  v_joined timestamptz;
  v_period TEXT;
  v_month INT;
  v_year INT;
  v_contribution_count INT;
  v_start_time timestamptz;
  v_batch_size INT := 1000;
BEGIN
  v_start_time := clock_timestamp();
  RAISE NOTICE 'Generating % synthetic members...', p_member_count;

  -- Get package IDs
  SELECT id INTO v_package_id FROM packages WHERE code = 'welfare' LIMIT 1;
  IF v_package_id IS NULL THEN
    SELECT id INTO v_package_id FROM packages WHERE is_active = true LIMIT 1;
  END IF;

  SELECT id INTO v_tier_id FROM package_tiers WHERE package_id = v_package_id LIMIT 1;

  FOR i IN 1..p_member_count LOOP
    -- Generate realistic member data
    v_full_name := v_names[1 + (random() * (array_length(v_names, 1) - 1))::int]
      || ' ' || v_surnames[1 + (random() * (array_length(v_surnames, 1) - 1))::int];
    v_phone := '07' || lpad((random() * 99999999)::int::text, 8, '0');
    v_email := 'loadtest-' || i || '@example.test';
    v_member_id := gen_random_uuid();

    -- Random join date (last 2 years)
    v_joined := NOW() - (random() * 730 || ' days')::interval;

    -- Create member
    INSERT INTO members (id, full_name, phone, email, status, membership_number, joined_at, county)
    VALUES (
      v_member_id,
      v_full_name,
      v_phone,
      v_email,
      CASE WHEN random() > 0.05 THEN 'active'::member_status ELSE 'pending_approval'::member_status END,
      'LW-TEST-' || lpad(i::text, 7, '0'),
      v_joined,
      v_counties[1 + (random() * (array_length(v_counties, 1) - 1))::int]
    );

    -- 70% chance of subscription
    IF random() < 0.7 THEN
      v_sub_id := gen_random_uuid();
      INSERT INTO subscriptions (id, member_id, package_id, package_tier_id, status, started_at)
      VALUES (
        v_sub_id,
        v_member_id,
        v_package_id,
        v_tier_id,
        CASE WHEN random() > 0.1 THEN 'active'::subscription_status ELSE 'pending'::subscription_status END,
        v_joined::date
      );

      -- Generate contributions (1-18 months)
      v_contribution_count := 1 + (random() * 17)::int;
      FOR m IN 0..v_contribution_count - 1 LOOP
        v_year := EXTRACT(YEAR FROM v_joined)::int + ((EXTRACT(MONTH FROM v_joined)::int + m - 1) / 12)::int;
        v_month := ((EXTRACT(MONTH FROM v_joined)::int + m - 1) % 12) + 1;
        v_period := v_year || '-' || lpad(v_month::text, 2, '0');

        INSERT INTO contributions (subscription_id, member_id, package_id, period, amount, status)
        VALUES (
          v_sub_id,
          v_member_id,
          v_package_id,
          v_period,
          CASE WHEN v_tier_id IS NOT NULL THEN 100 + (random() * 400)::int ELSE 100 END,
          CASE
            WHEN random() < 0.85 THEN 'Paid'::contribution_status
            WHEN random() < 0.5 THEN 'Pending'::contribution_status
            ELSE 'Verified'::contribution_status
          END
        );
      END LOOP;

      -- 30% chance of a claim
      IF random() < 0.3 THEN
        INSERT INTO claims (claim_number, member_id, subscription_id, package_id, claim_type, status, amount_requested)
        VALUES (
          'CLM-TEST-' || lpad(i::text, 7, '0'),
          v_member_id,
          v_sub_id,
          v_package_id,
          CASE (random() * 3)::int
            WHEN 0 THEN 'Burial Support'
            WHEN 1 THEN 'Hospital Insurance'
            WHEN 2 THEN 'Education Support'
            ELSE 'Business Support'
          END,
          CASE
            WHEN random() < 0.3 THEN 'Submitted'::claim_status
            WHEN random() < 0.5 THEN 'Under Review'::claim_status
            WHEN random() < 0.7 THEN 'Approved'::claim_status
            WHEN random() < 0.9 THEN 'Rejected'::claim_status
            ELSE 'Paid'::claim_status
          END,
          (1000 + random() * 49000)::numeric(12,2)
        );
      END IF;
    END IF;

    -- Progress indicator
    IF i % 1000 = 0 THEN
      RAISE NOTICE '  Generated % / % members (%.1f seconds)', i, p_member_count,
        extract(epoch from clock_timestamp() - v_start_time);
    END IF;
  END LOOP;

  RAISE NOTICE '✅ Generated % members in %.1f seconds', p_member_count,
    extract(epoch from clock_timestamp() - v_start_time);
END;
$$;

-- Cleanup function
CREATE OR REPLACE FUNCTION cleanup_phase17_test_data()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE NOTICE 'Cleaning up synthetic test data...';

  -- Delete in reverse dependency order
  DELETE FROM claims WHERE claim_number LIKE 'CLM-TEST-%';
  DELETE FROM contributions WHERE member_id IN (
    SELECT id FROM members WHERE membership_number LIKE 'LW-TEST-%'
  );
  DELETE FROM subscriptions WHERE member_id IN (
    SELECT id FROM members WHERE membership_number LIKE 'LW-TEST-%'
  );
  DELETE FROM notifications WHERE member_id IN (
    SELECT id FROM members WHERE membership_number LIKE 'LW-TEST-%'
  );
  DELETE FROM members WHERE membership_number LIKE 'LW-TEST-%';

  RAISE NOTICE '✅ Cleanup complete';
END;
$$;
