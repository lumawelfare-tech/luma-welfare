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
import { buildIlikeOrFilter } from '../shared/search.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'

/**
 * Admin Complaints — queue + status workflow (Master Blueprint §14).
 *
 * GET    /admin-complaints
 * GET    /admin-complaints?resource_id=xxx
 * PATCH  /admin-complaints?resource_id=xxx  — status / resolution
 */

const ALLOWED_STATUS = new Set([
  'submitted',
  'acknowledged',
  'under_review',
  'resolved',
  'closed',
  'escalated',
])

function sanitizeText(input: unknown, max: number): string {
  if (typeof input !== 'string') return ''
  return input.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)
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
    const loaded = await loadAdminSession(adminClient, user.id, { req })
    if (loaded.status !== 'ok') {
      return adminSessionDeniedResponse(loaded)
    }
    const session = loaded.session

    if (req.method !== 'GET') {
      const rl = await rateLimitAsync(req, 'admin-complaints-mutation', { userId: session.id, adminClient })
      if (!rl.ok) return rl.response!
    }

    const url = new URL(req.url)
    const resourceId = url.searchParams.get('resource_id')
    const isIdPath = Boolean(resourceId && resourceId !== 'admin-complaints')

    // GET list
    if (req.method === 'GET' && !isIdPath) {
      requirePermission(session, 'complaints', 'read')
      const status = url.searchParams.get('status')
      const q = url.searchParams.get('q')
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
      const perPage = Math.min(Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10) || 50), 200)

      let query = adminClient
        .from('complaints')
        .select(
          'id, reference_number, member_id, subject, status, created_at, updated_at, acknowledged_at, resolved_at, appeal_requested_at, members(full_name, membership_number, application_number, phone, email)',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })

      if (status && ALLOWED_STATUS.has(status)) {
        query = query.eq('status', status)
      }
      if (q) {
        const orFilter = buildIlikeOrFilter(['reference_number', 'subject'], q)
        if (orFilter) query = query.or(orFilter)
      }
      query = query.range((page - 1) * perPage, page * perPage - 1)

      const { data, error, count } = await query
      if (error) throw new Error(error.message)

      return new Response(JSON.stringify({
        complaints: data ?? [],
        total: count ?? 0,
        page,
        per_page: perPage,
        pages: Math.ceil((count ?? 0) / perPage) || 1,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET detail
    if (req.method === 'GET' && isIdPath) {
      requirePermission(session, 'complaints', 'read')
      const { data, error } = await adminClient
        .from('complaints')
        .select('*, members(id, full_name, membership_number, application_number, phone, email, status)')
        .eq('id', resourceId!)
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

    // PATCH status / resolution
    if (req.method === 'PATCH' && isIdPath) {
      requirePermission(session, 'complaints', 'update')
      const body = await req.json()
      const nextStatus = typeof body.status === 'string' ? body.status : null
      if (!nextStatus || !ALLOWED_STATUS.has(nextStatus)) {
        return new Response(JSON.stringify({ message: 'Invalid status', code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: existing, error: loadErr } = await adminClient
        .from('complaints')
        .select('id, status')
        .eq('id', resourceId!)
        .maybeSingle()
      if (loadErr) throw new Error(loadErr.message)
      if (!existing) {
        return new Response(JSON.stringify({ message: 'Complaint not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const now = new Date().toISOString()
      const updates: Record<string, unknown> = {
        status: nextStatus,
        updated_at: now,
      }
      const notes = sanitizeText(body.resolutionNotes, 4000)
      if (notes) updates.resolution_notes = notes

      if (nextStatus === 'acknowledged' || nextStatus === 'under_review') {
        updates.acknowledged_at = now
        updates.acknowledged_by = session.id
      }
      if (nextStatus === 'resolved' || nextStatus === 'closed') {
        requirePermission(session, 'complaints', 'approve')
        updates.resolved_at = now
        updates.resolved_by = session.id
        if (!notes && !body.resolutionNotes) {
          return new Response(JSON.stringify({
            message: 'Resolution notes are required when resolving or closing.',
            code: 'VALIDATION',
          }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      const { data: updated, error: updErr } = await adminClient
        .from('complaints')
        .update(updates)
        .eq('id', resourceId!)
        .select('id, reference_number, status, resolution_notes, acknowledged_at, resolved_at, appeal_requested_at, updated_at')
        .single()
      if (updErr) throw new Error(updErr.message)

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: `complaint_${nextStatus}`,
        resource: 'complaint',
        resource_id: resourceId!,
      })

      return new Response(JSON.stringify({ complaint: updated }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed', code: 'METHOD' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return handleAdminError(err, 'admin-complaints')
  }
})
