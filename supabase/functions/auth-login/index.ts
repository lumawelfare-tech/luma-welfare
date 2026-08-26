import { handleCors, corsHeaders } from '../shared/cors.ts'
import { createUserClient, createAdminClient } from '../shared/supabase.ts'
import { rateLimit, addRateLimitHeaders } from '../shared/rate-limit.ts'

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

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // Rate limit: 10 login attempts per minute per IP
  const limit = rateLimit(req, 'login', { windowMs: 60_000, max: 10 })
  if (!limit.ok) return limit.response!

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return new Response(JSON.stringify({ message: 'Email and password are required.', code: 'VALIDATION' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createUserClient(req)
    const { data, error } = await userClient.auth.signInWithPassword({ email, password })

    if (error) {
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

    // Check if user is an admin with 2FA enabled
    let requires2fa = false
    const { data: admin } = await adminClient
      .from('admins')
      .select('two_factor_enabled')
      .eq('id', data.user.id)
      .maybeSingle()

    if (admin?.two_factor_enabled) {
      requires2fa = true
    }

    return new Response(JSON.stringify({
      session: data.session,
      member,
      requires_2fa: requires2fa,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ message: 'Internal server error', code: 'INTERNAL' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
