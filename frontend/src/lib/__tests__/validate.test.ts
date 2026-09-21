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
  }

  it('accepts a valid Kenya registration payload', () => {
    const r = parseRegisterBody(good)
    expect(r.email).toBe('member@example.com')
    expect(r.phone).toBe('0712345678')
  })

  it('rejects weak passwords and bad phones', () => {
    expect(() => parseRegisterBody({ ...good, password: 'short' })).toThrow(ValidationError)
    expect(() => parseRegisterBody({ ...good, phone: '123' })).toThrow(ValidationError)
  })
})
