-- Grant audit log read to the standard admin role (superadmin already has full audit_logs).
-- Fixes admin dashboard "Could not load audit logs" when session is role=admin without is_superadmin.

INSERT INTO permissions (role_id, resource, action)
SELECT r.id, 'audit_logs', 'read'
FROM roles r
WHERE r.name = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM permissions p
    WHERE p.role_id = r.id
      AND p.resource = 'audit_logs'
      AND p.action = 'read'
  );
