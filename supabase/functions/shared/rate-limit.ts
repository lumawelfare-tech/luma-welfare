/**
 * In-memory sliding-window rate limiter for Edge Functions.
 *
 * Each Edge Function instance has its own memory, so this works per-instance.
 * For truly distributed limiting, use a database counter (e.g., Redis/Supabase).
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

export function rateLimit(
  req: Request,
  identifier: string,
  options: RateLimitOptions = {},
): RateLimitResult {
  const { windowMs = 60_000, max = 60, keyPrefix = 'global' } = options

  // Use IP + identifier as key
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('cf-connecting-ip')
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
