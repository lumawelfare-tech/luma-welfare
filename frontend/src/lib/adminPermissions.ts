/**
 * Admin UI permission helpers.
 * Server Edge Functions remain authoritative — this only scopes nav/routes.
 */

export type AdminPermission = `${string}:${string}`

/** Route path (under /admin) → required permission key, or 'superadmin'. */
export const ADMIN_ROUTE_PERMISSIONS: Record<string, AdminPermission | 'superadmin'> = {
  dashboard: 'members:read',
  members: 'members:read',
  applications: 'members:read',
  'registration-fees': 'members:read',
  subscriptions: 'members:read',
  contributions: 'contributions:read',
  claims: 'claims:read',
  complaints: 'complaints:read',
  community: 'community:read',
  documents: 'documents:read',
  packages: 'packages:read',
  news: 'packages:read',
  gallery: 'packages:read',
  media: 'packages:read',
  reports: 'members:read',
  'scheduled-reports': 'members:read',
  settings: 'settings:read',
  'audit-logs': 'audit_logs:read',
  reconciliation: 'payments:read',
  health: 'members:read',
  'staff-roles': 'superadmin',
}

export function hasAdminPermission(
  permissions: readonly string[],
  isSuperadmin: boolean,
  required: AdminPermission | 'superadmin' | undefined,
): boolean {
  if (!required) return true
  if (isSuperadmin) return true
  if (required === 'superadmin') return false
  return permissions.includes(required)
}

/** Resolve required permission for an /admin/... pathname. */
export function permissionForAdminPath(pathname: string): AdminPermission | 'superadmin' | undefined {
  const segment = pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean)[0] ?? 'dashboard'
  return ADMIN_ROUTE_PERMISSIONS[segment]
}
