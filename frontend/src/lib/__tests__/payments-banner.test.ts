/**
 * Payments banner contract: the dashboard must reflect mock / enabled / disabled
 * instead of unconditionally claiming M-Pesa is not enabled.
 * Offline only — reads source, never calls Daraja.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

const dashboard = read('frontend/src/pages/member/Dashboard.tsx')
const paymentsUi = read('frontend/src/lib/paymentsUi.ts')
const banner = read('frontend/src/components/PaymentsModeBanner.tsx')

describe('payments banner three-state rendering', () => {
  it('renders the shared banner instead of hand-rolled mock/disabled blocks', () => {
    expect(dashboard).toContain('<PaymentsModeBanner')
    expect(dashboard).not.toContain('!isPaymentsUiMock() && (')
    expect(dashboard).not.toContain('PAYMENTS_MOCK_COPY')
    expect(dashboard).not.toContain('ACTIVATION_FEE_HONEST_COPY')
  })

  it('passes the effective server flag and environment into the banner', () => {
    expect(dashboard).toContain('serverPaymentsEnabled={paymentsOn}')
    expect(dashboard).toContain('mpesaEnvironment={serverMpesaEnv}')
    expect(dashboard).toContain('mpesa_environment?: string | null')
  })

  it('drives the activation-fee copy from the server gate', () => {
    expect(dashboard).toContain('activationFeeCopy(paymentsOn')
  })

  it('offers the sandbox badge on every online payment surface', () => {
    expect(dashboard).toContain('<PaymentsSandboxBadge')
    expect(banner).toContain('isSandboxPayments(serverPaymentsEnabled, mpesaEnvironment)')
  })

  it('only keeps disabled copy for error messages, never as a banner', () => {
    const usages = dashboard.match(/PAYMENTS_DISABLED_COPY/g) ?? []
    // Import + registration-fee failure + contribution failure + disabled pay panel.
    expect(usages).toHaveLength(4)
    expect(dashboard).not.toMatch(/!\s*isPaymentsUiMock\(\)[\s\S]{0,200}PAYMENTS_DISABLED_COPY/)
  })

  it('exposes the mode helpers used by the banner', () => {
    expect(paymentsUi).toContain("export type PaymentsMode = 'mock' | 'enabled' | 'disabled'")
    expect(paymentsUi).toContain('export function resolvePaymentsMode')
    expect(paymentsUi).toContain('export function isSandboxPayments')
    expect(paymentsUi).toContain('export const PAYMENTS_ENABLED_COPY')
  })
})
