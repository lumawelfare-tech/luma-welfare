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
    const pathParts = url.pathname.split('/').filter(Boolean)
    const subId = pathParts[pathParts.length - 1]

    // GET /admin-subscriptions — list subscriptions
    if (req.method === 'GET' && !subId) {
      requirePermission(session, 'members', 'read')
      const status = url.searchParams.get('status')
      let query = adminClient
        .from('subscriptions').select('id, status, started_at, next_due_date, member_id, members(full_name, phone, membership_number), packages(code, name), package_tiers(name, amount)')
        .order('created_at', { ascending: false })
      if (status) query = query.eq('status', status)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ subscriptions: data ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PATCH /admin-subscriptions/:id — approve/reject/pause/cancel
    if (req.method === 'PATCH' && subId) {
      requirePermission(session, 'members', 'approve')
      const body = await req.json()
      const { status: subStatus, reason } = body
      if (!['active', 'paused', 'cancelled', 'rejected'].includes(subStatus)) {
        return new Response(JSON.stringify({ message: 'Invalid status' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const updates: Record<string, unknown> = { status: subStatus, cancelled_reason: reason }
      if (subStatus === 'active') { updates.started_at = new Date().toISOString().slice(0, 10); updates.next_due_date = new Date().toISOString().slice(0, 10) }
      if (subStatus === 'cancelled' || subStatus === 'rejected') updates.cancelled_at = new Date().toISOString()

      const { data, error } = await adminClient.from('subscriptions').update(updates).eq('id', subId).select().single()
      if (error) throw new Error('Subscription not found')
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: `subscription_${subStatus}`, resource: 'subscription', resource_id: subId })
      return new Response(JSON.stringify({ subscription: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
