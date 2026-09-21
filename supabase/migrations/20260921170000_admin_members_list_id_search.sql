-- Admin members list: include masked-capable id_number field + search by ID suffix.
-- Safe / reversible: CREATE OR REPLACE only (prior definition restored via earlier migrations).

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
      m.id_number, m.status, m.joined_at, m.approved_at
    FROM members m
    WHERE
      (p_status IS NULL OR p_status = '' OR m.status::text = p_status)
      AND (
        p_q IS NULL OR p_q = ''
        OR m.full_name ILIKE '%' || p_q || '%'
        OR m.phone ILIKE '%' || p_q || '%'
        OR m.membership_number ILIKE '%' || p_q || '%'
        OR (m.email IS NOT NULL AND m.email ILIKE '%' || p_q || '%')
        OR (m.id_number IS NOT NULL AND (
          m.id_number ILIKE '%' || p_q || '%'
          OR right(regexp_replace(m.id_number, '\D', '', 'g'), 4) = right(regexp_replace(p_q, '\D', '', 'g'), 4)
        ))
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
        CASE
          WHEN full_name ILIKE p_q THEN 0
          WHEN membership_number ILIKE p_q THEN 1
          WHEN phone ILIKE p_q THEN 2
          WHEN email ILIKE p_q THEN 3
          WHEN id_number ILIKE '%' || p_q || '%' THEN 4
          ELSE 5
        END
      ELSE 0 END,
      joined_at DESC NULLS LAST
    LIMIT p_per_page OFFSET (p_page - 1) * p_per_page
  ) c;
$$;

COMMENT ON FUNCTION admin_search_members IS
  'Admin member search with pagination. Returns id_number for edge masking — never expose raw IDs to browsers without reveal audit.';
