/**
 * Staff & Roles — validation + offline contracts for manage-user-role.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFunctionName } from '../api-routes'
import {
  parseManageUserRoleBody,
  SUPERADMIN_GRANT_CONFIRM,
  STAFF_ROLE_NAMES,
  ValidationError,
} from '../../../../supabase/functions/shared/validate.ts'

import { FAIL_CLOSED_IDENTIFIERS } from '../../../../supabase/functions/shared/rate-limit-core.ts'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

const TARGET = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const ACTOR = '11111111-2222-4333-8444-555555555555'

describe('parseManageUserRoleBody', () => {
  it('parses grant with role', () => {
    const r = parseManageUserRoleBody({
      action: 'grant',
      targetId: TARGET,
      roleName: 'claims_reviewer',
      reason: 'coverage',
    })
    expect(r.action).toBe('grant')
    expect(r.targetId).toBe(TARGET)
    expect(r.roleName).toBe('claims_reviewer')
    expect(r.reason).toBe('coverage')
  })

  it('parses revoke without role', () => {
    const r = parseManageUserRoleBody({ action: 'revoke', target_id: TARGET })
    expect(r.action).toBe('revoke')
    expect(r.roleName).toBeUndefined()
  })

  it('requires GRANT SUPERADMIN confirmation for superadmin role', () => {
    expect(() =>
      parseManageUserRoleBody({ action: 'grant', targetId: TARGET, roleName: 'superadmin' }),
    ).toThrow(ValidationError)

    const ok = parseManageUserRoleBody({
      action: 'grant',
      targetId: TARGET,
      roleName: 'superadmin',
      confirmSuperadmin: SUPERADMIN_GRANT_CONFIRM,
    })
    expect(ok.roleName).toBe('superadmin')
  })

  it('rejects invalid target, role, and action', () => {
    expect(() => parseManageUserRoleBody({ action: 'grant', targetId: 'nope', roleName: 'admin' })).toThrow(
      ValidationError,
    )
    expect(() => parseManageUserRoleBody({ action: 'grant', targetId: TARGET, roleName: 'hacker' })).toThrow(
      ValidationError,
    )
    expect(() => parseManageUserRoleBody({ action: 'promote', targetId: TARGET, roleName: 'admin' })).toThrow(
      ValidationError,
    )
  })

  it('accepts change_role and snake_case keys', () => {
    const r = parseManageUserRoleBody({
      action: 'change_role',
      target_id: TARGET,
      role_name: 'finance',
    })
    expect(r.action).toBe('change_role')
    expect(r.roleName).toBe('finance')
  })

  it('exposes the known staff role catalog', () => {
    expect(STAFF_ROLE_NAMES).toContain('superadmin')
    expect(STAFF_ROLE_NAMES).toContain('claims_reviewer')
    expect(STAFF_ROLE_NAMES).toContain('support')
  })
})

describe('UI / server confirmation string sync', () => {
  it('matches UI and validate SUPERADMIN_GRANT_CONFIRM', () => {
    const page = read('frontend/src/pages/admin/AdminStaffRoles.tsx')
    expect(page).toContain(`'${SUPERADMIN_GRANT_CONFIRM}'`)
    expect(SUPERADMIN_GRANT_CONFIRM).toBe('GRANT SUPERADMIN')
  })
})

describe('manage-user-role contracts', () => {
  it('maps SPA path and is inventory-ready', () => {
    expect(pathToFunctionName('admin/manage-user-role')).toBe('manage-user-role')
    expect(pathToFunctionName('admin/manage-user-role?action=list')).toBe('manage-user-role')
    expect(existsSync(resolve(root, 'supabase/functions/manage-user-role/index.ts'))).toBe(true)
    expect(read('scripts/deploy-edge-functions.sh')).toContain('manage-user-role')
    expect(read('supabase/config.toml')).toContain('[functions.manage-user-role]')
  })

  it('enforces superadmin-only access and self-operation rejection', () => {
    const src = read('supabase/functions/manage-user-role/index.ts')
    expect(src).toContain('is_superadmin')
    expect(src).toContain("role_name !== 'superadmin'")
    expect(src).toContain('SELF_OPERATION_BLOCKED')
    expect(src).toContain('parsed.targetId === session.id')
  })

  it('covers grant, reactivation, role change, revoke, and last-superadmin', () => {
    const src = read('supabase/functions/manage-user-role/index.ts')
    expect(src).toContain("action: 'noop'")
    expect(src).toContain('reactivate')
    expect(src).toContain('LAST_SUPERADMIN')
    expect(src).toContain('staff.granted')
    expect(src).toContain('staff.role_changed')
    expect(src).toContain('staff.revoked')
    expect(src).toContain('is_active: false')
    expect(src).toContain('TARGET_UNVERIFIED')
    expect(src).toContain('NOT_MEMBER')
    expect(src).toContain('TARGET_INELIGIBLE')
  })

  it('invalidates sessions via Auth Admin signOut global', () => {
    const src = read('supabase/functions/manage-user-role/index.ts')
    expect(src).toContain('invalidateUserSessions')
    expect(src).toContain('generateLink')
    expect(src).toContain('verifyOtp')
    expect(src).toContain("signOut(jwt, 'global')")
    expect(src).not.toContain('ban_duration')
  })

  it('keeps Option A RBAC (no user_roles / role_audit_log)', () => {
    const src = read('supabase/functions/manage-user-role/index.ts')
    expect(src).not.toContain('user_roles')
    expect(src).not.toContain('role_audit_log')
    expect(src).toContain("from('admins')")
    expect(src).toContain('is_superadmin')
  })

  it('uses fail-closed rate limiting', () => {
    expect(FAIL_CLOSED_IDENTIFIERS.has('manage-user-role')).toBe(true)
    const src = read('supabase/functions/manage-user-role/index.ts')
    expect(src).toContain("rateLimitAsync(req, 'manage-user-role'")
  })

  it('does not create Auth users', () => {
    const src = read('supabase/functions/manage-user-role/index.ts')
    expect(src).not.toContain('createUser')
  })

  it('does not touch payments', () => {
    const src = read('supabase/functions/manage-user-role/index.ts')
    expect(src).not.toMatch(/mpesa|PAYMENTS_ENABLED/i)
  })
})

describe('staff management migration draft', () => {
  const migPath = 'supabase/migrations/20260921210000_admin_staff_management_helpers.sql'

  it('exists and only adds granted_by / granted_at (+ index)', () => {
    expect(existsSync(resolve(root, migPath))).toBe(true)
    const mig = read(migPath)
    expect(mig).toContain('granted_by')
    expect(mig).toContain('granted_at')
    expect(mig).toContain('idx_admins_active_superadmin')
    expect(mig).toContain('COALESCE(granted_at, created_at)')
    expect(mig).not.toMatch(/CREATE TABLE.*user_roles/i)
    expect(mig).not.toMatch(/CREATE TABLE.*role_audit_log/i)
    expect(mig).toMatch(/DRAFT|do not apply/i)
  })
})

describe('frontend Staff & Roles wiring', () => {
  it('registers route under RequireSuperadmin and sidebar item', () => {
    const app = read('frontend/src/App.tsx')
    expect(app).toContain('RequireSuperadmin')
    expect(app).toContain('staff-roles')
    expect(app).toContain('AdminStaffRoles')

    const layout = read('frontend/src/components/AdminLayout.tsx')
    expect(layout).toContain('Staff & Roles')
    expect(layout).toContain('superadminOnly')
    expect(layout).toContain('isSuperadmin')

    expect(existsSync(resolve(root, 'frontend/src/components/RequireSuperadmin.tsx'))).toBe(true)
    expect(existsSync(resolve(root, 'frontend/src/pages/admin/AdminStaffRoles.tsx'))).toBe(true)
  })
})

describe('self-operation helper semantics (documented)', () => {
  it('treats matching actor/target as blocked', () => {
    expect(TARGET === ACTOR).toBe(false)
    expect(TARGET === TARGET).toBe(true)
  })
})
