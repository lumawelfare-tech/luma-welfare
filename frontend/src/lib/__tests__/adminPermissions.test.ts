import { describe, it, expect } from 'vitest'
import {
  ADMIN_ROUTE_PERMISSIONS,
  hasAdminPermission,
  permissionForAdminPath,
} from '../adminPermissions'

describe('adminPermissions', () => {
  it('maps reconciliation to payments:read', () => {
    expect(permissionForAdminPath('/admin/reconciliation')).toBe('payments:read')
    expect(permissionForAdminPath('/admin/claims')).toBe('claims:read')
    expect(permissionForAdminPath('/admin/staff-roles')).toBe('superadmin')
  })

  it('superadmin bypasses all checks', () => {
    expect(hasAdminPermission([], true, 'payments:read')).toBe(true)
    expect(hasAdminPermission([], true, 'superadmin')).toBe(true)
  })

  it('denies missing permission for non-superadmin', () => {
    expect(hasAdminPermission(['members:read'], false, 'payments:read')).toBe(false)
    expect(hasAdminPermission(['members:read'], false, 'members:read')).toBe(true)
    expect(hasAdminPermission(['members:read'], false, 'superadmin')).toBe(false)
  })

  it('covers all sidebar-facing routes', () => {
    const expected = [
      'dashboard', 'members', 'registration-fees', 'subscriptions', 'contributions',
      'claims', 'packages', 'news', 'gallery', 'media', 'reports', 'scheduled-reports',
      'settings', 'audit-logs', 'reconciliation', 'health', 'staff-roles',
    ]
    for (const seg of expected) {
      expect(ADMIN_ROUTE_PERMISSIONS[seg]).toBeTruthy()
    }
  })
})
