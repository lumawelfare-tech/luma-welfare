/**
 * Unit tests for shared auth body parsers (critical Edge validation).
 */
import { describe, it, expect } from 'vitest'
import {
  parseLoginBody,
  parseRegisterBody,
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
    acceptedPrivacy: true as const,
    acceptedTerms: true as const,
    privacyPolicyVersion: '2026-09-21.1',
    termsVersion: '2026-09-21.1',
  }

  it('accepts a valid Kenya registration payload', () => {
    const r = parseRegisterBody(good)
    expect(r.email).toBe('member@example.com')
    expect(r.phone).toBe('0712345678')
    expect(r.idNumber).toBe('12345678')
    expect(r.acceptedPrivacy).toBe(true)
    expect(r.acceptedTerms).toBe(true)
  })

  it('rejects weak passwords and bad phones', () => {
    expect(() => parseRegisterBody({ ...good, password: 'short' })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...good, phone: '123' })).toThrow(ValidationError)
  })

  it('rejects missing or invalid National ID', () => {
    expect(() => parseRegisterBody({ ...good, idNumber: '' })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...good, idNumber: '12' })).toThrow(ValidationError)
  })

  it('requires privacy and terms consent', () => {
    expect(() => parseRegisterBody({ ...good, acceptedPrivacy: false })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...good, acceptedTerms: false })).toThrow(ValidationError)
    const { acceptedPrivacy: _p, acceptedTerms: _t, ...without } = good
    expect(() => parseRegisterBody(without)).toThrow(ValidationError)
  })
})
