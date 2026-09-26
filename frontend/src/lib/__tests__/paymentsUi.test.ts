import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isPaymentsUiMock,
  preferStkPaymentUi,
  PAYMENTS_DISABLED_COPY,
  PAYMENTS_ENABLED_COPY,
  PAYMENTS_MOCK_COPY,
  PAYMENTS_SANDBOX_BADGE,
  ACTIVATION_FEE_HONEST_COPY,
  activationFeeCopy,
  activationFeeHonestCopy,
  isSandboxPayments,
  resolvePaymentsMode,
} from '../paymentsUi'

describe('paymentsUi', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PAYMENTS_UI_MOCK', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('exposes safe disabled and mock copy', () => {
    expect(PAYMENTS_DISABLED_COPY).toMatch(/not enabled/i)
    expect(PAYMENTS_MOCK_COPY).toMatch(/mock/i)
    expect(PAYMENTS_MOCK_COPY).toMatch(/not activated/i)
    expect(ACTIVATION_FEE_HONEST_COPY).toMatch(/not live/i)
  })

  it('isPaymentsUiMock is false by default', () => {
    vi.stubEnv('VITE_PAYMENTS_UI_MOCK', '')
    expect(isPaymentsUiMock()).toBe(false)
    expect(preferStkPaymentUi()).toBe(false)
    expect(preferStkPaymentUi(true)).toBe(true)
  })

  it('isPaymentsUiMock is true when env is true', () => {
    vi.stubEnv('VITE_PAYMENTS_UI_MOCK', 'true')
    expect(isPaymentsUiMock()).toBe(true)
    expect(preferStkPaymentUi()).toBe(true)
  })

  it('exposes an enabled copy and a sandbox badge label', () => {
    expect(PAYMENTS_ENABLED_COPY).toMatch(/are on/i)
    expect(PAYMENTS_SANDBOX_BADGE).toMatch(/sandbox/i)
  })

  describe('resolvePaymentsMode', () => {
    it('is disabled when the server flag is absent or false', () => {
      expect(resolvePaymentsMode()).toBe('disabled')
      expect(resolvePaymentsMode(false)).toBe('disabled')
    })

    it('is enabled when the server reports payments enabled', () => {
      expect(resolvePaymentsMode(true)).toBe('enabled')
    })

    it('is mock only when the local preview flag is on, even if the server is enabled', () => {
      vi.stubEnv('VITE_PAYMENTS_UI_MOCK', 'true')
      expect(resolvePaymentsMode(true)).toBe('mock')
      expect(resolvePaymentsMode(false)).toBe('mock')
    })

    it('never reports enabled from the mock flag alone', () => {
      vi.stubEnv('VITE_PAYMENTS_UI_MOCK', '')
      expect(resolvePaymentsMode(undefined)).toBe('disabled')
    })
  })

  describe('isSandboxPayments', () => {
    it('is true only for enabled payments on the sandbox', () => {
      expect(isSandboxPayments(true, 'sandbox')).toBe(true)
    })

    it('is false for disabled payments, production, or a missing environment', () => {
      expect(isSandboxPayments(false, 'sandbox')).toBe(false)
      expect(isSandboxPayments(true, 'production')).toBe(false)
      expect(isSandboxPayments(true, null)).toBe(false)
      expect(isSandboxPayments(true)).toBe(false)
    })
  })

  describe('activationFeeCopy', () => {
    it('keeps the honest not-live wording when payments are off', () => {
      expect(activationFeeCopy(false, 300)).toBe(activationFeeHonestCopy(300))
      expect(activationFeeCopy(false, 300)).toMatch(/not live/i)
    })

    it('offers online payment when the server reports payments enabled', () => {
      const copy = activationFeeCopy(true, 300)
      expect(copy).toMatch(/KSh 300/)
      expect(copy).toMatch(/STK push/i)
      expect(copy).not.toMatch(/not live/i)
    })

    it('falls back to a generic fee label when the amount is unknown', () => {
      expect(activationFeeCopy(true)).toMatch(/one-time activation fee/i)
    })
  })
})
