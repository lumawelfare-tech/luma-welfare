import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../../../..')

function read(rel: string) {
  return readFileSync(resolve(root, rel), 'utf8')
}

describe('Stage 4 security patches (source contracts)', () => {
  it('H-01: import creates pending_approval with email_confirm false', () => {
    const src = read('supabase/functions/admin-members/index.ts')
    expect(src).toContain('parseImportMemberRow')
    expect(src).toContain("status: 'pending_approval'")
    expect(src).toContain('email_confirm: false')
    // Import path must not auto-confirm email
    expect(src).toMatch(/createUser\(\{[\s\S]*?email_confirm:\s*false/)
  })

  it('H-02: claim upload uses magic-byte detection', () => {
    const src = read('supabase/functions/member-claims/index.ts')
    expect(src).toContain('detectAllowedUpload')
    expect(src).toContain('looksLikeScriptableMarkup')
    expect(src).not.toMatch(/contentType:\s*fileType/)
  })

  it('H-03: auth-me exposes adminPermissions and UI gates on them', () => {
    expect(read('supabase/functions/auth-me/index.ts')).toContain('adminPermissions')
    expect(read('frontend/src/components/RequirePermission.tsx')).toContain('permissionForAdminPath')
    expect(read('frontend/src/App.tsx')).toContain('RequirePermission')
    expect(read('frontend/src/components/AdminLayout.tsx')).toContain('adminPermissions')
  })

  it('H-04/M-02/M-03: migration adds phone unique, drops exports own + ledger_read_own', () => {
    const mig = read('supabase/migrations/20260921220000_security_audit_stage4.sql')
    expect(mig).toContain('members_phone_unique')
    expect(mig).toContain('DROP POLICY IF EXISTS "exports_insert_own"')
    expect(mig).toContain('DROP POLICY IF EXISTS "ledger_read_own"')
  })

  it('M-08: Login uses safeInternalPath', () => {
    expect(read('frontend/src/pages/Login.tsx')).toContain('safeInternalPath')
  })

  it('M-05: AdminReports uses sanitizeSpreadsheetCell', () => {
    const src = read('frontend/src/pages/admin/AdminReports.tsx')
    expect(src).toContain('sanitizeSpreadsheetCell')
    expect(src).toContain('escapeXml')
  })
})
