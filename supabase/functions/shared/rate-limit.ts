/**
 * Distributed rate limiting via Postgres RPC `consume_rate_limit`.
 *
 * Identity:
 * - Prefer authenticated subject (`user:<id>`) for authenticated routes.
 * - Prefer `cf-connecting-ip` when present (CDN-set; not claimed as
 *   Supabase platform-verified — Edge has no documented trusted IP API).
 * - Do NOT trust `X-Forwarded-For` (spoofable at the Edge).
 * - When no trusted IP exists, use `ip:untrusted` (shared bucket — fail-safe).
 *
 * Production behavior when RPC is unavailable:
 * - Auth, payments, and admin mutations → FAIL CLOSED (503).
 * - Memory fallback is NOT used for those identifiers (avoids a false
 *   sense of distributed protection across isolates).
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from './cors.ts'
import {
  memoryConsume,
  resolveRateLimitSubject,
  isFailClosedIdentifier,
  type MemoryEntry,
} from './rate-limit-core.ts'

export { resolveRateLimitSubject, isFailClosedIdentifier, FAIL_CLOSED_IDENTIFIERS } from './rate-limit-core.ts'

export type RateLimitOptions = {
  /** Time window in milliseconds (default: 60_000). */
  windowMs?: number
  /** Max requests per window (default: 60). */
  max?: number
  /** Custom key prefix. */
  keyPrefix?: string
  /** Authenticated subject (user id) when available. */
  userId?: string
  /** Optional pre-built admin/service client. */
  adminClient?: SupabaseClient
  /**
   * When true, fail closed if Postgres RPC is unavailable.
   * Defaults to true for FAIL_CLOSED_IDENTIFIERS.
   */
  requireDistributed?: boolean
}

export type RateLimitResult = {
  ok: boolean
  remaining: number
  resetAt: number
  response?: Response
  source: 'db' | 'memory' | 'unavailable'
}

/** Documented endpoint limits — mutation-focused; GETs mostly unrestricted. */
export const ENDPOINT_LIMITS: Record<string, { windowMs: number; max: number }> = {
  // Auth
  'auth-login': { windowMs: 60_000, max: 10 },
  login: { windowMs: 60_000, max: 10 },
  'auth-register': { windowMs: 300_000, max: 5 },
  register: { windowMs: 300_000, max: 5 },
  'auth-verify-email': { windowMs: 60_000, max: 10 },
  'auth-verify-email-resend': { windowMs: 60_000, max: 5 },

  // Public contact form
  contact: { windowMs: 600_000, max: 5 },

  // Payments (kill-switch still applies separately)
  'payments-initiate': { windowMs: 60_000, max: 5 },

  // Admin mutations
  'admin-settings-mutation': { windowMs: 60_000, max: 30 },
  'admin-members-mutation': { windowMs: 60_000, max: 30 },
  'admin-packages-mutation': { windowMs: 60_000, max: 20 },
  'admin-subscriptions-mutation': { windowMs: 60_000, max: 20 },
  'admin-claims-mutation': { windowMs: 60_000, max: 20 },
  'admin-contributions-mutation': { windowMs: 60_000, max: 20 },
  'admin-news-mutation': { windowMs: 60_000, max: 30 },
  'admin-media-mutation': { windowMs: 60_000, max: 30 },
  'admin-gallery-mutation': { windowMs: 60_000, max: 30 },
  'admin-reconciliation-mutation': { windowMs: 60_000, max: 30 },
  'admin-scheduled-reports-mutation': { windowMs: 60_000, max: 20 },
  'admin-exports': { windowMs: 300_000, max: 5 },
  'admin-webhook-test': { windowMs: 60_000, max: 10 },
  'manage-user-role': { windowMs: 60_000, max: 20 },
}

const memoryStore = new Map<string, MemoryEntry>()

function build429(max: number, resetAt: number): Response {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
  return new Response(
    JSON.stringify({
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
      retry_after: retryAfter,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(max),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
      },
    },
  )
}

function build503Unavailable(): Response {
  return new Response(
    JSON.stringify({
      message: 'Service temporarily unavailable. Please try again later.',
      code: 'RATE_LIMIT_UNAVAILABLE',
    }),
    {
      status: 503,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': '30',
      },
    },
  )
}

function serviceClient(): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  return createClient(url, key)
}

function shouldFailClosed(identifier: string, options: RateLimitOptions): boolean {
  if (options.requireDistributed === true) return true
  if (options.requireDistributed === false) return false
  return isFailClosedIdentifier(identifier)
}

/**
 * Async distributed rate limit (preferred).
 *
 * Sensitive identifiers (auth / payments / admin mutations) fail closed
 * when the Postgres RPC is unavailable — they do not silently fall back
 * to per-isolate memory.
 */
export async function rateLimitAsync(
  req: Request,
  identifier: string,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const endpointConfig = ENDPOINT_LIMITS[identifier]
  const windowMs = options.windowMs ?? endpointConfig?.windowMs ?? 60_000
  const max = options.max ?? endpointConfig?.max ?? 60
  const keyPrefix = options.keyPrefix ?? 'global'
  const subject = resolveRateLimitSubject(req, options.userId)
  const bucketKey = `${keyPrefix}:${identifier}:${subject}`
  const failClosed = shouldFailClosed(identifier, options)

  const client = options.adminClient ?? serviceClient()
  if (client) {
    try {
      const { data, error } = await client.rpc('consume_rate_limit', {
        p_key: bucketKey,
        p_window_ms: windowMs,
        p_max: max,
      })
      if (!error && data && typeof data === 'object') {
        const row = data as {
          allowed?: boolean
          remaining?: number
          reset_at?: string
        }
        const resetAt = row.reset_at ? Date.parse(row.reset_at) : Date.now() + windowMs
        if (row.allowed === false) {
          return {
            ok: false,
            remaining: 0,
            resetAt,
            response: build429(max, resetAt),
            source: 'db',
          }
        }
        return {
          ok: true,
          remaining: typeof row.remaining === 'number' ? row.remaining : max,
          resetAt,
          source: 'db',
        }
      }
      console.error('rateLimitAsync: RPC failed', error?.message ?? 'no data')
    } catch (err) {
      console.error('rateLimitAsync: exception', err instanceof Error ? err.name : 'unknown')
    }
  } else {
    console.error('rateLimitAsync: no service client available')
  }

  if (failClosed) {
    return {
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      response: build503Unavailable(),
      source: 'unavailable',
    }
  }

  // Non-sensitive identifiers only: degraded memory fallback
  const mem = memoryConsume(memoryStore, bucketKey, windowMs, max)
  if (!mem.ok) {
    return {
      ok: false,
      remaining: 0,
      resetAt: mem.resetAt,
      response: build429(max, mem.resetAt),
      source: 'memory',
    }
  }
  return { ok: true, remaining: mem.remaining, resetAt: mem.resetAt, source: 'memory' }
}

/**
 * Sync in-memory limiter retained for call sites that cannot await.
 * Prefer rateLimitAsync. Sensitive identifiers should not use this path
 * in production — it cannot provide distributed limits.
 */
export function rateLimit(
  req: Request,
  identifier: string,
  options: RateLimitOptions = {},
): RateLimitResult {
  if (shouldFailClosed(identifier, options)) {
    console.error('rateLimit: sync path refused for fail-closed identifier', identifier)
    return {
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      response: build503Unavailable(),
      source: 'unavailable',
    }
  }

  const endpointConfig = ENDPOINT_LIMITS[identifier]
  const windowMs = options.windowMs ?? endpointConfig?.windowMs ?? 60_000
  const max = options.max ?? endpointConfig?.max ?? 60
  const keyPrefix = options.keyPrefix ?? 'global'
  const subject = resolveRateLimitSubject(req, options.userId)
  const bucketKey = `${keyPrefix}:${identifier}:${subject}`
  const mem = memoryConsume(memoryStore, bucketKey, windowMs, max)
  if (!mem.ok) {
    return {
      ok: false,
      remaining: 0,
      resetAt: mem.resetAt,
      response: build429(max, mem.resetAt),
      source: 'memory',
    }
  }
  return { ok: true, remaining: mem.remaining, resetAt: mem.resetAt, source: 'memory' }
}

export function addRateLimitHeaders(
  response: Response,
  result: RateLimitResult,
  max: number,
): Response {
  const headers = new Headers(response.headers)
  headers.set('X-RateLimit-Limit', String(max))
  headers.set('X-RateLimit-Remaining', String(result.remaining))
  headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
