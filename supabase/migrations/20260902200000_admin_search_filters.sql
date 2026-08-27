-- =============================================================================
-- ADMIN SEARCH FILTERS — Add date range and package filters to search RPCs
-- =============================================================================

-- 1. Update admin_search_contributions with date_from, date_to, package_id
CREATE OR REPLACE FUNCTION admin_search_contributions(
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
LANGUAGE sql STABLE
AS $$
  WITH filtered AS (
    SELECT
      c.id, c.period, c.amount, c.status, c.notes, c.created_at, c.member_id,
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

-- 2. Get all packages for filter dropdown
CREATE OR REPLACE FUNCTION get_active_packages()
RETURNS TABLE (
  id uuid,
  name text,
  code text
)
LANGUAGE sql STABLE
AS $$
  SELECT p.id, p.name, p.code
  FROM packages p
  WHERE p.is_active = true
  ORDER BY p.name;
$$;

COMMENT ON FUNCTION admin_search_contributions IS 'Search contributions with status, date range, package, and text filters';
COMMENT ON FUNCTION get_active_packages IS 'Returns active packages for filter dropdowns';
