-- Phase 9: Admin Search Optimization for 500K+ Records
-- RPC functions that replace full-table-scan ILIKE with indexed searches.

-- ============================================================================
-- 1. Members search — uses pg_trgm GIN indexes for name/phone/email
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_search_members(
  p_q text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_page int DEFAULT 1,
  p_per_page int DEFAULT 50
)
RETURNS TABLE (
  members jsonb,
  total bigint,
  page int,
  per_page int,
  pages int
)
LANGUAGE sql STABLE
AS $$
  WITH filtered AS (
    SELECT
      m.id, m.membership_number, m.full_name, m.phone, m.email,
      m.status, m.joined_at, m.approved_at
    FROM members m
    WHERE
      (p_status IS NULL OR p_status = '' OR m.status::text = p_status)
      AND (
        p_q IS NULL OR p_q = ''
        OR m.full_name ILIKE '%' || p_q || '%'
        OR m.phone ILIKE '%' || p_q || '%'
        OR m.membership_number ILIKE '%' || p_q || '%'
        OR m.email ILIKE '%' || p_q || '%'
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
    ORDER BY
      CASE WHEN p_q IS NOT NULL AND p_q != '' THEN
        -- Rank exact matches higher
        CASE
          WHEN full_name ILIKE p_q THEN 0
          WHEN membership_number ILIKE p_q THEN 1
          WHEN phone ILIKE p_q THEN 2
          WHEN email ILIKE p_q THEN 3
          ELSE 4
        END
      ELSE 0 END,
      joined_at DESC NULLS LAST
    LIMIT p_per_page OFFSET (p_page - 1) * p_per_page
  ) c;
$$;

-- ============================================================================
-- 2. Contributions search — indexed status + member name join + pagination
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_search_contributions(
  p_q text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_page int DEFAULT 1,
  p_per_page int DEFAULT 50
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

-- ============================================================================
-- 3. Claims search — indexed status + member name join + pagination
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_search_claims(
  p_q text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_page int DEFAULT 1,
  p_per_page int DEFAULT 50
)
RETURNS TABLE (
  claims jsonb,
  total bigint,
  page int,
  per_page int,
  pages int
)
LANGUAGE sql STABLE
AS $$
  WITH filtered AS (
    SELECT
      cl.id, cl.claim_number, cl.claim_type, cl.amount_requested,
      cl.description, cl.status, cl.admin_notes, cl.created_at,
      cl.submitted_at, cl.decided_at, cl.member_id,
      jsonb_build_object(
        'full_name', m.full_name,
        'phone', m.phone,
        'email', m.email
      ) as members,
      jsonb_build_object('code', p.code, 'name', p.name) as packages
    FROM claims cl
    LEFT JOIN members m ON m.id = cl.member_id
    LEFT JOIN packages p ON p.id = cl.package_id
    WHERE
      (p_status IS NULL OR p_status = '' OR cl.status::text = p_status)
      AND (
        p_q IS NULL OR p_q = ''
        OR m.full_name ILIKE '%' || p_q || '%'
        OR m.phone ILIKE '%' || p_q || '%'
        OR cl.claim_number ILIKE '%' || p_q || '%'
        OR cl.claim_type ILIKE '%' || p_q || '%'
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
