/**
 * Phase 1 — auth input schema + CORS allowlist tests
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseLoginBody,
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

describe('parseRegisterBody', () => {
  it('accepts a valid Kenyan registration payload', () => {
    const r = parseRegisterBody({
      email: 'Member@Example.com',
      password: 'Secret12',
      fullName: 'Jane Doe',
      phone: '0712345678',
      idNumber: '12345678',
      acceptedPrivacy: true,
      acceptedTerms: true,
    })
    expect(r.email).toBe('member@example.com')
    expect(r.phone).toBe('0712345678')
    expect(r.acceptedPrivacy).toBe(true)
  })

  it('rejects missing privacy/terms consent', () => {
    expect(() =>
      parseRegisterBody({
        email: 'a@b.co',
        password: 'Secret12',
        fullName: 'A',
        phone: '0712345678',
      }),
    ).toThrow(/Privacy Policy/)
  })

  it('rejects weak passwords and bad phones', () => {
    expect(() =>
      parseRegisterBody({
        email: 'a@b.co',
        password: 'short',
        fullName: 'A',
        phone: '0712345678',
      }),
    ).toThrow(/8 characters/)
    expect(() =>
      parseRegisterBody({
        email: 'a@b.co',
        password: 'Secret12',
        fullName: 'A',
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
