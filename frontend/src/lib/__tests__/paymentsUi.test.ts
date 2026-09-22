import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isPaymentsUiMock, PAYMENTS_DISABLED_COPY, PAYMENTS_MOCK_COPY } from '../paymentsUi'

describe('paymentsUi', () => {
  const env = import.meta.env as Record<string, string | undefined>

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
  })

  it('isPaymentsUiMock is false by default', () => {
    env.VITE_PAYMENTS_UI_MOCK = undefined
    // Re-read via stub
    vi.stubEnv('VITE_PAYMENTS_UI_MOCK', '')
    expect(isPaymentsUiMock()).toBe(false)
  })

  it('isPaymentsUiMock is true when env is true', () => {
    vi.stubEnv('VITE_PAYMENTS_UI_MOCK', 'true')
    expect(isPaymentsUiMock()).toBe(true)
  })
})
