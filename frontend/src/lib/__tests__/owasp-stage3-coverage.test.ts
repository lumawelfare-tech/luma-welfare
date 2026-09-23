/**
 * Stage 3 coverage remediations — offline contracts.
 * Do not delete these to hide failures.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('Stage 3 — CI and E2E honesty', () => {
  it('production npm audit fails the job on High (pipefail + audit-level)', () => {
    const ci = read('.github/workflows/ci.yml')
    expect(ci).toContain('set -o pipefail')
    expect(ci).toContain('npm audit --omit=dev --audit-level=high')
    expect(ci).toContain('E2E_ADMIN_TOTP_SECRET')
  })

  it('Login stores the admin 2FA step-up token after verify', () => {
    const login = read('frontend/src/pages/Login.tsx')
    expect(login).toContain('setAdmin2faStepUpToken')
    expect(login).toContain('step_up_token')
  })

  it('admin UI E2E completes 2FA instead of skipping', () => {
    const auth = read('e2e/helpers/auth.ts')
    expect(auth).toContain('loginAdminUi')
    expect(auth).toContain('signInAdminApi')
    expect(auth).not.toContain("test.skip(true, 'Admin 2FA enabled')")
    expect(read('e2e/admin-flows.spec.ts')).toContain('loginAdminUi')
    expect(read('e2e/admin-flows.spec.ts')).not.toMatch(/Admin 2FA enabled/)
  })

  it('live 401 suite covers privileged admin functions beyond the original 7', () => {
    const spec = read('e2e/security-api.spec.ts')
    expect(spec).toContain('admin-settings')
    expect(spec).toContain('admin-reveal-member-id')
    expect(spec).toContain('manage-user-role')
    expect(spec).toContain('admin-2fa')
    expect(spec).not.toContain('${BASE}/functions/v1/auth-verify-email')
  })

  it('support role is not granted settings/reveal/exports in Stage 1+2 migration', () => {
    const mig = read('supabase/migrations/20260923170000_owasp_stage12_security_fixes.sql')
    expect(mig).toContain("WHERE r.name IN ('superadmin', 'admin')")
    expect(mig).toContain("('settings', 'read')")
    expect(mig).toContain("('members', 'reveal')")
    expect(mig).toContain("('exports', 'create')")
    expect(mig).not.toMatch(/WHERE r\.name = 'support'[\s\S]{0,200}settings/)
  })
})
