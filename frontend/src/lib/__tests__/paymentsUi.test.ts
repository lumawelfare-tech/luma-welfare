import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isPaymentsUiMock,
  preferStkPaymentUi,
  PAYMENTS_DISABLED_COPY,
  PAYMENTS_MOCK_COPY,
  ACTIVATION_FEE_HONEST_COPY,
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
})
