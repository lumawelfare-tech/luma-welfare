import { handleCors, corsHeaders } from '../shared/cors.ts'
import { createUserClient, createAdminClient, logAudit } from '../shared/supabase.ts'
import { rateLimitAsync, addRateLimitHeaders } from '../shared/rate-limit.ts'
import { parseLoginBody, ValidationError } from '../shared/validate.ts'
import { withLogging } from '../shared/logging.ts'
import { getClientIp } from '../shared/cloudflare.ts'

/**
 * Auth Login — authenticate user and check 2FA status
 *
 * POST /auth-login — sign in with email/password
 *
 * Response includes:
 * - session: Supabase session
 * - member: member profile
 * - requires_2fa: true if admin has 2FA enabled (frontend must then call admin-2fa?action=verify)
 */

Deno.serve(withLogging('auth-login', async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // Rate limit: 10 login attempts per minute per trusted subject
  const limit = await rateLimitAsync(req, 'login', { windowMs: 60_000, max: 10 })
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

    const { email, password } = parseLoginBody(body)

    const userClient = createUserClient(req)
    const { data, error } = await userClient.auth.signInWithPassword({ email, password })

    if (error) {
      const supabaseCode = (error as { code?: string }).code ?? ''
      const msg = (error.message ?? '').toLowerCase()
      const emailNotConfirmed =
        supabaseCode === 'email_not_confirmed' ||
        msg.includes('not confirmed') ||
        msg.includes('confirm your email') ||
        msg.includes("email isn't confirmed")

      try {
        const emailDomain = email.includes('@') ? email.split('@')[1]?.toLowerCase() ?? null : null
        await logAudit(createAdminClient(), {
          actor_id: null,
          actor_role: null,
          action: 'auth_failed',
          resource: 'auth',
          meta: { code: emailNotConfirmed ? 'EMAIL_NOT_CONFIRMED' : 'INVALID_LOGIN', email_domain: emailDomain },
          ip: getClientIp(req),
        })
      } catch {
        // Never block the login response on audit failure
      }

      if (emailNotConfirmed) {
        return new Response(JSON.stringify({
          message: 'Please verify your email address before signing in.',
          code: 'EMAIL_NOT_CONFIRMED',
        }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'Email or password is incorrect.', code: 'INVALID_LOGIN' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const { data: member } = await adminClient
      .from('members')
      .select('*')
      .eq('id', data.user.id)
      .single()

    const { data: admin } = await adminClient
      .from('admins')
      .select('id, is_active, two_factor_enabled')
      .eq('id', data.user.id)
      .eq('is_active', true)
      .maybeSingle()

    const isAdmin = Boolean(admin)
    if (member && (member.status === 'suspended' || member.status === 'closed') && !isAdmin) {
      return new Response(JSON.stringify({
        message: 'Your account is suspended or closed. Contact Luma Welfare support.',
        code: 'ACCOUNT_INACTIVE',
      }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const requires2fa = admin?.two_factor_enabled === true
    const requires2faSetup = isAdmin && !requires2fa

    const response = new Response(JSON.stringify({
      session: data.session,
      member,
      requires_2fa: requires2fa,
      requires_2fa_setup: requires2faSetup,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
    return addRateLimitHeaders(response, limit, 10)
  } catch (err) {
    if (err instanceof ValidationError) {
      return new Response(JSON.stringify({ message: err.message, code: 'VALIDATION' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    console.error('auth-login: unexpected error', err instanceof Error ? err.name : 'unknown')
    return new Response(JSON.stringify({ message: 'Internal server error', code: 'INTERNAL' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}))
