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
    const subId = resourceId

    // GET /admin-subscriptions — list subscriptions
    if (req.method === 'GET' && !subId) {
      requirePermission(session, 'members', 'read')
      const status = url.searchParams.get('status')
      const q = url.searchParams.get('q')
      const dateFrom = url.searchParams.get('date_from')
      const dateTo = url.searchParams.get('date_to')
      const packageId = url.searchParams.get('package_id')
      const page = parseInt(url.searchParams.get('page') || '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '50'), 200)
      let query = adminClient
        .from('subscriptions').select('id, status, started_at, next_due_date, cancelled_at, created_at, member_id, members(full_name, phone, membership_number), packages(code, name), package_tiers(name, amount)', { count: 'exact' })
        .order('created_at', { ascending: false })
      if (status) query = query.eq('status', status)
      if (packageId) query = query.eq('package_id', packageId)
      if (dateFrom) query = query.gte('created_at', dateFrom)
      if (dateTo) query = query.lt('created_at', new Date(new Date(dateTo).getTime() + 86400000).toISOString())
      if (q && q.trim()) {
        const search = q.trim()
        query = query.or(`members.full_name.ilike.%${search}%,members.phone.ilike.%${search}%,members.membership_number.ilike.%${search}%,packages.name.ilike.%${search}%`)
      }
      query = query.range((page - 1) * perPage, page * perPage - 1)
      const { data, error, count } = await query
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ subscriptions: data ?? [], total: count ?? 0, page, per_page: perPage, pages: Math.ceil((count ?? 0) / perPage) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
    console.error('admin-subscriptions error:', err)
    return new Response(JSON.stringify({ message: 'An unexpected error occurred.', code: 'INTERNAL' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
