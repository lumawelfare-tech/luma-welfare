import { describe, it, expect } from 'vitest'
import {
  parseRegistrationFeeSetting,
  RegistrationFeeConfigError,
} from '../../../../supabase/functions/shared/registration-fee.ts'
import {
  clearPendingApplication,
  parsePendingApplication,
  PENDING_APPLICATION_STORAGE_KEY,
  resolvePendingApplication,
  writePendingApplication,
} from '../pendingApplication'

describe('parseRegistrationFeeSetting', () => {
  it('accepts configured KES 300', () => {
    expect(parseRegistrationFeeSetting({ amount: 300, currency: 'KES' })).toEqual({
      amount: 300,
      currency: 'KES',
    })
  })

  it('accepts another valid whole-KES amount (no hardcode dependency)', () => {
    expect(parseRegistrationFeeSetting({ amount: 500, currency: 'kes' })).toEqual({
      amount: 500,
      currency: 'KES',
    })
  })

  it('fails closed when missing', () => {
    expect(() => parseRegistrationFeeSetting(null)).toThrow(RegistrationFeeConfigError)
    expect(() => parseRegistrationFeeSetting(undefined)).toThrow(RegistrationFeeConfigError)
  })

  it('fails closed when malformed', () => {
    expect(() => parseRegistrationFeeSetting({ amount: 'abc', currency: 'KES' })).toThrow(
      RegistrationFeeConfigError,
    )
    expect(() => parseRegistrationFeeSetting({ amount: 300, currency: 'USD' })).toThrow(
      RegistrationFeeConfigError,
    )
    expect(() => parseRegistrationFeeSetting({ amount: 12.5, currency: 'KES' })).toThrow(
      RegistrationFeeConfigError,
    )
    expect(() => parseRegistrationFeeSetting({ amount: -1, currency: 'KES' })).toThrow(
      RegistrationFeeConfigError,
    )
  })
})

describe('auth-register fee authority (static)', () => {
  it('loads fee from platform_settings helper and does not hardcode insert amount 300', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(import.meta.dirname, '../../../../supabase/functions/auth-register/index.ts'),
      'utf-8',
    )
    expect(src).toContain('loadRegistrationFeeConfig')
    expect(src).toContain('amount: registrationFee.amount')
    expect(src).not.toMatch(/amount:\s*300/)
    expect(src).not.toMatch(/^\s*userId,/m)
    expect(src).toContain('applicationNumber')
    expect(src).toContain('registrationFee:')
    expect(src).toMatch(/return json\(201, \{[\s\S]*applicationNumber[\s\S]*\}\)/)
    expect(src).not.toMatch(/return json\(201, \{[\s\S]*userId[\s\S]*\}\)/)
  })

  it('member-registration-fee uses configured amount', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(import.meta.dirname, '../../../../supabase/functions/member-registration-fee/index.ts'),
      'utf-8',
    )
    expect(src).toContain('loadRegistrationFeeConfig')
    expect(src).not.toMatch(/amount:\s*300/)
    expect(src).not.toMatch(/Amount:\s*300/)
    expect(src).toContain("PAYMENTS_ENABLED') === 'true'")
  })
})

describe('pendingApplication session helpers', () => {
  it('parses server-shaped application numbers only', () => {
    expect(
      parsePendingApplication({
        email: 'a@b.co',
        applicationNumber: 'LUMA-APP-20260922-00001',
      }),
    ).toEqual({
      email: 'a@b.co',
      applicationNumber: 'LUMA-APP-20260922-00001',
      registrationFee: undefined,
    })
    expect(
      parsePendingApplication({
        email: 'a@b.co',
        applicationNumber: 'FAKE-123',
      }),
    ).toBeNull()
  })

  it('does not fabricate when state and storage are empty', () => {
    clearPendingApplication()
    expect(
      resolvePendingApplication({
        stateEmail: 'a@b.co',
        stateApplicationNumber: null,
      }),
    ).toBeNull()
  })

  it('round-trips via sessionStorage without secrets', () => {
    clearPendingApplication()
    writePendingApplication({
      email: 'Member@Example.com',
      applicationNumber: 'LUMA-APP-20260922-00042',
      registrationFee: { amount: 300, currency: 'KES' },
    })
    const raw = sessionStorage.getItem(PENDING_APPLICATION_STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(raw).not.toMatch(/password|otp|token|service/i)
    const resolved = resolvePendingApplication({ stateEmail: 'member@example.com' })
    expect(resolved?.applicationNumber).toBe('LUMA-APP-20260922-00042')
    expect(resolved?.registrationFee).toEqual({ amount: 300, currency: 'KES' })
    clearPendingApplication()
  })
})
