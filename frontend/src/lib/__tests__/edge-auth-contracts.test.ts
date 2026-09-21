/**
 * Offline contracts: protected Edge Functions must call shared auth helpers.
 * Complements live Playwright security-api + RLS suites.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')
const functionsDir = join(root, 'supabase/functions')

const ADMIN_FNS = [
  'admin-dashboard',
  'admin-members',
  'admin-reveal-member-id',
  'admin-claims',
  'admin-contributions',
  'admin-subscriptions',
  'admin-reports',
  'admin-exports',
]

const MEMBER_FNS = [
  'member-dashboard',
  'member-profile',
  'member-claims',
  'member-receipts',
]

function readFn(name: string): string {
  return readFileSync(join(functionsDir, name, 'index.ts'), 'utf-8')
}

describe('Edge auth contracts', () => {
  it('admin functions require admin session + permission helpers', () => {
    for (const fn of ADMIN_FNS) {
      const src = readFn(fn)
      expect(src, fn).toMatch(/loadAdminSession|getAdminSession|requireAdmin/)
      expect(src, fn).toMatch(/requirePermission|handleAdminError/)
    }
  })

  it('member functions require getAuthenticatedUser', () => {
    for (const fn of MEMBER_FNS) {
      const src = readFn(fn)
      expect(src, fn).toContain('getAuthenticatedUser')
    }
  })

  it('auth-register and auth-login use shared validate parsers', () => {
    expect(readFn('auth-register')).toContain('parseRegisterBody')
    expect(readFn('auth-login')).toContain('parseLoginBody')
    expect(readFn('auth-verify-email')).toContain('parseVerifyEmailBody')
  })

  it('deployed function folders include required CI inventory', () => {
    expect(existsSync(functionsDir)).toBe(true)
    const dirs = readdirSync(functionsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
    for (const fn of [...ADMIN_FNS, ...MEMBER_FNS, 'public-data', 'health', 'contact']) {
      expect(dirs).toContain(fn)
    }
  })
})
