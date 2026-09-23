import { handleCors, corsHeaders } from '../shared/cors.ts'
import { createAdminClient, logAudit } from '../shared/supabase.ts'
import { rateLimitAsync, addRateLimitHeaders } from '../shared/rate-limit.ts'
import { parseForgotPasswordBody, ValidationError } from '../shared/validate.ts'
import { withLogging } from '../shared/logging.ts'
import { getClientIp } from '../shared/cloudflare.ts'

/**
 * Auth Forgot Password — rate-limited, enumeration-safe reset request.
 *
 * POST /auth-forgot-password
 * Always returns a generic success payload (except validation / rate-limit).
 */

const GENERIC = {
  message: 'If an account exists for that email, a password reset link has been sent.',
  code: 'OK',
}

Deno.serve(withLogging('auth-forgot-password', async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const limit = await rateLimitAsync(req, 'auth-forgot-password', { windowMs: 300_000, max: 5 })
  if (!limit.ok) return limit.response!

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ message: 'Invalid JSON body.', code: 'VALIDATION' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, redirectTo } = parseForgotPasswordBody(body)
    const adminClient = createAdminClient()

    try {
      await adminClient.auth.resetPasswordForEmail(email, { redirectTo })
    } catch {
      // Do not reveal whether the address exists
    }

    try {
      const emailDomain = email.includes('@') ? email.split('@')[1]?.toLowerCase() ?? null : null
      await logAudit(adminClient, {
        actor_id: null,
        actor_role: null,
        action: 'password_reset_requested',
        resource: 'auth',
        meta: { email_domain: emailDomain },
        ip: getClientIp(req),
      })
    } catch {
      // Never block the response on audit failure
    }

    const response = new Response(JSON.stringify(GENERIC), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
    return addRateLimitHeaders(response, limit, 5)
  } catch (err) {
    if (err instanceof ValidationError) {
      return new Response(JSON.stringify({ message: err.message, code: 'VALIDATION' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    console.error('auth-forgot-password: unexpected error', err instanceof Error ? err.name : 'unknown')
    // Fail closed on unexpected errors — do not claim the email was sent
    return new Response(JSON.stringify({
      message: 'Unable to process this request right now. Please try again later.',
      code: 'INTERNAL',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}))
