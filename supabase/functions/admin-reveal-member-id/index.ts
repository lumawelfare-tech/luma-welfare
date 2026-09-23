import { handleCors, corsHeaders } from '../shared/cors.ts'
import {
  getAuthenticatedUser,
  createAdminClient,
  loadAdminSession,
  adminSessionDeniedResponse,
  requirePermission,
  handleAdminError,
  logAudit,
} from '../shared/supabase.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import { parseRevealMemberIdInput, ValidationError } from '../shared/validate.ts'

/**
 * Admin-only national ID reveal.
 * POST /admin-reveal-member-id?member_id=<uuid>
 * Validates admin session + members:reveal, rate-limits, audits view_national_id.
 * Never logs the ID value.
 */

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ message: 'Method not allowed', code: 'METHOD' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const loaded = await loadAdminSession(adminClient, user.id, { req })
    if (loaded.status !== 'ok') {
      return adminSessionDeniedResponse(loaded)
    }
    const session = loaded.session

    const rl = await rateLimitAsync(req, 'admin-reveal-member-id', {
      userId: session.id,
      adminClient,
      max: 30,
      windowMs: 60_000,
    })
    if (!rl.ok) return rl.response!

    requirePermission(session, 'members', 'reveal')

    let body: unknown = null
    try {
      body = await req.json()
    } catch {
      body = null
    }

    const url = new URL(req.url)
    let memberId: string
    try {
      memberId = parseRevealMemberIdInput(body, url.searchParams.get('member_id')).memberId
    } catch (e) {
      const message = e instanceof ValidationError ? e.message : 'Valid member_id is required.'
      return new Response(JSON.stringify({ message, code: 'VALIDATION' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: member, error } = await adminClient
      .from('members')
      .select('id, id_number')
      .eq('id', memberId)
      .maybeSingle()

    if (error || !member) {
      return new Response(JSON.stringify({ message: 'Member not found.', code: 'NOT_FOUND' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const idNumber = typeof member.id_number === 'string' ? member.id_number.trim() : ''
    if (!idNumber) {
      return new Response(JSON.stringify({ message: 'No ID number on file.', code: 'EMPTY' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await logAudit(adminClient, {
      actor_id: session.id,
      actor_role: session.role_name,
      action: 'view_national_id',
      resource: 'member',
      resource_id: memberId,
      meta: { reason: 'admin_members_list_reveal' },
    })

    return new Response(JSON.stringify({ id_number: idNumber }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return handleAdminError(err, 'admin-reveal-member-id')
  }
})
