/**
 * Membership application pipeline: form → validate → auth-register → members
 * → admin-members → AdminMembers UI. Offline contracts only.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseRegisterBody, ValidationError } from '../../../../supabase/functions/shared/validate.ts'
import { stripAuthSecretsFromMember, prepareMemberListRow } from '../../../../supabase/functions/shared/pii.ts'
import { APPLICATION_PROGRAM_OPTIONS } from '../applicationPrograms'
import { legalConfig } from '../../config/legal'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

const distinctive = {
  email: 'test.member.001@example.com',
  password: 'TestPass001',
  fullName: 'TEST MEMBER 001',
  phone: '0711111111',
  idNumber: '87654321',
  dateOfBirth: '1988-04-12',
  gender: 'male',
  maritalStatus: 'married',
  county: 'TEST COUNTY',
  location: 'TEST TOWN',
  residentialAddress: 'TEST RESIDENTIAL ADDRESS 001',
  whatsappPhone: '0722222222',
  altPhone: '0733333333',
  emergencyContactName: 'TEST NEXT OF KIN',
  emergencyContactRelationship: 'TEST RELATIONSHIP',
  emergencyContactPhone: '0744444444',
  emergencyContactAltPhone: '0755555555',
  familyCoverage: 'extended',
  applicationProgramCodes: ['welfare', 'education', 'business'],
  acceptedPrivacy: true as const,
  acceptedTerms: true as const,
  acceptedConstitution: true as const,
  confirmSelfSubmission: true as const,
  privacyPolicyVersion: legalConfig.privacyPolicyVersion,
  termsVersion: legalConfig.termsVersion,
  constitutionVersion: legalConfig.constitutionVersion,
}

describe('registration payload — all application fields', () => {
  it('accepts a complete distinctive application and keeps every non-password field', () => {
    const parsed = parseRegisterBody(distinctive)
    expect(parsed.fullName).toBe('TEST MEMBER 001')
    expect(parsed.idNumber).toBe('87654321')
    expect(parsed.dateOfBirth).toBe('1988-04-12')
    expect(parsed.gender).toBe('male')
    expect(parsed.maritalStatus).toBe('married')
    expect(parsed.county).toBe('TEST COUNTY')
    expect(parsed.location).toBe('TEST TOWN')
    expect(parsed.residentialAddress).toBe('TEST RESIDENTIAL ADDRESS 001')
    expect(parsed.phone).toBe('0711111111')
    expect(parsed.whatsappPhone).toBe('0722222222')
    expect(parsed.altPhone).toBe('0733333333')
    expect(parsed.email).toBe('test.member.001@example.com')
    expect(parsed.emergencyContactName).toBe('TEST NEXT OF KIN')
    expect(parsed.emergencyContactRelationship).toBe('TEST RELATIONSHIP')
    expect(parsed.emergencyContactPhone).toBe('0744444444')
    expect(parsed.emergencyContactAltPhone).toBe('0755555555')
    expect(parsed.applicationProgramCodes).toEqual(['welfare', 'education', 'business'])
    expect(parsed.familyCoverage).toBe('extended')
    expect(parsed.acceptedConstitution).toBe(true)
    expect(parsed.acceptedPrivacy).toBe(true)
    expect(parsed.acceptedTerms).toBe(true)
    expect(parsed.confirmSelfSubmission).toBe(true)
    expect(parsed.constitutionVersion).toBe(legalConfig.constitutionVersion)
    expect(parsed.password).toBe('TestPass001')
  })

  it('rejects missing required fields and omitted declarations', () => {
    expect(() => parseRegisterBody({ ...distinctive, fullName: '' })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...distinctive, county: '' })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...distinctive, emergencyContactName: '' })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...distinctive, acceptedConstitution: false })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...distinctive, acceptedPrivacy: false })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...distinctive, acceptedTerms: false })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...distinctive, confirmSelfSubmission: false })).toThrow(ValidationError)
  })

  it('rejects duplicate-style weak passwords and keeps program codes as an array', () => {
    expect(() => parseRegisterBody({ ...distinctive, password: 'onlyletters' })).toThrow(ValidationError)
    const parsed = parseRegisterBody(distinctive)
    expect(Array.isArray(parsed.applicationProgramCodes)).toBe(true)
    expect(parsed.applicationProgramCodes).not.toBe('Welfare, Education, Business')
  })
})

describe('auth-register persistence path', () => {
  const registerSrc = read('supabase/functions/auth-register/index.ts')

  it('writes every application column and does not insert subscriptions or dependants', () => {
    const insertBlock = registerSrc.slice(
      registerSrc.indexOf(".from('members').insert"),
      registerSrc.indexOf('if (memberError)'),
    )
    expect(insertBlock.length).toBeGreaterThan(80)
    for (const col of [
      'full_name',
      'id_number',
      'date_of_birth',
      'gender',
      'marital_status',
      'county',
      'location',
      'residential_address',
      'whatsapp_phone',
      'alt_phone',
      'emergency_contact_name',
      'emergency_contact_relationship',
      'emergency_contact_phone',
      'emergency_contact_alt_phone',
      'family_coverage',
      'application_program_codes',
      'privacy_accepted_at',
      'terms_accepted_at',
      'constitution_accepted_at',
      'self_submission_confirmed_at',
      'privacy_policy_version',
      'terms_version',
      'constitution_version',
    ]) {
      expect(insertBlock).toContain(col)
    }
    expect(registerSrc).toContain("status: 'pending_approval'")
    expect(registerSrc).toContain('createUser')
    expect(registerSrc).not.toMatch(/from\('subscriptions'\)\.insert/)
    expect(registerSrc).not.toMatch(/from\('family_members'\)\.insert/)
    expect(registerSrc).not.toMatch(/from\('members'\)\.insert\([\s\S]*password/)
  })

  it('enforces all four declarations and records legal acceptances', () => {
    expect(registerSrc).toContain("document_type: 'privacy'")
    expect(registerSrc).toContain("document_type: 'terms'")
    expect(registerSrc).toContain("document_type: 'constitution'")
    expect(registerSrc).toContain("document_type: 'self_submission'")
    expect(registerSrc).toContain('CONSTITUTION_VERSION')
    expect(registerSrc).toContain('LEGAL_VERSION_MISMATCH')
    expect(registerSrc).toContain('EMAIL_TAKEN')
  })

  it('does not log password or national ID values', () => {
    expect(registerSrc).not.toMatch(/console\.(log|info|debug).*(password|idNumber|id_number)/i)
  })
})

describe('admin API visibility and authorization', () => {
  const adminSrc = read('supabase/functions/admin-members/index.ts')

  it('detail select returns member columns, legal acceptances, and resolved programs', () => {
    expect(adminSrc).toContain(".select('*')")
    expect(adminSrc).toContain("from('member_legal_acceptances')")
    expect(adminSrc).toContain('application_programs')
    expect(adminSrc).toContain('stripAuthSecretsFromMember')
    expect(adminSrc).toContain('approved_by_name')
    expect(adminSrc).toContain("requirePermission(session, 'members', 'read')")
    expect(adminSrc).toContain("status: 401")
    expect(adminSrc).toContain('loadAdminSession')
  })

  it('never returns password material from list or detail helpers', () => {
    const leaked = stripAuthSecretsFromMember({
      full_name: 'TEST MEMBER 001',
      password: 'secret',
      password_hash: 'hash',
      confirm_password: 'secret',
      county: 'TEST COUNTY',
    })
    expect(leaked).not.toHaveProperty('password')
    expect(leaked).not.toHaveProperty('password_hash')
    expect(leaked).not.toHaveProperty('confirm_password')
    expect(leaked.county).toBe('TEST COUNTY')

    const list = prepareMemberListRow({
      id: '11111111-1111-4111-8111-111111111111',
      full_name: 'TEST MEMBER 001',
      phone: '0711111111',
      id_number: '87654321',
      password: 'should-not-leak',
      county: 'TEST COUNTY',
      family_coverage: 'extended',
      application_program_codes: ['welfare', 'education'],
    })
    expect(list).not.toHaveProperty('password')
    expect(list).not.toHaveProperty('id_number')
    expect(list.county).toBe('TEST COUNTY')
    expect(list.family_coverage).toBe('extended')
    expect(list.application_program_codes).toEqual(['welfare', 'education'])
  })
})

describe('admin dashboard sections', () => {
  const ui = read('frontend/src/pages/admin/AdminMembers.tsx')
  const registerUi = read('frontend/src/pages/Register.tsx')

  it('shows every application section in member detail', () => {
    for (const heading of [
      'Applicant details',
      'Address',
      'Contact',
      'Emergency / next of kin',
      'Programs',
      'Declarations',
      'Application status',
    ]) {
      expect(ui).toContain(heading)
    }
    for (const label of [
      'Full name',
      'National ID / Passport',
      'Date of birth',
      'Gender',
      'Marital status',
      'County',
      'Town / area',
      'Residential address',
      'Mobile number',
      'WhatsApp number',
      'Alternative contact',
      'Family coverage',
      'Selected packages',
      'Constitution / Membership Terms accepted',
      'Privacy Policy accepted',
      'Terms & Conditions accepted',
      'Self-submission confirmed',
      'Approving administrator',
    ]) {
      expect(ui).toContain(label)
    }
    expect(ui).not.toMatch(/detailData\.member\.password/)
    expect(ui).toContain('header: \'County\'')
    expect(ui).toContain('header: \'Coverage\'')
    expect(ui).toContain('header: \'Programs\'')
    expect(ui).toContain('header: \'Applied\'')
  })

  it('register form collects every official field and all program options', () => {
    expect(registerUi).toContain('applicationProgramCodes: programs')
    expect(registerUi).toContain('constitutionVersion: legalConfig.constitutionVersion')
    expect(registerUi).toContain('confirmSelfSubmission')
    expect(APPLICATION_PROGRAM_OPTIONS).toHaveLength(13)
    expect(registerUi).toContain('APPLICATION_PROGRAM_OPTIONS.map')
    expect(registerUi).toContain('{p.label}')
  })
})

describe('schema + search', () => {
  it('adds consent columns and list summary fields without weakening RLS', () => {
    const migPath = 'supabase/migrations/20260925120000_membership_application_consent.sql'
    expect(existsSync(resolve(root, migPath))).toBe(true)
    const mig = read(migPath)
    expect(mig).toContain('self_submission_confirmed_at')
    expect(mig).toContain('constitution_version')
    expect(mig).toContain("'constitution', 'self_submission'")
    expect(mig).toContain('application_program_codes')
    expect(mig).toContain('family_coverage')
    expect(mig).toContain('application_number')
    expect(mig).not.toMatch(/DISABLE ROW LEVEL SECURITY/)
    expect(mig).not.toMatch(/DROP POLICY/)
  })
})
