/**
 * Phase 1 — auth input schema + CORS allowlist tests
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseLoginBody,
  parseForgotPasswordBody,
  parseRegisterBody,
  parseVerifyEmailBody,
  ValidationError,
} from '../../../../supabase/functions/shared/validate.ts'

const root = resolve(import.meta.dirname, '../../../../')

describe('parseLoginBody', () => {
  it('accepts valid credentials', () => {
    expect(parseLoginBody({ email: 'a@b.co', password: 'secret1' })).toEqual({
      email: 'a@b.co',
      password: 'secret1',
    })
  })

  it('rejects missing/invalid email', () => {
    expect(() => parseLoginBody({ password: 'x' })).toThrow(ValidationError)
    expect(() => parseLoginBody({ email: 'not-an-email', password: 'x' })).toThrow(ValidationError)
  })
})

describe('parseForgotPasswordBody', () => {
  it('accepts an allowlisted reset URL', () => {
    expect(parseForgotPasswordBody({
      email: 'A@B.co',
      redirectTo: 'http://localhost:5173/reset-password',
    })).toEqual({
      email: 'a@b.co',
      redirectTo: 'http://localhost:5173/reset-password',
    })
  })

  it('rejects a foreign reset host', () => {
    expect(() => parseForgotPasswordBody({
      email: 'a@b.co',
      redirectTo: 'https://evil.test/reset-password',
    })).toThrow(ValidationError)
  })
})

describe('parseRegisterBody', () => {
  const validBase = {
    email: 'Member@Example.com',
    password: 'Secret12',
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
    acceptedPrivacy: true,
    acceptedTerms: true,
    acceptedConstitution: true,
    confirmSelfSubmission: true,
    privacyPolicyVersion: '2026-09-21.1',
    termsVersion: '2026-09-21.1',
  }

  it('accepts a valid Kenyan registration payload', () => {
    const r = parseRegisterBody(validBase)
    expect(r.email).toBe('member@example.com')
    expect(r.phone).toBe('0712345678')
    expect(r.dateOfBirth).toBe('1990-05-15')
    expect(r.acceptedPrivacy).toBe(true)
  })

  it('rejects missing privacy/terms consent', () => {
    expect(() =>
      parseRegisterBody({
        ...validBase,
        acceptedPrivacy: false,
        acceptedTerms: false,
      }),
    ).toThrow(/Privacy Policy/)
  })

  it('rejects weak passwords and bad phones', () => {
    expect(() =>
      parseRegisterBody({
        ...validBase,
        password: 'short',
      }),
    ).toThrow(/8 characters/)
    expect(() =>
      parseRegisterBody({
        ...validBase,
        phone: '123',
      }),
    ).toThrow(/Kenyan phone/)
  })
})

describe('parseVerifyEmailBody', () => {
  it('parses verify and resend actions', () => {
    expect(parseVerifyEmailBody({ email: 'a@b.co', code: '123456' }, null)).toEqual({
      action: 'verify',
      email: 'a@b.co',
      code: '123456',
    })
    expect(parseVerifyEmailBody({ email: 'a@b.co', action: 'resend' }, null)).toEqual({
      action: 'resend',
      email: 'a@b.co',
    })
  })

  it('rejects non-digit OTP codes', () => {
    expect(() => parseVerifyEmailBody({ email: 'a@b.co', code: 'abcdef' }, 'verify')).toThrow(
      ValidationError,
    )
  })
})

describe('CORS source contracts', () => {
  it('does not reflect arbitrary *.vercel.app origins', () => {
    const src = readFileSync(resolve(root, 'supabase/functions/shared/cors.ts'), 'utf-8')
    expect(src).not.toMatch(/endsWith\('\.vercel\.app'\)/)
    expect(src).toContain('Exact origin matching only')
  })

  it('auth handlers use shared validate parsers', () => {
    expect(readFileSync(resolve(root, 'supabase/functions/auth-login/index.ts'), 'utf-8')).toContain(
      'parseLoginBody',
    )
    expect(readFileSync(resolve(root, 'supabase/functions/auth-register/index.ts'), 'utf-8')).toContain(
      'parseRegisterBody',
    )
    expect(
      readFileSync(resolve(root, 'supabase/functions/auth-verify-email/index.ts'), 'utf-8'),
    ).toContain('parseVerifyEmailBody')
    expect(
      readFileSync(resolve(root, 'supabase/functions/auth-verify-email/index.ts'), 'utf-8'),
    ).not.toMatch(/\.ilike\(['"]email['"]/)
  })
})
