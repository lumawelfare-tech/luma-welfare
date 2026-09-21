/**
 * Shared OTP helpers for Luma Welfare email verification.
 *
 * Security model:
 *  - Codes are generated with a CSPRNG (crypto.getRandomValues) using
 *    rejection sampling, so all 1,000,000 codes are equiprobable.
 *  - Codes are stored ONLY as HMAC-SHA256(userId:code) — a database leak
 *    cannot reveal usable codes (unlike a bare SHA-256 of a 6-digit code,
 *    which is trivially brute-forced offline).
 *  - Comparison is constant-time to avoid timing oracles.
 *  - TTL, attempt caps and resend limits are enforced server-side by the
 *    auth-verify-email Edge Function using these constants.
 *  - OTP_HASH_SECRET is required in production (fail closed).
 *  - Local-only fallback requires OTP_ALLOW_LOCAL_DEV_FALLBACK=true AND a
 *    local Supabase URL. Never derives from the service-role key.
 */

export const OTP_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5
export const RESEND_COOLDOWN_SECONDS = 60
export const RESEND_HOURLY_LIMIT = 3

/** Documented local-only HMAC pepper — never used unless local-dev gate passes. */
export const LOCAL_DEV_OTP_PEPPER = 'luma-local-dev-otp-pepper'

const CODE_SPACE = 1_000_000

export class OtpConfigError extends Error {
  readonly code = 'OTP_CONFIG'
  constructor(message = 'OTP hashing is not configured.') {
    super(message)
    this.name = 'OtpConfigError'
  }
}

/**
 * Generate a cryptographically random 6-digit code (000000–999999).
 * Rejection sampling removes the modulo bias of `value % 1_000_000`.
 */
export function generateOtp(): string {
  const limit = Math.floor(0x1_0000_0000 / CODE_SPACE) * CODE_SPACE
  const buf = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buf)
    value = buf[0]
  } while (value >= limit)
  return String(value % CODE_SPACE).padStart(6, '0')
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

/** True only for explicit local-dev gate + local Supabase URL. */
export function isOtpLocalDevFallbackAllowed(
  env: { get(name: string): string | undefined } = Deno.env,
): boolean {
  if (env.get('OTP_ALLOW_LOCAL_DEV_FALLBACK') !== 'true') return false
  const url = (env.get('SUPABASE_URL') ?? '').toLowerCase()
  return (
    url.includes('127.0.0.1') ||
    url.includes('localhost') ||
    url.includes('0.0.0.0')
  )
}

/**
 * Resolve the HMAC secret. Production requires OTP_HASH_SECRET.
 * Never uses the service-role key or other credentials as the pepper.
 */
export function resolveOtpHmacSecret(
  env: { get(name: string): string | undefined } = Deno.env,
): string {
  const secret = env.get('OTP_HASH_SECRET')?.trim()
  if (secret) return secret

  if (isOtpLocalDevFallbackAllowed(env)) {
    return LOCAL_DEV_OTP_PEPPER
  }

  throw new OtpConfigError(
    'OTP_HASH_SECRET is required. Set it in Edge Function secrets.',
  )
}

async function getHmacKey(
  env: { get(name: string): string | undefined } = Deno.env,
): Promise<CryptoKey> {
  const secret = resolveOtpHmacSecret(env)
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/** HMAC-SHA256 hash of the code bound to the user id. */
export async function hashOtp(
  userId: string,
  code: string,
  env?: { get(name: string): string | undefined },
): Promise<string> {
  const key = await getHmacKey(env)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${userId}:${code}`),
  )
  return toHex(signature)
}

/**
 * Constant-time comparison of a candidate code against a stored hash.
 * Always computes the HMAC (even for absent hashes) to keep timing uniform.
 */
export async function otpMatches(
  userId: string,
  code: string,
  storedHash: string | null,
  env?: { get(name: string): string | undefined },
): Promise<boolean> {
  const computed = await hashOtp(userId, code, env)
  if (!storedHash || storedHash.length !== computed.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ storedHash.charCodeAt(i)
  }
  return diff === 0
}
