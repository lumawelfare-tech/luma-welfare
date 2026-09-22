import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, adminSessionDeniedResponse, requirePermission, handleAdminError, logAudit } from '../shared/supabase.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import { validateTierAgeOverlaps } from '../shared/package-tiers.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const adminClient = createAdminClient()
    const loaded = await loadAdminSession(adminClient, user.id, { req })
    if (loaded.status !== 'ok') {
      return adminSessionDeniedResponse(loaded)
    }
    const session = loaded.session

    if (req.method !== 'GET') {
      const rl = await rateLimitAsync(req, 'admin-packages-mutation', { userId: session.id, adminClient })
      if (!rl.ok) return rl.response!
    }

    const url = new URL(req.url)
    const resourceId = url.searchParams.get('resource_id')
    const action = url.searchParams.get('action')
    const pkgId = resourceId

    // GET /admin-packages — list all packages with tiers and rules
    if (req.method === 'GET' && !pkgId) {
      requirePermission(session, 'packages', 'read')
      const { data: packages } = await adminClient.from('packages').select('*').order('sort_order')
      const { data: tiers } = await adminClient.from('package_tiers').select('*').order('sort_order')
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
      const { code, name, description, coverage, waitingPeriodMonths, sortOrder, payoutRule, parentPackageId } = body
      if (!code || !name) {
        return new Response(JSON.stringify({ message: 'Code and name are required', code: 'VALIDATION' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (parentPackageId) {
        const { data: parent } = await adminClient.from('packages').select('id, parent_package_id').eq('id', parentPackageId).maybeSingle()
        if (!parent) {
          return new Response(JSON.stringify({ message: 'Parent package not found', code: 'VALIDATION' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        if (parent.parent_package_id) {
          return new Response(JSON.stringify({ message: 'Cannot nest under a sub-category (max one nesting level).', code: 'VALIDATION' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
      }
      const { data, error } = await adminClient.from('packages').insert({
        code,
        name,
        description: description || null,
        coverage: Array.isArray(coverage) ? coverage : null,
        waiting_period_months: waitingPeriodMonths != null ? Number(waitingPeriodMonths) : null,
        sort_order: sortOrder ?? 0,
        payout_rule: payoutRule || null,
        parent_package_id: parentPackageId || null,
      }).select().single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'created_package', resource: 'package', resource_id: data.id })
      return new Response(JSON.stringify({ package: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PATCH /admin-packages/:id — update package
    if (req.method === 'PATCH' && pkgId) {
      requirePermission(session, 'packages', 'update')
      const body = await req.json()
      if (body.parentPackageId === pkgId) {
        return new Response(JSON.stringify({ message: 'A package cannot be its own parent.', code: 'VALIDATION' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (body.parentPackageId) {
        const { data: parent } = await adminClient.from('packages').select('id, parent_package_id').eq('id', body.parentPackageId).maybeSingle()
        if (!parent || parent.parent_package_id) {
          return new Response(JSON.stringify({ message: 'Invalid parent package (must be top-level).', code: 'VALIDATION' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
      }
      const patch: Record<string, unknown> = {
        name: body.name,
        description: body.description,
        coverage: body.coverage,
        waiting_period_months: body.waitingPeriodMonths,
        sort_order: body.sortOrder,
        payout_rule: body.payoutRule,
      }
      if ('parentPackageId' in body) {
        patch.parent_package_id = body.parentPackageId || null
      }
      const { data, error } = await adminClient.from('packages').update(patch).eq('id', pkgId).select().single()
      if (error) throw new Error('Package not found')
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'updated_package', resource: 'package', resource_id: pkgId })
      return new Response(JSON.stringify({ package: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /admin-packages?resource_id=xxx&action=tiers — add tier
    if (req.method === 'POST' && pkgId && action === 'tiers') {
      requirePermission(session, 'packages', 'update')
      const body = await req.json()
      const parseOptionalAge = (raw: unknown): number | null => {
        if (raw == null || raw === '') return null
        const n = Number(raw)
        return Number.isFinite(n) ? n : null
      }
      const minAge = parseOptionalAge(body.minAge)
      const maxAge = parseOptionalAge(body.maxAge)
      const { data: existing } = await adminClient.from('package_tiers').select('name, min_age, max_age').eq('package_id', pkgId)
      const overlap = validateTierAgeOverlaps([
        ...(existing ?? []).map((t) => ({ name: t.name, min_age: t.min_age, max_age: t.max_age })),
        { name: body.name, min_age: minAge, max_age: maxAge },
      ])
      if (overlap) {
        return new Response(JSON.stringify({ message: overlap, code: 'VALIDATION' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data, error } = await adminClient.from('package_tiers').insert({
        package_id: pkgId,
        name: body.name,
        amount: body.amount,
        description: body.description,
        min_age: minAge,
        max_age: maxAge,
      }).select().single()
      if (error) throw new Error(error.message)
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'added_package_tier', resource: 'package', resource_id: pkgId })
      return new Response(JSON.stringify({ tier: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PUT /admin-packages?resource_id=xxx&action=tiers — replace all tiers
    if (req.method === 'PUT' && pkgId && action === 'tiers') {
      requirePermission(session, 'packages', 'update')
      const body = await req.json()
      type TierInput = {
        name?: unknown
        amount?: unknown
        description?: unknown
        minAge?: unknown
        maxAge?: unknown
        sortOrder?: unknown
      }
      const parseOptionalAge = (raw: unknown): number | null => {
        if (raw == null || raw === '') return null
        const n = Number(raw)
        return Number.isFinite(n) ? n : null
      }
      const rows: unknown[] = Array.isArray(body.tiers) ? body.tiers : []
      const normalized = rows.map((raw, i) => {
        const t = (raw && typeof raw === 'object' ? raw : {}) as TierInput
        const sortRaw = t.sortOrder
        const sortOrder = typeof sortRaw === 'number' && Number.isFinite(sortRaw) ? sortRaw : i + 1
        return {
          name: String(t.name ?? '').trim(),
          amount: Number(t.amount),
          description: t.description == null ? null : String(t.description),
          min_age: parseOptionalAge(t.minAge),
          max_age: parseOptionalAge(t.maxAge),
          sort_order: sortOrder,
        }
      })
      if (normalized.some((t) => !t.name || !Number.isFinite(t.amount) || t.amount < 0)) {
        return new Response(JSON.stringify({ message: 'Each tier needs a name and a non-negative amount.', code: 'VALIDATION' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const overlap = validateTierAgeOverlaps(normalized.map((t) => ({ name: t.name, min_age: t.min_age, max_age: t.max_age })))
      if (overlap) {
        return new Response(JSON.stringify({ message: overlap, code: 'VALIDATION' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      await adminClient.from('package_tiers').delete().eq('package_id', pkgId)
      if (normalized.length > 0) {
        const { error } = await adminClient.from('package_tiers').insert(
          normalized.map((t) => ({ ...t, package_id: pkgId, is_active: true })),
        )
        if (error) throw new Error(error.message)
      }
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'replaced_package_tiers', resource: 'package', resource_id: pkgId })
      const { data: tiers } = await adminClient.from('package_tiers').select('*').eq('package_id', pkgId).order('sort_order')
      return new Response(JSON.stringify({ tiers: tiers ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
    return handleAdminError(err, 'admin-packages')
  }
})
