import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, adminSessionDeniedResponse, requirePermission, handleAdminError, logAudit } from '../shared/supabase.ts'
import { sendNotification } from '../shared/notifications.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import { sanitizeSearch } from '../shared/search.ts'
import { maskMemberListFields } from '../shared/pii.ts'
import { isValidContributionPeriod, mapInstalmentRpcError } from '../shared/instalments.ts'

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

    if (req.method !== 'GET') {
      const rl = await rateLimitAsync(req, 'admin-contributions-mutation', { userId: session.id, adminClient })
      if (!rl.ok) return rl.response!
    }

    const url = new URL(req.url)
    const resourceId = url.searchParams.get('resource_id')
    const contribId = resourceId

    if (req.method === 'GET' && contribId) {
      requirePermission(session, 'contributions', 'read')
      const { data: envelope, error } = await adminClient
        .from('contributions')
        .select('id, member_id, subscription_id, package_id, period, amount, amount_paid, status, notes, created_at, members(full_name, membership_number), packages(code, name)')
        .eq('id', contribId)
        .single()
      if (error || !envelope) throw new Error('Contribution not found')
      const { data: instalments } = await adminClient
        .from('contribution_instalments')
        .select('id, amount, running_balance_after, status, payment_method, transaction_reference, notes, paid_at, created_at, recorded_as_admin, recorded_by')
        .eq('contribution_id', contribId)
        .order('created_at', { ascending: true })
      const required = Number(envelope.amount ?? 0)
      const paid = Number(envelope.amount_paid ?? 0)
      return new Response(JSON.stringify({
        contribution: maskMemberListFields(envelope as Record<string, unknown>),
        instalments: instalments ?? [],
        required_amount: required,
        amount_paid: paid,
        remaining: Math.max(0, Math.round((required - paid) * 100) / 100),
        fully_paid: paid >= required && required > 0,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (req.method === 'GET' && !contribId) {
      requirePermission(session, 'contributions', 'read')
      const status = url.searchParams.get('status')
      const q = sanitizeSearch(url.searchParams.get('q')) || null
      const dateFrom = url.searchParams.get('date_from')
      const dateTo = url.searchParams.get('date_to')
      const packageId = url.searchParams.get('package_id')
      const page = parseInt(url.searchParams.get('page') || '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '50'), 200)

      const { data, error } = await adminClient.rpc('admin_search_contributions', {
        p_q: q || null,
        p_status: status || null,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_package_id: packageId || null,
        p_page: page,
        p_per_page: perPage,
      })

      if (error) throw new Error(error.message)

      const result = data?.[0] ?? { contributions: [], total: 0, page, per_page: perPage, pages: 1 }
      const masked = ((result.contributions ?? []) as Record<string, unknown>[]).map((row) =>
        maskMemberListFields(row),
      )
      return new Response(JSON.stringify({
        contributions: masked,
        total: Number(result.total) ?? 0,
        page: result.page ?? page,
        per_page: result.per_page ?? perPage,
        pages: result.pages ?? 1,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (req.method === 'POST') {
      requirePermission(session, 'contributions', 'verify')
      const body = await req.json() as Record<string, unknown>
      const subscriptionId = String(body.subscriptionId ?? '')
      const period = String(body.period ?? '')
      const amount = Number(body.amount)
      const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null
      const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod.slice(0, 40) : 'manual'
      const transactionReference = typeof body.transactionReference === 'string' ? body.transactionReference.slice(0, 80) : null

      if (!subscriptionId || !isValidContributionPeriod(period) || !Number.isFinite(amount)) {
        return new Response(JSON.stringify({ message: 'subscriptionId, period (YYYY-MM), and amount are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: sub, error: subErr } = await adminClient
        .from('subscriptions')
        .select('id, member_id, status')
        .eq('id', subscriptionId)
        .maybeSingle()
      if (subErr || !sub) {
        return new Response(JSON.stringify({ message: 'Subscription not found', code: 'SUBSCRIPTION_NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await adminClient.rpc('record_contribution_instalment', {
        p_member_id: sub.member_id,
        p_subscription_id: subscriptionId,
        p_period: period,
        p_amount: amount,
        p_recorded_by: session.id,
        p_as_admin: true,
        p_notes: notes,
        p_payment_method: paymentMethod,
        p_transaction_reference: transactionReference,
      })
      if (error) {
        const mapped = mapInstalmentRpcError(error)
        return new Response(JSON.stringify({ message: mapped.message, code: mapped.code }), {
          status: mapped.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const payload = data as { instalment?: { id?: string }; contribution?: { id?: string; member_id?: string; amount?: number; period?: string }; remaining?: number }
      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'recorded_instalment',
        resource: 'contribution_instalment',
        resource_id: payload?.instalment?.id ?? null,
        meta: { period, amount, subscriptionId, remaining: payload?.remaining },
      })

      if (sub.member_id) {
        await sendNotification(adminClient, {
          memberId: sub.member_id,
          subject: 'Instalment recorded',
          body: `An administrator recorded KSh ${amount.toLocaleString('en-KE')} toward ${period}. Remaining verified balance is KSh ${Number(payload?.remaining ?? 0).toLocaleString('en-KE')}.`,
          emailButtonText: 'View Contributions',
          emailButtonUrl: 'https://luma-welfare.vercel.app/contributions',
        })
      }

      return new Response(JSON.stringify(data), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (req.method === 'PATCH' && contribId) {
      requirePermission(session, 'contributions', 'verify')
      const body = await req.json() as Record<string, unknown>
      const action = String(body.action ?? '')
      const notes = typeof body.notes === 'string' ? body.notes : undefined
      const instalmentId = typeof body.instalmentId === 'string' ? body.instalmentId : null

      if (action === 'verify_instalment' || action === 'reject_instalment') {
        if (!instalmentId) {
          return new Response(JSON.stringify({ message: 'instalmentId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        const { data, error } = await adminClient.rpc('verify_contribution_instalment', {
          p_instalment_id: instalmentId,
          p_action: action === 'verify_instalment' ? 'verify' : 'reject',
          p_notes: notes ?? null,
        })
        if (error) {
          const mapped = mapInstalmentRpcError(error)
          return new Response(JSON.stringify({ message: mapped.message, code: mapped.code }), {
            status: mapped.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        await logAudit(adminClient, {
          actor_id: session.id,
          actor_role: session.role_name,
          action: action === 'verify_instalment' ? 'verified_instalment' : 'rejected_instalment',
          resource: 'contribution_instalment',
          resource_id: instalmentId,
        })
        return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      if (!['verify', 'reject'].includes(action)) {
        return new Response(JSON.stringify({ message: 'Action must be verify or reject' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { data: pending } = await adminClient
        .from('contribution_instalments')
        .select('id')
        .eq('contribution_id', contribId)
        .eq('status', 'Pending')

      let last: unknown = null
      for (const row of pending ?? []) {
        const { data, error } = await adminClient.rpc('verify_contribution_instalment', {
          p_instalment_id: row.id,
          p_action: action === 'verify' ? 'verify' : 'reject',
          p_notes: notes ?? null,
        })
        if (error) {
          const mapped = mapInstalmentRpcError(error)
          return new Response(JSON.stringify({ message: mapped.message, code: mapped.code }), {
            status: mapped.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        last = data
      }

      if (!pending?.length) {
        const { data, error } = await adminClient
          .from('contributions').update({
            status: action === 'verify' ? 'Verified' : 'Failed',
            notes,
          })
          .eq('id', contribId).select('*, members(full_name), packages(name)').single()
        if (error) throw new Error('Contribution not found')
        last = { contribution: data }
      }

      const { data: envelope } = await adminClient
        .from('contributions')
        .select('*, members(full_name), packages(name)')
        .eq('id', contribId)
        .single()

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: action === 'verify' ? 'verified_contribution' : 'rejected_contribution',
        resource: 'contribution',
        resource_id: contribId,
      })

      if (envelope?.member_id) {
        const pkgName = (envelope.packages as unknown as { name: string | null })?.name ?? 'your package'
        const amount = Number(envelope.amount_paid ?? envelope.amount ?? 0)
        const period = envelope.period ?? ''
        const notifMsg = action === 'verify'
          ? { subject: 'Contribution Verified', body: `Your KSh ${amount.toLocaleString('en-KE')} contribution for ${pkgName} (${period}) has been verified. Thank you!` }
          : { subject: 'Contribution Rejected', body: `Your contribution for ${pkgName} (${period}) was not verified.${notes ? ` Reason: ${notes}` : ''}` }
        await sendNotification(adminClient, {
          memberId: envelope.member_id,
          subject: notifMsg.subject,
          body: notifMsg.body,
          emailButtonText: 'View Dashboard',
          emailButtonUrl: 'https://luma-welfare.vercel.app/member',
        })
      }

      return new Response(JSON.stringify({ contribution: envelope, result: last }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return handleAdminError(err, 'admin-contributions')
  }
})
