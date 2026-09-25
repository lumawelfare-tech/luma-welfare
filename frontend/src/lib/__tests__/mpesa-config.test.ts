/**
 * Sandbox/production M-Pesa gate + payment API contracts.
 * Offline only — no Daraja credentials or live STK.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  MPESA_PRODUCTION_BASE,
  MPESA_SANDBOX_BASE,
  darajaBaseUrl,
  parseMpesaEnv,
  paymentsAreEnabled,
  resolveMpesaRuntime,
} from '../mpesaConfig'
import { preferStkPaymentUi } from '../paymentsUi'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

const sandboxReady = {
  PAYMENTS_ENABLED: 'true',
  MPESA_ENV: 'sandbox',
  hasAllSecrets: true,
}

describe('M-Pesa configuration', () => {
  it('enables only the exact PAYMENTS_ENABLED=true flag', () => {
    expect(paymentsAreEnabled(undefined)).toBe(false)
    expect(paymentsAreEnabled('')).toBe(false)
    expect(paymentsAreEnabled('false')).toBe(false)
    expect(paymentsAreEnabled('TRUE')).toBe(false)
    expect(paymentsAreEnabled('true')).toBe(true)
  })

  it('requires an explicit MPESA_ENV and never defaults either side', () => {
    expect(parseMpesaEnv(undefined)).toBeNull()
    expect(parseMpesaEnv('')).toBeNull()
    expect(parseMpesaEnv('Sandbox')).toBeNull()
    expect(parseMpesaEnv('prod')).toBeNull()
    expect(parseMpesaEnv('sandbox')).toBe('sandbox')
    expect(parseMpesaEnv('production')).toBe('production')
  })

  it('keeps sandbox and production Daraja hosts isolated', () => {
    expect(darajaBaseUrl('sandbox')).toBe(MPESA_SANDBOX_BASE)
    expect(darajaBaseUrl('production')).toBe(MPESA_PRODUCTION_BASE)
    expect(MPESA_SANDBOX_BASE).not.toBe(MPESA_PRODUCTION_BASE)
    expect(resolveMpesaRuntime(sandboxReady)).toEqual({
      ok: true,
      enabled: true,
      env: 'sandbox',
      baseUrl: MPESA_SANDBOX_BASE,
    })
    expect(resolveMpesaRuntime({ ...sandboxReady, MPESA_ENV: 'production' })).toEqual({
      ok: true,
      enabled: true,
      env: 'production',
      baseUrl: MPESA_PRODUCTION_BASE,
    })
  })

  it('fails closed when payments are on but secrets or env are missing', () => {
    expect(resolveMpesaRuntime({ PAYMENTS_ENABLED: 'true' }).ok).toBe(false)
    expect(resolveMpesaRuntime({ PAYMENTS_ENABLED: 'true', MPESA_ENV: 'sandbox', hasAllSecrets: false }).ok).toBe(false)
    expect(resolveMpesaRuntime({ PAYMENTS_ENABLED: 'false', MPESA_ENV: 'production' })).toEqual({
      ok: true,
      enabled: false,
    })
  })

  it('keeps frontend and Edge parsers in sync', () => {
    const edge = read('supabase/functions/shared/mpesa-config.ts')
    expect(edge).toContain("export const MPESA_SANDBOX_BASE = 'https://sandbox.safaricom.co.ke'")
    expect(edge).toContain("export const MPESA_PRODUCTION_BASE = 'https://api.safaricom.co.ke'")
    expect(edge).toContain('flag === \'true\'')
    expect(edge).toContain("value === 'sandbox' || value === 'production'")
    expect(edge).not.toContain("?? 'sandbox'")
    expect(edge).not.toContain("?? \"sandbox\"")
    expect(edge).toContain('AbortSignal.timeout')
    expect(edge).toContain("typeof data.access_token !== 'string'")
    expect(edge).not.toMatch(/console\.(log|error|info|warn).*access_token/)
    expect(edge).toContain('REQUIRED_MPESA_SECRET_NAMES')
  })
})

describe('payment initiate / callback contracts', () => {
  it('initiate ignores client amount and uses the subscription tier', () => {
    const src = read('supabase/functions/payments-initiate/index.ts')
    expect(src).toContain("PAYMENTS_ENABLED') !== 'true'")
    expect(src).toContain('loadMpesaRuntime')
    expect(src).toContain("from('package_tiers')")
    expect(src).toContain(".select('amount')")
    expect(src).toContain('Never trust client amount')
    expect(src).not.toMatch(/body\.amount/)
    expect(src).not.toMatch(/const amount = body/)
    expect(src).toContain('handleUnexpectedError')
    expect(src).not.toContain('err.message')
  })

  it('callback stays secret-gated, idempotent, and fail-closed when disabled', () => {
    const src = read('supabase/functions/payments-callback/index.ts')
    expect(src).toContain('MPESA_CALLBACK_SECRET')
    expect(src).toContain('authorizeCallback')
    expect(src).toContain("PAYMENTS_ENABLED') !== 'true'")
    expect(src).toContain('process_payment_callback_v2')
    expect(src).toContain("status === 'processed'")
    expect(src).toContain('Already processed')
    expect(src).not.toMatch(/access_token/)
  })

  it('callback RPC rejects unknown payments, duplicates, and amount mismatches', () => {
    const sql = read('supabase/migrations/20260827100000_phase7_financial_ledger.sql')
    expect(sql).toContain('Payment not found')
    expect(sql).toContain("v_payment.status = 'Completed'")
    expect(sql).toContain('Already processed')
    expect(sql).toContain('Amount mismatch')
    expect(sql).toContain("to_char(now(), 'YYYY-MM')")
    expect(sql).toContain('ON CONFLICT (subscription_id, period) DO NOTHING')
  })

  it('payment state machine allows only pending terminal moves', () => {
    const sql = read('supabase/migrations/20260918120650_restore_missing_part1_payments.sql')
    expect(sql).toContain("OLD.status = 'Pending' AND NEW.status IN ('Completed', 'Failed', 'Cancelled', 'Timeout')")
    expect(sql).toContain("OLD.status = 'Completed' AND NEW.status = 'Reversed'")
    expect(sql).toContain('Invalid payment status transition')
  })

  it('payment APIs have no monthly skip or waive path', () => {
    const initiate = read('supabase/functions/payments-initiate/index.ts')
    const callback = read('supabase/functions/payments-callback/index.ts')
    expect(initiate).not.toMatch(/skipMonth|waive|markPaid|bypass/i)
    expect(callback).not.toMatch(/skipMonth|waive|markPaid|bypass/i)
  })
})

describe('STK UI follows server gate', () => {
  it('does not lead with STK unless mock mode or server payments are enabled', () => {
    expect(preferStkPaymentUi()).toBe(false)
    expect(preferStkPaymentUi(false)).toBe(false)
    expect(preferStkPaymentUi(true)).toBe(true)
  })
})
