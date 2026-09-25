/**
 * M-Pesa / Daraja runtime configuration.
 * Secrets stay in Edge env. Never default sandbox ↔ production.
 */

export const MPESA_SANDBOX_BASE = 'https://sandbox.safaricom.co.ke'
export const MPESA_PRODUCTION_BASE = 'https://api.safaricom.co.ke'

export const REQUIRED_MPESA_SECRET_NAMES = [
  'MPESA_CONSUMER_KEY',
  'MPESA_CONSUMER_SECRET',
  'MPESA_SHORTCODE',
  'MPESA_PASSKEY',
  'MPESA_CALLBACK_URL',
] as const

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

export type MpesaRuntimeOk = {
  ok: true
  enabled: true
  env: MpesaEnvName
  baseUrl: string
  consumerKey: string
  consumerSecret: string
  shortcode: string
  passkey: string
  callbackUrl: string
}

export type MpesaRuntime =
  | { ok: true; enabled: false }
  | MpesaRuntimeOk
  | { ok: false; enabled: boolean; code: 'PAYMENTS_MISCONFIGURED'; message: string }

export function resolveMpesaRuntime(envMap: Record<string, string | undefined>): MpesaRuntime {
  if (!paymentsAreEnabled(envMap.PAYMENTS_ENABLED)) {
    return { ok: true, enabled: false }
  }

  const env = parseMpesaEnv(envMap.MPESA_ENV)
  if (!env) {
    return {
      ok: false,
      enabled: true,
      code: 'PAYMENTS_MISCONFIGURED',
      message: 'M-Pesa environment is not configured. Set MPESA_ENV to sandbox or production.',
    }
  }

  const missing = REQUIRED_MPESA_SECRET_NAMES.filter((name) => !envMap[name]?.trim())
  if (missing.length > 0) {
    return {
      ok: false,
      enabled: true,
      code: 'PAYMENTS_MISCONFIGURED',
      message: 'M-Pesa is enabled but required secrets are missing.',
    }
  }

  return {
    ok: true,
    enabled: true,
    env,
    baseUrl: darajaBaseUrl(env),
    consumerKey: envMap.MPESA_CONSUMER_KEY!.trim(),
    consumerSecret: envMap.MPESA_CONSUMER_SECRET!.trim(),
    shortcode: envMap.MPESA_SHORTCODE!.trim(),
    passkey: envMap.MPESA_PASSKEY!.trim(),
    callbackUrl: envMap.MPESA_CALLBACK_URL!.trim(),
  }
}

export function loadMpesaRuntime(): MpesaRuntime {
  return resolveMpesaRuntime({
    PAYMENTS_ENABLED: Deno.env.get('PAYMENTS_ENABLED'),
    MPESA_ENV: Deno.env.get('MPESA_ENV'),
    MPESA_CONSUMER_KEY: Deno.env.get('MPESA_CONSUMER_KEY'),
    MPESA_CONSUMER_SECRET: Deno.env.get('MPESA_CONSUMER_SECRET'),
    MPESA_SHORTCODE: Deno.env.get('MPESA_SHORTCODE'),
    MPESA_PASSKEY: Deno.env.get('MPESA_PASSKEY'),
    MPESA_CALLBACK_URL: Deno.env.get('MPESA_CALLBACK_URL'),
  })
}

export function publicPaymentGate(runtime: MpesaRuntime): {
  payments_enabled: boolean
  mpesa_environment: MpesaEnvName | null
} {
  if (runtime.ok && runtime.enabled) {
    return { payments_enabled: true, mpesa_environment: runtime.env }
  }
  return { payments_enabled: false, mpesa_environment: null }
}

export class DarajaRequestError extends Error {
  readonly kind: 'oauth' | 'stk' | 'timeout' | 'network' | 'malformed'
  constructor(kind: DarajaRequestError['kind']) {
    super('M-Pesa request failed')
    this.name = 'DarajaRequestError'
    this.kind = kind
  }
}

export function darajaUserMessage(kind: DarajaRequestError['kind'] | 'stk_rejected'): string {
  if (kind === 'timeout') return 'M-Pesa timed out. Please try again.'
  if (kind === 'network') return 'Could not reach M-Pesa. Please try again.'
  if (kind === 'malformed') return 'M-Pesa returned an unexpected response. Please try again.'
  if (kind === 'stk' || kind === 'stk_rejected') return 'Failed to initiate M-Pesa payment. Please try again.'
  return 'Could not authenticate with M-Pesa. Please try again.'
}

export async function getDarajaAccessToken(runtime: MpesaRuntimeOk): Promise<string> {
  const auth = btoa(`${runtime.consumerKey}:${runtime.consumerSecret}`)
  let res: Response
  try {
    res = await fetch(`${runtime.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new DarajaRequestError('timeout')
    }
    throw new DarajaRequestError('network')
  }

  if (!res.ok) throw new DarajaRequestError('oauth')

  let data: { access_token?: unknown }
  try {
    data = await res.json()
  } catch {
    throw new DarajaRequestError('malformed')
  }

  if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
    throw new DarajaRequestError('malformed')
  }
  return data.access_token
}

export function generateMpesaPassword(shortcode: string, passkey: string, timestamp: string): string {
  return btoa(`${shortcode}${passkey}${timestamp}`)
}

export function formatMpesaPhone(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '')
  if (cleaned.startsWith('254')) return cleaned
  if (cleaned.startsWith('0')) return `254${cleaned.slice(1)}`
  return cleaned
}

export function generateMpesaTimestamp(): string {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
}

export async function sendStkPush(
  runtime: MpesaRuntimeOk,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<{ checkoutRequestId: string }> {
  let res: Response
  try {
    res = await fetch(`${runtime.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new DarajaRequestError('timeout')
    }
    throw new DarajaRequestError('network')
  }

  let data: { ResponseCode?: unknown; CheckoutRequestID?: unknown }
  try {
    data = await res.json()
  } catch {
    throw new DarajaRequestError('malformed')
  }

  if (!res.ok || data.ResponseCode !== '0' || typeof data.CheckoutRequestID !== 'string' || !data.CheckoutRequestID) {
    throw new DarajaRequestError('stk')
  }

  return { checkoutRequestId: data.CheckoutRequestID }
}
