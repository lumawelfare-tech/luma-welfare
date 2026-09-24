/**
 * Unit tests for shared auth body parsers (critical Edge validation).
 */
import { describe, it, expect } from 'vitest'
import {
  parseLoginBody,
  parseRegisterBody,
  parseOptionalKraPin,
  parseFamilyMemberBody,
  parseIdentityDocumentType,
  parseMemberProfilePatchBody,
  ValidationError,
} from '../../../../supabase/functions/shared/validate.ts'

describe('parseLoginBody', () => {
  it('accepts valid credentials', () => {
    expect(parseLoginBody({ email: 'A@B.com', password: 'secret1' })).toEqual({
      email: 'a@b.com',
      password: 'secret1',
    })
  })

  it('rejects invalid email and empty password', () => {
    expect(() => parseLoginBody({ email: 'nope', password: 'x' })).toThrow(ValidationError)
    expect(() => parseLoginBody({ email: 'a@b.com', password: '' })).toThrow(ValidationError)
  })
})

describe('parseRegisterBody', () => {
  const good = {
    email: 'member@example.com',
    password: 'Password1',
    fullName: 'Jane Doe',
    phone: '0712345678',
    idNumber: '12345678',
    dateOfBirth: '1990-05-15',
    gender: 'female',
    maritalStatus: 'single',
    county: 'Kajiado',
    location: 'Kitengela',
    residentialAddress: 'Phase 2 Estate',
    whatsappPhone: '0712345678',
    emergencyContactName: 'John Doe',
    emergencyContactRelationship: 'spouse',
    emergencyContactPhone: '0722000000',
    familyCoverage: 'individual',
    applicationProgramCodes: ['welfare'],
    acceptedPrivacy: true as const,
    acceptedTerms: true as const,
    acceptedConstitution: true as const,
    confirmSelfSubmission: true as const,
    privacyPolicyVersion: '2026-09-21.1',
    termsVersion: '2026-09-21.1',
  }

  it('accepts a valid Kenya registration payload', () => {
    const r = parseRegisterBody(good)
    expect(r.email).toBe('member@example.com')
    expect(r.phone).toBe('0712345678')
    expect(r.idNumber).toBe('12345678')
    expect(r.dateOfBirth).toBe('1990-05-15')
    expect(r.acceptedConstitution).toBe(true)
    expect(r.applicationProgramCodes).toContain('welfare')
  })

  it('normalizes legacy interest codes to package codes', () => {
    const r = parseRegisterBody({
      ...good,
      applicationProgramCodes: ['WELFARE', 'OUTPATIENT', 'mission_of_mercy'],
    })
    expect(r.applicationProgramCodes).toEqual(['welfare', 'hospital', 'mission_of_mercy'])
  })

  it('rejects unknown program interest codes', () => {
    expect(() =>
      parseRegisterBody({ ...good, applicationProgramCodes: ['OTHER'] }),
    ).toThrow(ValidationError)
  })

  it('rejects weak passwords and bad phones', () => {
    expect(() => parseRegisterBody({ ...good, password: 'short' })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...good, phone: '123' })).toThrow(ValidationError)
  })

  it('rejects missing or invalid National ID', () => {
    expect(() => parseRegisterBody({ ...good, idNumber: '' })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...good, idNumber: '12' })).toThrow(ValidationError)
  })

  it('requires privacy, terms, constitution, and self-submission', () => {
    expect(() => parseRegisterBody({ ...good, acceptedPrivacy: false })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...good, acceptedTerms: false })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...good, acceptedConstitution: false })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...good, confirmSelfSubmission: false })).toThrow(ValidationError)
  })
})

describe('parseOptionalKraPin', () => {
  it('accepts a Kenyan KRA PIN', () => {
    expect(parseOptionalKraPin('a123456789x')).toBe('A123456789X')
    expect(parseOptionalKraPin(null)).toBeNull()
    expect(parseOptionalKraPin('')).toBeNull()
  })

  it('rejects malformed pins', () => {
    expect(() => parseOptionalKraPin('123456789')).toThrow(ValidationError)
    expect(() => parseOptionalKraPin('A123X')).toThrow(ValidationError)
  })
})

describe('parseFamilyMemberBody', () => {
  it('accepts camelCase and snake_case', () => {
    const camel = parseFamilyMemberBody({
      fullName: 'Jane Doe',
      relationship: 'spouse',
      tier: 'nuclear',
      dateOfBirth: '1992-01-02',
    })
    expect(camel.fullName).toBe('Jane Doe')
    expect(camel.tier).toBe('nuclear')
    expect(camel.beneficiaryStatus).toBe('active')

    const snake = parseFamilyMemberBody({
      full_name: 'John Doe',
      relationship: 'child',
      tier: 'extended',
      id_number: '12345678',
    })
    expect(snake.fullName).toBe('John Doe')
    expect(snake.idNumber).toBe('12345678')
    expect(snake.tier).toBe('extended')
  })

  it('rejects invented relationships and tiers', () => {
    expect(() => parseFamilyMemberBody({ fullName: 'X', relationship: 'cousin', tier: 'nuclear' })).toThrow(ValidationError)
    expect(() => parseFamilyMemberBody({ fullName: 'X', relationship: 'spouse', tier: 'household' })).toThrow(ValidationError)
  })
})

describe('parseIdentityDocumentType', () => {
  it('allows organization document types only', () => {
    expect(parseIdentityDocumentType('national_id')).toBe('national_id')
    expect(parseIdentityDocumentType('beneficiary_id')).toBe('beneficiary_id')
    expect(() => parseIdentityDocumentType('passport_scan')).toThrow(ValidationError)
  })
})

describe('parseMemberProfilePatchBody', () => {
  const base = {
    fullName: 'Jane Doe',
    phone: '0712345678',
    idNumber: '12345678',
  }

  it('leaves KRA PIN unchanged when omitted', () => {
    expect(parseMemberProfilePatchBody(base).kraPin).toBeUndefined()
  })

  it('updates KRA PIN when provided', () => {
    expect(parseMemberProfilePatchBody({ ...base, kraPin: 'A123456789X' }).kraPin).toBe('A123456789X')
  })
})
