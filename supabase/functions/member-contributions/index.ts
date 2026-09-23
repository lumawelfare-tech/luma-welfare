import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'
import { isValidContributionPeriod, mapInstalmentRpcError } from '../shared/instalments.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    if (req.method === 'GET' && action === 'instalments') {
      const contributionId = url.searchParams.get('contributionId')
      if (!contributionId) {
        return new Response(JSON.stringify({ message: 'contributionId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: envelope, error: envErr } = await adminClient
        .from('contributions')
        .select('id, member_id, subscription_id, package_id, period, amount, amount_paid, status, notes, created_at, packages(code, name)')
        .eq('id', contributionId)
        .eq('member_id', user.id)
        .maybeSingle()
      if (envErr || !envelope) {
        return new Response(JSON.stringify({ message: 'Contribution not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: instalments, error: instErr } = await adminClient
        .from('contribution_instalments')
        .select('id, amount, running_balance_after, status, payment_method, transaction_reference, notes, paid_at, created_at, recorded_as_admin')
        .eq('contribution_id', contributionId)
        .eq('member_id', user.id)
        .order('created_at', { ascending: true })
      if (instErr) throw new Error(instErr.message)
      const required = Number(envelope.amount ?? 0)
      const paid = Number(envelope.amount_paid ?? 0)
      return new Response(JSON.stringify({
        contribution: envelope,
        instalments: instalments ?? [],
        required_amount: required,
        amount_paid: paid,
        remaining: Math.max(0, Math.round((required - paid) * 100) / 100),
        fully_paid: paid >= required && required > 0,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (req.method === 'GET' && action === 'balance') {
      const subscriptionId = url.searchParams.get('subscriptionId')
      const period = url.searchParams.get('period')
      if (!subscriptionId || !isValidContributionPeriod(period)) {
        return new Response(JSON.stringify({ message: 'subscriptionId and period (YYYY-MM) are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: sub, error: subErr } = await adminClient
        .from('subscriptions')
        .select('id, status, package_id, package_tiers(amount, name)')
        .eq('id', subscriptionId)
        .eq('member_id', user.id)
        .maybeSingle()
      if (subErr || !sub) {
        return new Response(JSON.stringify({ message: 'Subscription not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const required = Number((sub.package_tiers as { amount?: number } | { amount?: number }[] | null) && !Array.isArray(sub.package_tiers)
        ? (sub.package_tiers as { amount?: number }).amount
        : (sub.package_tiers as { amount?: number }[] | null)?.[0]?.amount ?? 0)
      const { data: envelope } = await adminClient
        .from('contributions')
        .select('id, amount, amount_paid, status, period')
        .eq('subscription_id', subscriptionId)
        .eq('member_id', user.id)
        .eq('period', period)
        .maybeSingle()
      const { data: reservedRows } = await adminClient
        .from('contribution_instalments')
        .select('amount, status')
        .eq('subscription_id', subscriptionId)
        .eq('member_id', user.id)
        .eq('period', period)
        .in('status', ['Pending', 'Verified', 'Paid', 'Late'])
      const reserved = (reservedRows ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
      const paid = Number(envelope?.amount_paid ?? 0)
      const need = Number(envelope?.amount ?? required)
      return new Response(JSON.stringify({
        subscription_id: subscriptionId,
        period,
        required_amount: need,
        amount_paid: paid,
        reserved,
        remaining: Math.max(0, Math.round((need - reserved) * 100) / 100),
        remaining_verified: Math.max(0, Math.round((need - paid) * 100) / 100),
        fully_paid: paid >= need && need > 0,
        contribution_id: envelope?.id ?? null,
        status: envelope?.status ?? null,
        subscription_status: sub.status,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

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

      const result = (Array.isArray(data) ? data[0] : data) ?? { contributions: [], total: 0, page, per_page: perPage, pages: 1 }
      const payload = result as { contributions?: unknown; total?: number; page?: number; per_page?: number; pages?: number }
      return new Response(JSON.stringify({
        contributions: payload.contributions ?? [],
        total: Number(payload.total) ?? 0,
        page: payload.page ?? page,
        per_page: payload.per_page ?? perPage,
        pages: payload.pages ?? 1,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (req.method === 'POST') {
      const body = await req.json() as Record<string, unknown>
      const subscriptionId = String(body.subscriptionId ?? '')
      const period = String(body.period ?? '')
      const amount = Number(body.amount)
      const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null
      const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod.slice(0, 40) : null
      const transactionReference = typeof body.transactionReference === 'string' ? body.transactionReference.slice(0, 80) : null

      if (!subscriptionId || !isValidContributionPeriod(period) || !Number.isFinite(amount)) {
        return new Response(JSON.stringify({ message: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { data, error } = await adminClient.rpc('record_contribution_instalment', {
        p_member_id: user.id,
        p_subscription_id: subscriptionId,
        p_period: period,
        p_amount: amount,
        p_recorded_by: user.id,
        p_as_admin: false,
        p_notes: notes,
        p_payment_method: paymentMethod,
        p_transaction_reference: transactionReference,
      })
      if (error) {
        const mapped = mapInstalmentRpcError(error)
        return new Response(JSON.stringify({ message: mapped.message, code: mapped.code }), {
          status: mapped.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const payload = data as { instalment?: { id?: string }; contribution?: { id?: string } }
      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'recorded_instalment',
        resource: 'contribution_instalment',
        resource_id: payload?.instalment?.id ?? payload?.contribution?.id ?? null,
        meta: { period, amount, subscriptionId },
      })
      return new Response(JSON.stringify(data), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
