-- Align get_security_status() with admin-monitoring's auth_failed action.
-- Failed logins are written by auth-login as action = 'auth_failed'.
-- Also recreate check_orphan_payments_v2() if missing (present in phase13
-- migration history but absent on some environments after later lockdowns).

CREATE OR REPLACE FUNCTION check_orphan_payments_v2()
RETURNS TABLE (
  payment_id uuid,
  member_id uuid,
  amount numeric,
  status text,
  created_at timestamptz,
  age_minutes numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.member_id,
    p.amount,
    p.status::text,
    p.created_at,
    EXTRACT(EPOCH FROM (now() - p.created_at)) / 60 as age_minutes
  FROM payments p
  WHERE p.status = 'Completed'
    AND NOT EXISTS (
      SELECT 1 FROM contributions c WHERE c.payment_id = p.id
    )
  ORDER BY p.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION get_security_status()
RETURNS TABLE (
  failed_logins_24h bigint,
  high_risk_admin_actions_7d bigint,
  stale_pending_payments bigint,
  orphan_payments bigint,
  audit_logs_today bigint,
  total_members bigint,
  active_admins bigint
) LANGUAGE sql STABLE AS $$
  SELECT
    (SELECT COUNT(*) FROM audit_logs
     WHERE (action = 'auth_failed' OR action LIKE '%login%failed%')
       AND created_at > now() - INTERVAL '24 hours'),
    (SELECT COUNT(*) FROM audit_logs
     WHERE action IN ('role_changed', 'permission_granted', 'permission_revoked', 'admin_created', 'admin_deleted')
       AND created_at > now() - INTERVAL '7 days'),
    (SELECT COUNT(*) FROM payments
     WHERE status = 'Pending'
       AND created_at < now() - INTERVAL '30 minutes'),
    (SELECT COUNT(*) FROM check_orphan_payments_v2()),
    (SELECT COUNT(*) FROM audit_logs
     WHERE created_at > date_trunc('day', now())),
    (SELECT COUNT(*) FROM members),
    (SELECT COUNT(*) FROM admins WHERE is_active = true);
$$;
