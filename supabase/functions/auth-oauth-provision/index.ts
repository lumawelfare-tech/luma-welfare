import { handleCors, corsHeaders } from '../shared/cors.ts'

/**
 * OAuth Member Provisioning — DISABLED
 *
 * Google Sign-In is an authentication method for EXISTING members only.
 * New memberships must go through auth-register → email OTP verification.
 * Use auth-google-authorize after Google OAuth instead.
 *
 * This endpoint previously created active members without OTP or registration
 * fee. It now returns 410 Gone and never writes member rows.
 *
 * POST /auth-oauth-provision
 */

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  return new Response(JSON.stringify({
    authorized: false,
    created: false,
    code: 'OAUTH_PROVISION_DISABLED',
    message:
      'OAuth member provisioning is disabled. Register with email verification first, then sign in with Google using the same email.',
  }), {
    status: 410,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
