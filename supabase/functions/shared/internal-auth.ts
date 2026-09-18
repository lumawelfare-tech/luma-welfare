/**
 * Shared authentication for internal/cron Edge Functions.
 *
 * These endpoints are invoked by pg_net, Vercel cron, or operators — not by
 * end-user JWTs. They MUST present CRON_SECRET (same secret used by
 * api/cron/*). Fail closed if the secret is unset.
 *
 * Accepted presentations (first match wins):
 *   Authorization: Bearer <CRON_SECRET>
 *   x-cron-secret: <CRON_SECRET>
 *   x-internal-secret: <CRON_SECRET>
 */

import { corsHeaders } from './cors.ts'

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function extractPresentedSecret(req: Request): string | null {
  const auth = req.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim()
    if (token) return token
  }
  const cronHeader = req.headers.get('x-cron-secret')?.trim()
  if (cronHeader) return cronHeader
  const internalHeader = req.headers.get('x-internal-secret')?.trim()
  if (internalHeader) return internalHeader
  return null
}

/**
 * Verify the request carries a valid CRON_SECRET.
 * Returns a 401/503 Response on failure, or null when authorized.
 */
export function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get('CRON_SECRET')?.trim()
  if (!expected) {
    console.error('internal-auth: CRON_SECRET is not configured')
    return new Response(JSON.stringify({
      message: 'Internal authentication is not configured',
      code: 'SERVICE_UNAVAILABLE',
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const presented = extractPresentedSecret(req)
  if (!presented || !timingSafeEqual(presented, expected)) {
    return new Response(JSON.stringify({
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return null
}
