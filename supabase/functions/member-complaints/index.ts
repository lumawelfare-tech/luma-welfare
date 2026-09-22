import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'

/**
 * Member Complaints — list own + submit (Master Blueprint §14).
 *
 * GET  /member-complaints           — list own complaints
 * GET  /member-complaints?id=xxx    — detail
 * POST /member-complaints           — submit complaint
 * PATCH /member-complaints?id=xxx   — request appeal (resolved/closed only)
 */

function sanitizeText(input: unknown, max: number): string {
  if (typeof input !== 'string') return ''
  return input.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)
}

async function assertCanFileComplaint(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<Response | null> {
  const { data: member, error } = await adminClient
    .from('members')
    .select('status')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    return new Response(JSON.stringify({ message: 'Unable to verify membership', code: 'INTERNAL' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!member) {
    return new Response(JSON.stringify({ message: 'Member profile not found', code: 'NOT_FOUND' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (member.status === 'suspended' || member.status === 'closed') {
    return new Response(JSON.stringify({
      message: 'Your account cannot submit complaints. Contact Luma Welfare support.',
      code: 'ACCOUNT_INACTIVE',
    }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  return null
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const url = new URL(req.url)
    const complaintId = url.searchParams.get('id') || url.searchParams.get('resource_id')

    if (req.method !== 'GET') {
      const rl = await rateLimitAsync(req, 'member-complaints-mutation', { userId: user.id, adminClient })
      if (!rl.ok) return rl.response!
    }

    // GET list
    if (req.method === 'GET' && !complaintId) {
      const { data, error } = await adminClient
        .from('complaints')
        .select('id, reference_number, subject, status, created_at, updated_at, acknowledged_at, resolved_at, appeal_requested_at')
        .eq('member_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ complaints: data ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET detail
    if (req.method === 'GET' && complaintId) {
      const { data, error } = await adminClient
        .from('complaints')
        .select('id, reference_number, subject, body, status, created_at, updated_at, acknowledged_at, resolved_at, resolution_notes, appeal_requested_at')
        .eq('id', complaintId)
        .eq('member_id', user.id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) {
        return new Response(JSON.stringify({ message: 'Complaint not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ complaint: data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST create
    if (req.method === 'POST' && !complaintId) {
      const blocked = await assertCanFileComplaint(adminClient, user.id)
      if (blocked) return blocked

      const body = await req.json()
      const subject = sanitizeText(body.subject, 200)
      const complaintBody = sanitizeText(body.body, 5000)
      if (subject.length < 3 || complaintBody.length < 10) {
        return new Response(JSON.stringify({
          message: 'Subject (3–200 chars) and details (10–5000 chars) are required.',
          code: 'VALIDATION',
        }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: refNum, error: refErr } = await adminClient.rpc('generate_complaint_number')
      if (refErr || !refNum) {
        return new Response(JSON.stringify({ message: 'Could not assign complaint reference.', code: 'REFERENCE' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: created, error: insertErr } = await adminClient
        .from('complaints')
        .insert({
          reference_number: typeof refNum === 'string' ? refNum : String(refNum),
          member_id: user.id,
          subject,
          body: complaintBody,
          status: 'submitted',
        })
        .select('id, reference_number, subject, status, created_at')
        .single()
      if (insertErr) throw new Error(insertErr.message)

      await logAudit(adminClient, {
        actor_id: user.id,
        actor_role: 'member',
        action: 'complaint_submitted',
        resource: 'complaint',
        resource_id: created.id,
      })

      return new Response(JSON.stringify({ complaint: created }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH — request appeal
    if (req.method === 'PATCH' && complaintId) {
      const blocked = await assertCanFileComplaint(adminClient, user.id)
      if (blocked) return blocked

      const { data: existing, error: loadErr } = await adminClient
        .from('complaints')
        .select('id, status, appeal_requested_at')
        .eq('id', complaintId)
        .eq('member_id', user.id)
        .maybeSingle()
      if (loadErr) throw new Error(loadErr.message)
      if (!existing) {
        return new Response(JSON.stringify({ message: 'Complaint not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!['resolved', 'closed'].includes(existing.status)) {
        return new Response(JSON.stringify({
          message: 'Appeals are only available after a decision is communicated.',
          code: 'VALIDATION',
        }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (existing.appeal_requested_at) {
        return new Response(JSON.stringify({ message: 'Appeal already requested.', code: 'CONFLICT' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const now = new Date().toISOString()
      const { data: updated, error: updErr } = await adminClient
        .from('complaints')
        .update({ appeal_requested_at: now, updated_at: now })
        .eq('id', complaintId)
        .eq('member_id', user.id)
        .select('id, reference_number, status, appeal_requested_at')
        .single()
      if (updErr) throw new Error(updErr.message)

      await logAudit(adminClient, {
        actor_id: user.id,
        actor_role: 'member',
        action: 'complaint_appeal_requested',
        resource: 'complaint',
        resource_id: complaintId,
      })

      return new Response(JSON.stringify({ complaint: updated }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed', code: 'METHOD' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[member-complaints]', err)
    return new Response(JSON.stringify({ message: 'Internal error', code: 'INTERNAL' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
