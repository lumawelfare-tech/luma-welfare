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
 */

export const OTP_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5
export const RESEND_COOLDOWN_SECONDS = 60
export const RESEND_HOURLY_LIMIT = 3

const CODE_SPACE = 1_000_000

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

/**
 * Resolve the HMAC secret. Prefers the dedicated OTP_HASH_SECRET; falls back
 * to a key derived from the service role key so the flow works without extra
 * configuration. Never exposed to clients — this module is server-side only.
 */
async function getHmacKey(): Promise<CryptoKey> {
  let secret = Deno.env.get('OTP_HASH_SECRET')
  if (!secret) {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'luma-local-dev'
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`luma-otp-pepper:${serviceKey}`),
    )
    secret = toHex(digest)
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/** HMAC-SHA256 hash of the code bound to the user id. */
export async function hashOtp(userId: string, code: string): Promise<string> {
  const key = await getHmacKey()
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
): Promise<boolean> {
  const computed = await hashOtp(userId, code)
  if (!storedHash || storedHash.length !== computed.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ storedHash.charCodeAt(i)
  }
  return diff === 0
}
