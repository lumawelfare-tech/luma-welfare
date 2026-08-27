-- Member contributions with server-side pagination
-- Replaces client-side slicing for 500K+ record performance

CREATE OR REPLACE FUNCTION member_search_contributions(
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
  -- Validate pagination params
  IF p_page < 1 THEN p_page := 1; END IF;
  IF p_per_page < 1 THEN p_per_page := 20; END IF;
  IF p_per_page > 100 THEN p_per_page := 100; END IF;
  v_offset := (p_page - 1) * p_per_page;

  -- Count total matching rows
  SELECT count(*) INTO v_total
  FROM contributions c
  WHERE c.member_id = p_member_id
    AND (p_subscription_id IS NULL OR c.subscription_id = p_subscription_id)
    AND (p_status IS NULL OR c.status = p_status);

  -- Calculate total pages
  v_pages := GREATEST(1, CEIL(v_total::NUMERIC / p_per_page));

  -- Fetch page of contributions with package info
  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb)
  INTO v_contributions
  FROM (
    SELECT
      c.id,
      c.subscription_id,
      c.period,
      c.amount,
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

  -- Build response
  RETURN jsonb_build_object(
    'contributions', v_contributions,
    'total', v_total,
    'page', p_page,
    'per_page', p_per_page,
    'pages', v_pages
  );
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION member_search_contributions TO authenticated;

-- Add index for efficient member + period queries if not already present
CREATE INDEX IF NOT EXISTS idx_contributions_member_period
  ON contributions (member_id, period DESC)
  WHERE member_id IS NOT NULL;
