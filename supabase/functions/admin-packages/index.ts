import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const adminClient = createAdminClient()
    const session = await loadAdminSession(adminClient, user.id)
    if (!session) {
      return new Response(JSON.stringify({ message: 'No admin access', code: 'FORBIDDEN' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const url = new URL(req.url)
    const resourceId = url.searchParams.get("resource_id")
    const action = url.searchParams.get("action")
    const pkgId = resourceId

    // GET /admin-packages — list all packages with tiers and rules
    if (req.method === 'GET' && !pkgId) {
      requirePermission(session, 'packages', 'read')
      const { data: packages } = await adminClient.from('packages').select('*').order('sort_order')
      const { data: tiers } = await adminClient.from('package_tiers').select('*')
      const { data: rules } = await adminClient.from('package_rules').select('*')
      return new Response(JSON.stringify({
        packages: (packages ?? []).map((p) => ({
          ...p,
          tiers: (tiers ?? []).filter((t) => t.package_id === p.id),
          rules: (rules ?? []).filter((r) => r.package_id === p.id).reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {}),
        })),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /admin-packages — create package
    if (req.method === 'POST' && !pkgId) {
      requirePermission(session, 'packages', 'create')
      const body = await req.json()
      const { code, name, description, coverage, waitingPeriodMonths, sortOrder, payoutRule } = body
      if (!code || !name) {
        return new Response(JSON.stringify({ message: 'Code and name are required', code: 'VALIDATION' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data, error } = await adminClient.from('packages').insert({
        code, name, description: description || null, coverage: Array.isArray(coverage) ? coverage : null, waiting_period_months: waitingPeriodMonths != null ? Number(waitingPeriodMonths) : null, sort_order: sortOrder ?? 0, payout_rule: payoutRule || null,
      }).select().single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'created_package', resource: 'package', resource_id: data.id })
      return new Response(JSON.stringify({ package: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PATCH /admin-packages/:id — update package
    if (req.method === 'PATCH' && pkgId) {
      requirePermission(session, 'packages', 'update')
      const body = await req.json()
      const { data, error } = await adminClient.from('packages').update({
        name: body.name, description: body.description, coverage: body.coverage, waiting_period_months: body.waitingPeriodMonths, sort_order: body.sortOrder, payout_rule: body.payoutRule,
      }).eq('id', pkgId).select().single()
      if (error) throw new Error('Package not found')
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'updated_package', resource: 'package', resource_id: pkgId })
      return new Response(JSON.stringify({ package: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /admin-packages?id=xxx&action=tiers — add tier
    if (req.method === 'POST' && pkgId && action === 'tiers') {
      requirePermission(session, 'packages', 'update')
      const body = await req.json()
      const { data, error } = await adminClient.from('package_tiers').insert({ package_id: pkgId, name: body.name, amount: body.amount, description: body.description }).select().single()
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ tier: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PUT /admin-packages?id=xxx&action=rules — replace rules
    if (req.method === 'PUT' && pkgId && action === 'rules') {
      requirePermission(session, 'packages', 'update')
      const body = await req.json()
      await adminClient.from('package_rules').delete().eq('package_id', pkgId)
      for (const [key, value] of Object.entries(body)) {
        await adminClient.from('package_rules').insert({ package_id: pkgId, key, value: String(value ?? '') })
      }
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'updated_package_rules', resource: 'package', resource_id: pkgId })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /admin-packages?id=xxx&action=retire — retire package
    if (req.method === 'POST' && pkgId && action === 'retire') {
      requirePermission(session, 'packages', 'update')
      const { data, error } = await adminClient.from('packages').update({ is_active: false }).eq('id', pkgId).select('id, name').single()
      if (error) throw new Error('Package not found')
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'retired_package', resource: 'package', resource_id: pkgId })
      return new Response(JSON.stringify({ ok: true, package: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('admin-packages error:', err)
    return new Response(JSON.stringify({ message: 'An unexpected error occurred.', code: 'INTERNAL' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
