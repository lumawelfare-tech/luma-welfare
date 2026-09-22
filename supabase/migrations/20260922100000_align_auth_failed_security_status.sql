-- Align get_security_status() with admin-monitoring's auth_failed action.
-- Failed logins are written by auth-login as action = 'auth_failed'.

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
