import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'

/**
 * Google OAuth Authorization — Existing Members Only
 *
 * After Google authenticates the user, this Edge Function performs
 * server-side authorization before granting access to the application.
 *
 * CHECKS (in order):
 * 1. User is authenticated (JWT valid)
 * 2. Member record exists (auth.users → members)
 * 3. Google email matches member's registered email
 * 4. Member account is active (not suspended/closed)
 * 5. Registration information is complete (full_name, phone present)
 *
 * If ANY check fails:
 * - Deny access
 * - Sign out the unauthorized OAuth user
 * - Return clear error message
 *
 * POST /auth-google-authorize
 * Headers: Authorization: Bearer <user JWT>
 */

// Required fields for a complete Luma Welfare registration
// Matches: auth-register EF, registerSchema, registration form
const REQUIRED_MEMBER_FIELDS = ['full_name', 'phone', 'email'] as const

function isMemberComplete(member: Record<string, unknown>): { complete: boolean; missing: string[] } {
  const missing: string[] = []
  for (const field of REQUIRED_MEMBER_FIELDS) {
    const val = member[field]
    if (val === null || val === undefined || val === '') {
      missing.push(field)
    }
  }
  // full_name must be at least 2 characters
  if (typeof member.full_name === 'string' && member.full_name.length < 2) {
    missing.push('full_name (too short)')
  }
  return { complete: missing.length === 0, missing }
}

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
    // 1. Authenticate — extract user from JWT
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({
        authorized: false,
        code: 'UNAUTHORIZED',
        message: 'Not authenticated.',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()

    // 2. Check if member record exists
    const { data: member, error: memberError } = await adminClient
      .from('members')
      .select('id, full_name, email, phone, status')
      .eq('id', user.id)
      .maybeSingle()

    if (memberError) {
      throw new Error(memberError.message)
    }

    // 3. No member record → DENY
    if (!member) {
      // Sign out the unauthorized OAuth user
      // Note: we cannot sign out from here, but we tell the frontend to do so
      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'google_login_denied_no_member',
        resource: 'member',
        resource_id: user.id,
        meta: { email: user.email, reason: 'no_member_record' },
      })

      return new Response(JSON.stringify({
        authorized: false,
        code: 'NOT_REGISTERED',
        message: 'This Google account is not registered with Luma Welfare. Please create a Luma Welfare membership account first.',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Google email must match member's registered email
    const googleEmail = (user.email ?? '').toLowerCase()
    const memberEmail = (member.email ?? '').toLowerCase()

    if (!googleEmail) {
      return new Response(JSON.stringify({
        authorized: false,
        code: 'NO_VERIFIED_EMAIL',
        message: 'Google account has no verified email. Please verify your Google email and try again.',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (googleEmail !== memberEmail) {
      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'google_login_denied_email_mismatch',
        resource: 'member',
        resource_id: user.id,
        meta: { google_email: googleEmail, member_email: memberEmail },
      })

      return new Response(JSON.stringify({
        authorized: false,
        code: 'EMAIL_MISMATCH',
        message: 'This Google account does not match your registered Luma Welfare email. Please sign in with the Google account using your registered email.',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. Member account must be active
    if (member.status !== 'active') {
      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'google_login_denied_account_status',
        resource: 'member',
        resource_id: user.id,
        meta: { status: member.status },
      })

      return new Response(JSON.stringify({
        authorized: false,
        code: 'ACCOUNT_INELIGIBLE',
        message: 'Your Luma Welfare account is not currently eligible to sign in. Please contact Luma Welfare support.',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 6. Registration information must be complete
    const { complete, missing } = isMemberComplete(member as Record<string, unknown>)
    if (!complete) {
      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'google_login_denied_incomplete',
        resource: 'member',
        resource_id: user.id,
        meta: { missing },
      })

      return new Response(JSON.stringify({
        authorized: false,
        code: 'INCOMPLETE_REGISTRATION',
        message: 'Your Luma Welfare membership information is incomplete. Please complete your registration before using Google Sign-In.',
        missing,
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // All checks passed — authorize
    await logAudit(adminClient, {
      actor_id: user.id,
      action: 'google_login_authorized',
      resource: 'member',
      resource_id: user.id,
      meta: { email: googleEmail },
    })

    return new Response(JSON.stringify({
      authorized: true,
      message: 'Google login authorized.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({
      authorized: false,
      code: 'INTERNAL',
      message: 'Authorization check failed. Please try again.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
