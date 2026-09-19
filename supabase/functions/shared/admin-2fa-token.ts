/**
 * Admin 2FA step-up tokens.
 *
 * After TOTP verify, mint a short-lived HMAC token. Sensitive admin Edge
 * Functions require this token when two_factor_enabled is true.
 *
 * Header: x-admin-2fa-token: <base64url(payload).base64url(sig)>
 * Payload: adminId:expUnixSeconds
 */

const STEP_UP_TTL_SECONDS = 60 * 60 * 8 // 8 hours

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function getStepUpSecret(): string {
  return (
    Deno.env.get('ADMIN_2FA_STEPUP_SECRET')?.trim() ||
    Deno.env.get('OTP_HASH_SECRET')?.trim() ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
    ''
  )
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return toBase64Url(new Uint8Array(sig))
}

export async function mintAdmin2faStepUpToken(adminId: string): Promise<{ token: string; expires_at: number }> {
  const secret = getStepUpSecret()
  if (!secret) {
    throw new Error('ADMIN_2FA_STEPUP_SECRET (or OTP_HASH_SECRET / service role) is not configured')
  }
  const expires_at = Math.floor(Date.now() / 1000) + STEP_UP_TTL_SECONDS
  const payload = `${adminId}:${expires_at}`
  const sig = await hmacSign(secret, payload)
  return { token: `${toBase64Url(new TextEncoder().encode(payload))}.${sig}`, expires_at }
}

export async function verifyAdmin2faStepUpToken(adminId: string, token: string | null): Promise<boolean> {
  if (!token) return false
  const secret = getStepUpSecret()
  if (!secret) return false

  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payloadB64, sig] = parts

  let payload: string
  try {
    payload = new TextDecoder().decode(fromBase64Url(payloadB64))
  } catch {
    return false
  }

  const expectedSig = await hmacSign(secret, payload)
  if (!timingSafeEqual(sig, expectedSig)) return false

  const [id, expStr] = payload.split(':')
  if (id !== adminId) return false
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  return true
}

export function extractAdmin2faStepUpToken(req: Request): string | null {
  return req.headers.get('x-admin-2fa-token')?.trim() || null
}
