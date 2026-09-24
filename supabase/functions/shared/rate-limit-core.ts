/**
 * Pure rate-limit helpers (no Deno / network imports).
 * Used by Edge rate-limit.ts and Vitest.
 */

export type MemoryEntry = { count: number; resetAt: number }

export type MemoryConsumeResult = {
  ok: boolean
  remaining: number
  resetAt: number
  count: number
}

/**
 * Operations that require distributed (Postgres) rate limiting in production.
 * If the RPC is unavailable, these fail closed — no silent memory fallback.
 */
export const FAIL_CLOSED_IDENTIFIERS = new Set([
  'auth-login',
  'login',
  'auth-register',
  'register',
  'auth-verify-email',
  'auth-verify-email-resend',
  'auth-forgot-password',
  'contact',
  'admin-2fa',
  'member-claims-upload',
  'member-identity-docs',
  'payments-initiate',
  'admin-settings-mutation',
  'admin-members-mutation',
  'admin-packages-mutation',
  'admin-subscriptions-mutation',
  'admin-claims-mutation',
  'admin-contributions-mutation',
  'admin-news-mutation',
  'admin-media-mutation',
  'admin-gallery-mutation',
  'admin-reconciliation-mutation',
  'admin-scheduled-reports-mutation',
  'admin-exports',
  'admin-webhook-test',
  'manage-user-role',
])

/**
 * Resolve rate-limit subject.
 *
 * Prefer authenticated user id. For anonymous traffic, prefer CF-Connecting-IP
 * when present (CDN-set). Intentionally ignore X-Forwarded-For — spoofable by
 * clients calling Edge Functions directly. Supabase does not expose a
 * documented platform-verified client IP API; without CF, use shared
 * `ip:untrusted` (no false per-IP guarantee).
 */
export function resolveRateLimitSubject(req: Request, userId?: string): string {
  if (userId && userId.trim()) return `user:${userId.trim()}`
  const cf = req.headers.get('cf-connecting-ip')?.trim()
  if (cf) return `ip:${cf}`
  // Intentionally ignore X-Forwarded-For — spoofable
  return 'ip:untrusted'
}

/**
 * Atomic-in-process memory bucket consume (single isolate only).
 * Used as degraded fallback ONLY for non-fail-closed identifiers,
 * or when explicitly allowed for local/dev tests.
 */
export function memoryConsume(
  store: Map<string, MemoryEntry>,
  key: string,
  windowMs: number,
  max: number,
  now: number = Date.now(),
): MemoryConsumeResult {
  const entry = store.get(key)
  let count: number
  let resetAt: number

  if (!entry || entry.resetAt < now) {
    count = 1
    resetAt = now + windowMs
    store.set(key, { count, resetAt })
  } else if (entry.count >= max) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt, count: entry.count }
  } else {
    count = entry.count + 1
    resetAt = entry.resetAt
    store.set(key, { count, resetAt })
  }

  return { ok: true, remaining: Math.max(max - count, 0), resetAt, count }
}

export function isFailClosedIdentifier(identifier: string): boolean {
  return FAIL_CLOSED_IDENTIFIERS.has(identifier)
}
