import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const url = new URL(req.url)

    // GET /member-contributions — list contributions with pagination
    if (req.method === 'GET') {
      const subId = url.searchParams.get('subscriptionId')
      const status = url.searchParams.get('status')
      const page = parseInt(url.searchParams.get('page') || '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100)

      const { data, error } = await adminClient.rpc('member_search_contributions', {
        p_member_id: user.id,
        p_subscription_id: subId || null,
        p_status: status || null,
        p_page: page,
        p_per_page: perPage,
      })
      if (error) throw new Error(error.message)

      const result = data?.[0] ?? { contributions: [], total: 0, page, per_page: perPage, pages: 1 }
      return new Response(JSON.stringify({
        contributions: result.contributions ?? [],
        total: Number(result.total) ?? 0,
        page: result.page ?? page,
        per_page: result.per_page ?? perPage,
        pages: result.pages ?? 1,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /member-contributions — record contribution
    if (req.method === 'POST') {
      const body = await req.json()
      const { subscriptionId, period, amount } = body

      if (!subscriptionId || !period || !amount) {
        return new Response(JSON.stringify({ message: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Verify subscription
      const { data: sub, error: subErr } = await adminClient
        .from('subscriptions').select('id, status, package_id, package_tiers(amount)')
        .eq('id', subscriptionId).eq('member_id', user.id).single()
      if (subErr || !sub) return new Response(JSON.stringify({ message: 'Subscription not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      if (sub.status !== 'active') return new Response(JSON.stringify({ message: 'Package not active yet', code: 'SUBSCRIPTION_INACTIVE' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      // Validate amount
      const expected = Number(sub.package_tiers?.[0]?.amount ?? 0)
      if (expected > 0 && amount !== expected) {
        return new Response(JSON.stringify({ message: `Monthly contribution is KSh ${expected}`, code: 'AMOUNT_MISMATCH' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Check duplicate
      const { data: existing } = await adminClient
        .from('contributions').select('id').eq('subscription_id', subscriptionId).eq('period', period).maybeSingle()
      if (existing) return new Response(JSON.stringify({ message: 'Contribution already exists for this period', code: 'DUPLICATE_PERIOD' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      const { data, error } = await adminClient
        .from('contributions').insert({
          subscription_id: subscriptionId, member_id: user.id, package_id: sub.package_id,
          period, amount, status: 'Pending', recorded_by: user.id,
        }).select().single()
      if (error) throw new Error(error.message)

      await logAudit(adminClient, { actor_id: user.id, action: 'recorded_contribution', resource: 'contribution', resource_id: data.id })
      return new Response(JSON.stringify({ contribution: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
