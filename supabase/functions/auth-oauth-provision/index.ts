import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'

/**
 * OAuth Member Provisioning
 *
 * Called after a Google/SSO user signs in for the first time.
 * Uses the authenticated user's Supabase Auth identity to create
 * a member record. Does NOT require a phone number.
 *
 * POST /auth-oauth-provision
 * Headers: Authorization: Bearer <user JWT>
 *
 * The user must be authenticated via Supabase Auth (the JWT must be valid).
 * This endpoint uses the authenticated user's ID from the JWT — the client
 * cannot choose another user's ID.
 */
Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Get the authenticated user from the JWT — this is the source of truth
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()

    // Check if member record already exists
    const { data: existing } = await adminClient
      .from('members')
      .select('id, status')
      .eq('id', user.id)
      .maybeSingle()

    if (existing) {
      // Member already exists — return success, no creation needed
      return new Response(JSON.stringify({
        message: 'Member record already exists',
        member_id: user.id,
        created: false,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get full user details from auth to extract profile info
    const { data: authUser } = await adminClient.auth.admin.getUserById(user.id)
    const profile = authUser?.user

    const email = profile?.email ?? user.email ?? ''
    const fullName = (profile?.user_metadata?.full_name as string)
      ?? (profile?.user_metadata?.name as string)
      ?? email.split('@')[0]
      ?? 'Member'

    // Create member record — phone is NOT required for OAuth users
    const { data: member, error: memberError } = await adminClient
      .from('members')
      .insert({
        id: user.id,
        full_name: fullName,
        email: email.toLowerCase(),
        phone: null,
        status: 'active',
      })
      .select('id, full_name, email, status')
      .single()

    if (memberError) {
      // If insert fails (e.g. race condition with another request), check again
      const { data: retryExisting } = await adminClient
        .from('members')
        .select('id, status')
        .eq('id', user.id)
        .maybeSingle()

      if (retryExisting) {
        return new Response(JSON.stringify({
          message: 'Member record already exists',
          member_id: user.id,
          created: false,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      throw new Error(memberError.message)
    }

    // Audit log
    await logAudit(adminClient, {
      actor_id: user.id,
      action: 'oauth_member_created',
      resource: 'member',
      resource_id: user.id,
      meta: { provider: profile?.app_metadata?.provider ?? 'unknown', email },
    })

    return new Response(JSON.stringify({
      message: 'Member account created',
      member_id: user.id,
      created: true,
      member,
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(JSON.stringify({ message, code: 'INTERNAL' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
