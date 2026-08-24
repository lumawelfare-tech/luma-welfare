import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const session = await loadAdminSession(adminClient, user.id)
    if (!session) return new Response(JSON.stringify({ message: 'No admin access' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const url = new URL(req.url)
    const resourceId = url.searchParams.get("resource_id")
    const action = url.searchParams.get("action")
    const resource = resourceId
    // Also accept ?resource= query param for backward compatibility
    const resourceParam = url.searchParams.get("resource") ?? resource

    // GET /admin-settings/audit-logs
    if (req.method === 'GET' && (resource === 'audit-logs' || resourceParam === 'audit_logs')) {
      requirePermission(session, 'audit_logs', 'read')
      const { data, error } = await adminClient.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ audit_logs: data ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // GET /admin-settings/open-questions
    if (req.method === 'GET' && (resource === 'open-questions' || resourceParam === 'open-questions')) {
      requirePermission(session, 'members', 'read')
      const { data, error } = await adminClient.from('open_questions').select('*').order('created_at')
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ open_questions: data ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /admin-settings/resolve?id={questionId}
    if (req.method === 'POST' && action === 'resolve') {
      requirePermission(session, 'members', 'update')
      const body = await req.json()
      const questionId = url.searchParams.get('id') ?? resourceId
      const { data, error } = await adminClient.from('open_questions').update({ status: 'resolved', answer: body.answer ?? '' }).eq('id', questionId).select().single()
      if (error) throw new Error('Question not found')
      return new Response(JSON.stringify({ question: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PATCH /admin-settings — update settings
    // When called as /admin/settings (no resource_id), treat as settings update
    if (req.method === 'PATCH' && (!resource || resource === 'settings' || resourceParam === 'settings')) {
      requirePermission(session, 'members', 'update')
      const body = await req.json()
      if (!body || typeof body.key !== 'string') {
        return new Response(JSON.stringify({ message: 'Send { key, value }' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data, error } = await adminClient.from('platform_settings').upsert({ key: body.key, value: body.value }).select().single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'updated_setting', resource: 'platform_settings', resource_id: body.key })
      return new Response(JSON.stringify({ setting: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
