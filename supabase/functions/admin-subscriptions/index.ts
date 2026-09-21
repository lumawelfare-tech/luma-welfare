import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, adminSessionDeniedResponse, requirePermission, handleAdminError, logAudit } from '../shared/supabase.ts'
import { evaluateQualification } from '../shared/qualify.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const loaded = await loadAdminSession(adminClient, user.id, { req })
    if (loaded.status !== 'ok') {
      return adminSessionDeniedResponse(loaded)
    }
    const session = loaded.session

    const url = new URL(req.url)
    const resourceId = url.searchParams.get("resource_id")
    const action = url.searchParams.get('action')
    const subId = resourceId

    // POST /admin-subscriptions/:id/evaluate — run qualification engine and persist
    if (req.method === 'POST' && subId && action === 'evaluate') {
      requirePermission(session, 'members', 'read')

      const { data: sub, error: subError } = await adminClient
        .from('subscriptions')
        .select('id, member_id, package_id, started_at, status, members(status)')
        .eq('id', subId)
        .single()
      if (subError || !sub) {
        return new Response(JSON.stringify({ message: 'Subscription not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { data: rules } = await adminClient.from('package_rules').select('key, value').eq('package_id', sub.package_id)
      const { data: contributions } = await adminClient.from('contributions').select('status, period').eq('subscription_id', subId)
      const { data: existing } = await adminClient.from('qualifications').select('id').eq('subscription_id', subId).maybeSingle()

      const ruleMap: Record<string, unknown> = {}
      for (const r of rules ?? []) ruleMap[r.key] = r.value

      const memberRow = sub.members as unknown as { status: string } | { status: string }[] | null
      const memberStatus = Array.isArray(memberRow)
        ? (memberRow[0]?.status ?? 'pending_approval')
        : (memberRow?.status ?? 'pending_approval')

      const result = evaluateQualification(
        ruleMap,
        {
          memberStatus,
          subscriptionStatus: sub.status,
          startedAt: sub.started_at,
        },
        (contributions ?? []) as { status: string; period: string }[],
      )

      const payload = {
        subscription_id: subId,
        member_id: sub.member_id,
        package_id: sub.package_id,
        status: result.status,
        eligible_from: result.eligibleFrom,
        criteria_met: result.criteriaMet,
        evaluated_at: new Date().toISOString(),
        evaluated_by: session.id,
      }

      const { data: saved, error: saveError } = existing
        ? await adminClient.from('qualifications').update(payload).eq('id', existing.id).select().single()
        : await adminClient.from('qualifications').insert(payload).select().single()
      if (saveError) throw new Error(saveError.message)

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'evaluated_qualification',
        resource: 'subscription',
        resource_id: subId,
        meta: { status: result.status },
      })
      return new Response(JSON.stringify({ qualification: saved, criteria_met: result.criteriaMet }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

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
        .from('subscriptions').select('id, status, started_at, next_due_date, cancelled_at, created_at, member_id, members(full_name, phone, email, membership_number), packages(code, name), package_tiers(name, amount)', { count: 'exact' })
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
    return handleAdminError(err, 'admin-subscriptions')
  }
})
