/**
 * Offline contracts for admin members list PII + national ID reveal.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseRevealMemberIdInput,
  parseRegisterBody,
  parseKenyanNationalId,
  normalizeKenyanPhone,
  ValidationError,
} from '../../../../supabase/functions/shared/validate.ts'
import { prepareMemberListRow, maskIdNumberLast4 } from '../../../../supabase/functions/shared/pii.ts'
import { pathToFunctionName } from '../api-routes'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('prepareMemberListRow', () => {
  it('omits full id_number and returns masked last-4 only', () => {
    const row = prepareMemberListRow({
      id: '11111111-1111-4111-8111-111111111111',
      full_name: 'Test Member',
      phone: '0712345678',
      email: 't@example.com',
      id_number: '12345678',
      status: 'active',
    })
    expect(row).not.toHaveProperty('id_number')
    expect(row.id_number_masked).toBe(maskIdNumberLast4('12345678'))
    expect(row.phone).toBe('0712345678')
    expect(row.profile_incomplete).toBe(false)
  })

  it('flags incomplete profile when ID missing', () => {
    const row = prepareMemberListRow({
      id: '11111111-1111-4111-8111-111111111111',
      full_name: 'No Id',
      phone: '0712345678',
      id_number: null,
    })
    expect(row.id_number_masked).toBe('—')
    expect(row.profile_incomplete).toBe(true)
  })

  it('marks anonymized shells without incomplete-profile badge', () => {
    const row = prepareMemberListRow({
      id: '11111111-1111-4111-8111-111111111111',
      full_name: 'Deleted member',
      phone: '0700000000',
      id_number: null,
      anonymized_at: '2026-09-21T17:00:00Z',
    })
    expect(row.is_anonymized).toBe(true)
    expect(row.profile_incomplete).toBe(false)
    expect(row.id_number_masked).toBe('—')
  })
})

describe('reveal-member-id contracts', () => {
  it('maps SPA path to edge function', () => {
    expect(pathToFunctionName('admin/reveal-member-id')).toBe('admin-reveal-member-id')
  })

  it('edge function enforces admin session, permission, audit, and rate limit', () => {
    const src = read('supabase/functions/admin-reveal-member-id/index.ts')
    expect(src).toContain('loadAdminSession')
    expect(src).toContain("requirePermission(session, 'members', 'read')")
    expect(src).toContain("action: 'view_national_id'")
    expect(src).toContain('rateLimitAsync')
    expect(src).toContain('parseRevealMemberIdInput')
    expect(src).not.toMatch(/console\.(log|info|debug).*id_number/)
  })

  it('list endpoint uses prepareMemberListRow (never raw id_number in list JSON)', () => {
    const src = read('supabase/functions/admin-members/index.ts')
    expect(src).toContain('prepareMemberListRow')
    expect(src).not.toMatch(/maskMemberListFields\(m\)/)
  })

  it('rejects non-UUID reveal input', () => {
    expect(() => parseRevealMemberIdInput({}, null)).toThrow(ValidationError)
    expect(() => parseRevealMemberIdInput({ member_id: 'not-a-uuid' }, null)).toThrow(ValidationError)
  })

  it('accepts member_id from query or body', () => {
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    expect(parseRevealMemberIdInput({}, id).memberId).toBe(id)
    expect(parseRevealMemberIdInput({ memberId: id }, null).memberId).toBe(id)
  })
})

describe('registration ID validation', () => {
  const good = {
    email: 'member@example.com',
    password: 'Password1',
    fullName: 'Jane Doe',
    phone: '0712345678',
    idNumber: '12345678',
    dateOfBirth: '1990-05-15',
    gender: 'female',
    maritalStatus: 'single',
    county: 'Nairobi',
    location: 'Westlands',
    residentialAddress: '123 Example Street',
    emergencyContactName: 'John Doe',
    emergencyContactRelationship: 'spouse',
    emergencyContactPhone: '0798765432',
    acceptedPrivacy: true as const,
    acceptedTerms: true as const,
    acceptedConstitution: true as const,
    confirmSelfSubmission: true as const,
    privacyPolicyVersion: '2026-09-21.1',
    termsVersion: '2026-09-21.1',
  }

  it('requires a 7–8 digit Kenyan National ID', () => {
    expect(parseRegisterBody(good).idNumber).toBe('12345678')
    expect(() => parseRegisterBody({ ...good, idNumber: '' })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...good, idNumber: '123' })).toThrow(ValidationError)
    expect(parseKenyanNationalId('12-345-678')).toBe('12345678')
  })

  it('normalizes +254 phones to canonical 07…', () => {
    expect(normalizeKenyanPhone('+254712345678')).toBe('0712345678')
    expect(parseRegisterBody({ ...good, phone: '+254712345678' }).phone).toBe('0712345678')
  })
})

describe('migrations + deploy inventory', () => {
  it('includes admin search id_number migration', () => {
    expect(existsSync(resolve(root, 'supabase/migrations/20260921170000_admin_members_list_id_search.sql'))).toBe(true)
    const mig = read('supabase/migrations/20260921170000_admin_members_list_id_search.sql')
    expect(mig).toContain('id_number')
  })

  it('includes partial unique index migration for id_number', () => {
    const mig = read('supabase/migrations/20260921180000_members_id_number_unique.sql')
    expect(mig).toContain('members_id_number_unique')
    expect(mig).toContain('WHERE id_number IS NOT NULL')
  })

  it('registers admin-reveal-member-id in config and deploy script', () => {
    expect(read('supabase/config.toml')).toContain('admin-reveal-member-id')
    expect(read('scripts/deploy-edge-functions.sh')).toContain('admin-reveal-member-id')
  })
})
