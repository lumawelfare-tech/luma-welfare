/**
 * Member identity / family / beneficiary document contracts.
 * Offline only — no live storage or payment calls.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFunctionName } from '../api-routes'
import {
  beneficiaryStatusLabel,
  familyTierLabel,
  identityDocLabel,
  identityDocStatusLabel,
  identityDocsNextStep,
} from '../identityDocs'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('identity document display helpers', () => {
  it('labels document types and statuses without color-only meaning', () => {
    expect(identityDocLabel('national_id')).toBe('National ID')
    expect(identityDocLabel('kra_certificate')).toBe('KRA PIN certificate')
    expect(identityDocStatusLabel('pending')).toBe('Pending verification')
    expect(identityDocStatusLabel('verified')).toBe('Verified')
    expect(identityDocStatusLabel('')).toBe('Not uploaded')
    expect(familyTierLabel('nuclear')).toBe('Nuclear family')
    expect(familyTierLabel('extended')).toBe('Extended family')
    expect(beneficiaryStatusLabel('active')).toBe('Active')
  })

  it('next-step copy treats KRA as optional and flags rejection first', () => {
    expect(identityDocsNextStep([]).kind).toBe('missing')
    expect(identityDocsNextStep([{ document_type: 'national_id', verification_status: 'pending' }]).kind).toBe('pending')
    expect(identityDocsNextStep([
      { document_type: 'national_id', verification_status: 'rejected' },
      { document_type: 'kra_certificate', verification_status: 'verified' },
    ]).kind).toBe('rejected')
    expect(identityDocsNextStep([{ document_type: 'national_id', verification_status: 'verified' }]).kind).toBe('ok')
  })
})

describe('routing + deploy inventory', () => {
  it('maps SPA paths to member-identity-docs', () => {
    expect(pathToFunctionName('member/identity-docs')).toBe('member-identity-docs')
    expect(pathToFunctionName('admin/members')).toBe('admin-members')
  })

  it('registers JWT-on function and CI inventory', () => {
    expect(read('supabase/config.toml')).toContain('[functions.member-identity-docs]')
    expect(read('supabase/config.toml')).toMatch(/\[functions\.member-identity-docs\][\s\S]*?verify_jwt\s*=\s*true/)
    expect(read('scripts/deploy-edge-functions.sh')).toContain('member-identity-docs')
    expect(read('.github/workflows/ci.yml')).toContain('member-identity-docs')
  })

  it('migration exists and is private + RLS-forced', () => {
    const path = 'supabase/migrations/20260924120000_member_identity_documents.sql'
    expect(existsSync(resolve(root, path))).toBe(true)
    const mig = read(path)
    expect(mig).toContain('CREATE TABLE IF NOT EXISTS public.member_documents')
    expect(mig).toContain('FORCE ROW LEVEL SECURITY')
    expect(mig).toContain("member_id = auth.uid()")
    expect(mig).toContain("verification_status = 'pending'")
    expect(mig).toContain("'member-documents'")
    expect(mig).toMatch(/public\s*=\s*false/)
    expect(mig).toContain("action = 'verify'")
    expect(mig).not.toMatch(/CREATE POLICY[\s\S]{0,80}storage\.objects/)
  })
})

describe('member-identity-docs security contracts', () => {
  it('requires auth, magic-byte PDF check, private signed URLs, and owner scoping', () => {
    const src = read('supabase/functions/member-identity-docs/index.ts')
    expect(src).toContain('getAuthenticatedUser')
    expect(src).toContain('detectAllowedUpload')
    expect(src).toContain("detected.kind !== 'pdf'")
    expect(src).toContain('MEMBER_DOC_BUCKET')
    expect(src).toContain('signPrivateStorageUrl')
    expect(src).toContain('.eq(\'member_id\', user.id)')
    expect(src).toContain('rateLimitAsync')
    expect(src).toContain('member-identity-docs')
    expect(src).toContain('crypto.randomUUID()')
    expect(src).toContain("verification_status: 'superseded'")
    expect(src).toContain("action: 'member_document_uploaded'")
    expect(src).not.toMatch(/getPublicUrl/)
  })

  it('does not expose full KRA PIN on GET', () => {
    const src = read('supabase/functions/member-identity-docs/index.ts')
    expect(src).toContain('kra_pin_masked')
    expect(src).toContain('maskIdNumberLast4')
    expect(src).not.toMatch(/kra_pin:/)
  })
})

describe('admin identity document contracts', () => {
  it('detail payload masks KRA and family IDs and lists identity_documents', () => {
    const src = read('supabase/functions/admin-members/index.ts')
    expect(src).toContain('identity_documents')
    expect(src).toContain('kra_pin_masked')
    expect(src).toContain('id_number_masked')
    expect(src).toContain("action === 'view-identity-document'")
    expect(src).toContain("requirePermission(session, 'documents', 'read')")
    expect(src).toContain("requirePermission(session, 'documents', 'verify')")
    expect(src).toContain("action: 'view_member_document'")
    expect(src).toContain('sendNotification')
    expect(src).toContain('A rejection reason is required')
    expect(src).not.toMatch(/getPublicUrl/)
  })

  it('auth-me and auth-login strip full kra_pin from the session member', () => {
    expect(read('supabase/functions/auth-me/index.ts')).toContain('stripMemberKraPin')
    expect(read('supabase/functions/auth-login/index.ts')).toContain('stripMemberKraPin')
    expect(read('supabase/functions/shared/pii.ts')).toContain('export function stripMemberKraPin')
    expect(read('supabase/functions/shared/logging.ts')).toContain("'kra_pin'")
  })

  it('view-identity-document requires documents:read, not members:reveal', () => {
    const src = read('supabase/functions/admin-members/index.ts')
    expect(src).toContain("requirePermission(session, 'documents', 'read')")
    expect(src).not.toMatch(/members:reveal/)
  })

  it('family and identity mutations block suspended or closed members', () => {
    expect(read('supabase/functions/member-family/index.ts')).toContain('assertMemberActive')
    expect(read('supabase/functions/member-identity-docs/index.ts')).toContain('assertMemberActive')
    expect(read('supabase/functions/member-profile/index.ts')).toContain('assertMemberActive')
    expect(read('supabase/functions/shared/member-status.ts')).toContain('allowPending')
  })
})
