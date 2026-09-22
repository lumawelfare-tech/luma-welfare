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
 * Admin Community Support Records — Mission of Mercy ops log (Master §12).
 * No child PII / images. Admin-only.
 *
 * GET    /admin-community
 * GET    /admin-community?resource_id=xxx
 * POST   /admin-community
 * PATCH  /admin-community?resource_id=xxx
 * DELETE /admin-community?resource_id=xxx
 */

function sanitizeText(input: unknown, max: number): string {
  if (typeof input !== 'string') return ''
  return input.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)
}

function parseRecordBody(body: Record<string, unknown>) {
  const record_date = sanitizeText(body.recordDate ?? body.record_date, 32)
  const location = sanitizeText(body.location, 300)
  const purpose = sanitizeText(body.purpose, 500)
  const resources_used = sanitizeText(body.resourcesUsed ?? body.resources_used, 2000) || null
  const responsible_officials = sanitizeText(body.responsibleOfficials ?? body.responsible_officials, 500) || null
  const partner_organization = sanitizeText(body.partnerOrganization ?? body.partner_organization, 300) || null
  const outcome = sanitizeText(body.outcome, 2000) || null
  const notes = sanitizeText(body.notes, 2000) || null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(record_date)) {
    return { error: 'recordDate must be YYYY-MM-DD.' }
  }
  if (location.length < 2 || purpose.length < 3) {
    return { error: 'Location and purpose are required.' }
  }

  return {
    data: {
      record_date,
      location,
      purpose,
      resources_used,
      responsible_officials,
      partner_organization,
      outcome,
      notes,
    },
  }
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
      const rl = await rateLimitAsync(req, 'admin-community-mutation', { userId: session.id, adminClient })
      if (!rl.ok) return rl.response!
    }

    const url = new URL(req.url)
    const resourceId = url.searchParams.get('resource_id')
    const isIdPath = Boolean(resourceId && resourceId !== 'admin-community')

    // GET list
    if (req.method === 'GET' && !isIdPath) {
      requirePermission(session, 'community', 'read')
      const q = url.searchParams.get('q')
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
      const perPage = Math.min(Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10) || 50), 200)

      let query = adminClient
        .from('community_support_records')
        .select('*', { count: 'exact' })
        .order('record_date', { ascending: false })

      if (q) {
        const orFilter = buildIlikeOrFilter(['location', 'purpose', 'partner_organization'], q)
        if (orFilter) query = query.or(orFilter)
      }
      query = query.range((page - 1) * perPage, page * perPage - 1)

      const { data, error, count } = await query
      if (error) throw new Error(error.message)

      return new Response(JSON.stringify({
        records: data ?? [],
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
      requirePermission(session, 'community', 'read')
      const { data, error } = await adminClient
        .from('community_support_records')
        .select('*')
        .eq('id', resourceId!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) {
        return new Response(JSON.stringify({ message: 'Record not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ record: data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST create
    if (req.method === 'POST' && !isIdPath) {
      requirePermission(session, 'community', 'create')
      const body = await req.json()
      const parsed = parseRecordBody(body)
      if ('error' in parsed && parsed.error) {
        return new Response(JSON.stringify({ message: parsed.error, code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: created, error } = await adminClient
        .from('community_support_records')
        .insert({
          ...parsed.data!,
          created_by: session.id,
        })
        .select('*')
        .single()
      if (error) throw new Error(error.message)

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'community_record_created',
        resource: 'community_support_record',
        resource_id: created.id,
      })

      return new Response(JSON.stringify({ record: created }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH update
    if (req.method === 'PATCH' && isIdPath) {
      requirePermission(session, 'community', 'update')
      const body = await req.json()
      const parsed = parseRecordBody(body)
      if ('error' in parsed && parsed.error) {
        return new Response(JSON.stringify({ message: parsed.error, code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: updated, error } = await adminClient
        .from('community_support_records')
        .update({
          ...parsed.data!,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resourceId!)
        .select('*')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!updated) {
        return new Response(JSON.stringify({ message: 'Record not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'community_record_updated',
        resource: 'community_support_record',
        resource_id: resourceId!,
      })

      return new Response(JSON.stringify({ record: updated }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DELETE
    if (req.method === 'DELETE' && isIdPath) {
      requirePermission(session, 'community', 'delete')
      const { error } = await adminClient
        .from('community_support_records')
        .delete()
        .eq('id', resourceId!)
      if (error) throw new Error(error.message)

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'community_record_deleted',
        resource: 'community_support_record',
        resource_id: resourceId!,
      })

      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed', code: 'METHOD' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return handleAdminError(err, 'admin-community')
  }
})
