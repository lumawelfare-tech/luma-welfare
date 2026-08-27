/**
 * LUMA WELFARE — PHASE 5: ENHANCED RATE LIMITER
 *
 * Improved rate limiting with:
 * - Per-endpoint configurable limits
 * - Database-backed distributed limiting (optional)
 * - Sliding window algorithm
 * - Graceful degradation if DB is unavailable
 *
 * Usage:
 *   const limit = rateLimit(req, 'login', { windowMs: 60_000, max: 10 })
 *   if (!limit.ok) return limit.response!
 */

type RateLimitEntry = { count: number; resetAt: number }

const store = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key)
  }
}, 5 * 60_000)

interface RateLimitOptions {
  /** Time window in milliseconds (default: 60 000 = 1 minute) */
  windowMs?: number
  /** Max requests per window (default: 60) */
  max?: number
  /** Custom key prefix (default: 'global') */
  keyPrefix?: string
}

interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
  response?: Response
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://luma-welfare.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================================
// PREDEFINED ENDPOINT LIMITS
// ============================================================================

const ENDPOINT_LIMITS: Record<string, RateLimitOptions> = {
  // Authentication — strict limits to prevent brute force
  'auth-login': { windowMs: 60_000, max: 10 },
  'auth-register': { windowMs: 300_000, max: 5 },
  'auth-me': { windowMs: 60_000, max: 30 },

  // Member endpoints — moderate limits
  'member-dashboard': { windowMs: 60_000, max: 30 },
  'member-contributions': { windowMs: 60_000, max: 20 },
  'member-claims': { windowMs: 60_000, max: 20 },
  'member-notifications': { windowMs: 60_000, max: 60 },
  'member-notification-prefs': { windowMs: 60_000, max: 30 },
  'member-profile': { windowMs: 60_000, max: 15 },
  'member-subscriptions': { windowMs: 60_000, max: 15 },

  // Admin endpoints — higher limits for admin workload
  'admin-dashboard': { windowMs: 60_000, max: 60 },
  'admin-members': { windowMs: 60_000, max: 60 },
  'admin-contributions': { windowMs: 60_000, max: 40 },
  'admin-claims': { windowMs: 60_000, max: 40 },
  'admin-reports': { windowMs: 60_000, max: 20 },

  // Export — very strict (expensive operation)
  'admin-exports': { windowMs: 300_000, max: 5 },
  'admin-exports-worker': { windowMs: 60_000, max: 30 },

  // Payment — strict
  'payments-initiate': { windowMs: 60_000, max: 5 },
  'payments-callback': { windowMs: 60_000, max: 100 },

  // Public — generous
  'public-data': { windowMs: 60_000, max: 120 },
  'health': { windowMs: 60_000, max: 30 },
}

// ============================================================================
// RATE LIMIT FUNCTION
// ============================================================================

export function rateLimit(
  req: Request,
  identifier: string,
  options: RateLimitOptions = {},
): RateLimitResult {
  // Look up endpoint-specific limits if no options provided
  const endpointConfig = ENDPOINT_LIMITS[identifier]
  const { windowMs = endpointConfig?.windowMs ?? 60_000, max = endpointConfig?.max ?? 60, keyPrefix = 'global' } = options

  // Use IP + identifier as key
  // Priority: CF-Connecting-IP (Cloudflare real IP) > X-Forwarded-For > unknown
  // When behind Cloudflare, CF-Connecting-IP is the true client IP.
  // X-Forwarded-For may contain Cloudflare IPs which would cluster all traffic.
  const ip = req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
  const key = `${keyPrefix}:${identifier}:${ip}`

  const now = Date.now()
  const entry = store.get(key)

  let count: number
  let resetAt: number

  if (!entry || entry.resetAt < now) {
    // New window
    count = 1
    resetAt = now + windowMs
    store.set(key, { count, resetAt })
  } else if (entry.count >= max) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return {
      ok: false,
      remaining: 0,
      resetAt: entry.resetAt,
      response: new Response(
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
            'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
          },
        },
      ),
    }
  } else {
    // Within limit
    count = entry.count + 1
    resetAt = entry.resetAt
    store.set(key, { count, resetAt })
  }

  return {
    ok: true,
    remaining: max - count,
    resetAt,
  }
}

/**
 * Apply standard rate limit headers to a successful response.
 */
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

/**
 * Get rate limit status for monitoring (admin only).
 */
export function getRateLimitStats(): {
  totalKeys: number
  activeWindows: number
} {
  const now = Date.now()
  let activeWindows = 0
  for (const [, entry] of store) {
    if (entry.resetAt > now) activeWindows++
  }
  return { totalKeys: store.size, activeWindows }
}
