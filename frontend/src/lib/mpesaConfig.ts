/**
 * Pure M-Pesa environment rules shared with Edge `shared/mpesa-config.ts`.
 * No secrets. Never used to call Daraja from the browser.
 */

export const MPESA_SANDBOX_BASE = 'https://sandbox.safaricom.co.ke'
export const MPESA_PRODUCTION_BASE = 'https://api.safaricom.co.ke'

export type MpesaEnvName = 'sandbox' | 'production'

export function paymentsAreEnabled(flag: string | null | undefined): boolean {
  return flag === 'true'
}

/** Explicit only — never default sandbox or production. */
export function parseMpesaEnv(raw: string | null | undefined): MpesaEnvName | null {
  const value = raw?.trim()
  if (value === 'sandbox' || value === 'production') return value
  return null
}

export function darajaBaseUrl(env: MpesaEnvName): string {
  return env === 'production' ? MPESA_PRODUCTION_BASE : MPESA_SANDBOX_BASE
}

export type MpesaRuntimeDecision =
  | { ok: true; enabled: false }
  | { ok: true; enabled: true; env: MpesaEnvName; baseUrl: string }
  | { ok: false; code: 'PAYMENTS_MISCONFIGURED' }

export function resolveMpesaRuntime(envMap: {
  PAYMENTS_ENABLED?: string
  MPESA_ENV?: string
  hasAllSecrets?: boolean
}): MpesaRuntimeDecision {
  if (!paymentsAreEnabled(envMap.PAYMENTS_ENABLED)) {
    return { ok: true, enabled: false }
  }
  const env = parseMpesaEnv(envMap.MPESA_ENV)
  if (!env) return { ok: false, code: 'PAYMENTS_MISCONFIGURED' }
  if (envMap.hasAllSecrets === false) {
    return { ok: false, code: 'PAYMENTS_MISCONFIGURED' }
  }
  return { ok: true, enabled: true, env, baseUrl: darajaBaseUrl(env) }
}
