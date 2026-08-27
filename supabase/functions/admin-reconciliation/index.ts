/**
 * admin-reconciliation — Financial reconciliation and exception management
 *
 * GET  /admin-reconciliation?action=summary          — reconciliation summary
 * GET  /admin-reconciliation?action=exceptions       — list reconciliation exceptions
 * GET  /admin-reconciliation?action=timeline&id=xxx  — payment timeline
 * GET  /admin-reconciliation?action=search            — search payments/transactions
 * PATCH /admin-reconciliation?id=xxx                  — resolve exception
 *
 * Admin-only. Requires payments:read or payments:verify permission.
 */

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
    const action = url.searchParams.get('action') ?? 'summary'
    const resourceId = url.searchParams.get('id')

    // GET — Reconciliation summary
    if (req.method === 'GET' && action === 'summary') {
      requirePermission(session, 'payments', 'read')

      const { data: summary } = await adminClient.rpc('get_reconciliation_summary')
      const s = summary?.[0]

      return new Response(JSON.stringify({
        summary: {
          total_payments: Number(s?.total_payments ?? 0),
          completed_payments: Number(s?.completed_payments ?? 0),
          pending_payments: Number(s?.pending_payments ?? 0),
          failed_payments: Number(s?.failed_payments ?? 0),
          total_contributions: Number(s?.total_contributions ?? 0),
          paid_contributions: Number(s?.paid_contributions ?? 0),
          pending_contributions: Number(s?.pending_contributions ?? 0),
          payments_without_contributions: Number(s?.payments_without_contributions ?? 0),
          contributions_without_payments: Number(s?.contributions_without_payments ?? 0),
          open_exceptions: Number(s?.open_exceptions ?? 0),
          total_amount_received: Number(s?.total_amount_received ?? 0),
          total_amount_contributed: Number(s?.total_amount_contributed ?? 0),
        },
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET — List reconciliation exceptions
    if (req.method === 'GET' && action === 'exceptions') {
      requirePermission(session, 'payments', 'read')

      const status = url.searchParams.get('status') ?? 'open'
      const severity = url.searchParams.get('severity')
      const page = parseInt(url.searchParams.get('page') ?? '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') ?? '50'), 200)

      let query = adminClient
        .from('reconciliation_exceptions')
        .select('*, members(full_name, membership_number)', { count: 'exact' })
        .eq('status', status)
        .order('created_at', { ascending: false })

      if (severity) query = query.eq('severity', severity)

      const offset = (page - 1) * perPage
      query = query.range(offset, offset + perPage - 1)

      const { data, error, count } = await query
      if (error) throw new Error(error.message)

      return new Response(JSON.stringify({
        exceptions: data ?? [],
        total: count ?? 0,
        page,
        per_page: perPage,
        total_pages: Math.ceil((count ?? 0) / perPage),
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET — Payment timeline
    if (req.method === 'GET' && action === 'timeline' && resourceId) {
      requirePermission(session, 'payments', 'read')

      // Get payment details
      const { data: payment, error: payErr } = await adminClient
        .from('payments')
        .select('*, members(full_name, membership_number), packages(name)')
        .eq('id', resourceId)
        .single()

      if (payErr || !payment) return new Response(JSON.stringify({ message: 'Payment not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      // Get timeline
      const { data: timeline } = await adminClient
        .rpc('get_payment_timeline', { p_payment_id: resourceId })

      // Get related contribution
      const { data: contribution } = await adminClient
        .from('contributions')
        .select('id, period, amount, status, created_at')
        .eq('payment_id', resourceId)
        .maybeSingle()

      // Get related ledger entries
      const { data: ledgerEntries } = await adminClient
        .from('financial_ledger')
        .select('id, entry_type, amount, reference, description, created_at')
        .eq('transaction_id', resourceId)
        .order('created_at')

      return new Response(JSON.stringify({
        payment: {
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
          mpesa_receipt: payment.mpesa_receipt,
          checkout_request_id: payment.checkout_request_id,
          phone: payment.phone,
          channel: payment.channel,
          failure_reason: payment.failure_reason,
          created_at: payment.created_at,
          member: payment.members,
          package: payment.packages,
        },
        timeline: timeline ?? [],
        contribution: contribution ?? null,
        ledger_entries: ledgerEntries ?? [],
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET — Search payments
    if (req.method === 'GET' && action === 'search') {
      requirePermission(session, 'payments', 'read')

      const q = url.searchParams.get('q') ?? ''
      const status = url.searchParams.get('status')
      const page = parseInt(url.searchParams.get('page') ?? '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') ?? '50'), 200)

      let query = adminClient
        .from('payments')
        .select('id, amount, status, mpesa_receipt, checkout_request_id, phone, channel, created_at, members(full_name, membership_number)', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)
      if (q) {
        query = query.or(`mpesa_receipt.ilike.%${q}%,checkout_request_id.ilike.%${q}%,phone.ilike.%${q}%`)
      }

      const offset = (page - 1) * perPage
      query = query.range(offset, offset + perPage - 1)

      const { data, error, count } = await query
      if (error) throw new Error(error.message)

      return new Response(JSON.stringify({
        payments: data ?? [],
        total: count ?? 0,
        page,
        per_page: perPage,
        total_pages: Math.ceil((count ?? 0) / perPage),
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET — Orphan payments (completed but no contribution linked)
    if (req.method === 'GET' && action === 'orphan-payments') {
      requirePermission(session, 'payments', 'read')

      const page = parseInt(url.searchParams.get('page') ?? '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') ?? '20'), 100)
      const offset = (page - 1) * perPage

      // Find completed payments with no matching contribution
      const { data, error, count } = await adminClient
        .from('payments')
        .select('id, amount, status, mpesa_receipt, phone, created_at, member_id, subscription_id, package_id, members(full_name, membership_number, phone)', { count: 'exact' })
        .eq('status', 'Completed')
        .not('id', 'in', adminClient.from('contributions').select('payment_id').not('payment_id', 'is', null))
        .order('created_at', { ascending: false })
        .range(offset, offset + perPage - 1)

      // Fallback: simpler query if the above doesn't work well with subquery
      let orphanPayments = data ?? []
      let orphanTotal = count ?? 0

      if (!data || data.length === 0) {
        // Alternative: get all completed payments, then filter
        const { data: allCompleted } = await adminClient
          .from('payments')
          .select('id, amount, status, mpesa_receipt, phone, created_at, member_id, subscription_id, package_id, members(full_name, membership_number, phone)')
          .eq('status', 'Completed')
          .order('created_at', { ascending: false })
          .limit(500)

        const { data: linkedPaymentIds } = await adminClient
          .from('contributions')
          .select('payment_id')
          .not('payment_id', 'is', null)

        const linkedSet = new Set((linkedPaymentIds ?? []).map((c: { payment_id: string }) => c.payment_id))
        orphanPayments = (allCompleted ?? []).filter((p: { id: string }) => !linkedSet.has(p.id))
        orphanTotal = orphanPayments.length
      }

      return new Response(JSON.stringify({
        payments: orphanPayments,
        total: orphanTotal,
        page,
        per_page: perPage,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET — Unmatched contributions (contributions with no linked payment)
    if (req.method === 'GET' && action === 'unmatched-contributions') {
      requirePermission(session, 'contributions', 'read')

      const page = parseInt(url.searchParams.get('page') ?? '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') ?? '20'), 100)
      const offset = (page - 1) * perPage

      const { data, error, count } = await adminClient
        .from('contributions')
        .select('id, period, amount, status, created_at, member_id, package_id, payment_id, members(full_name, membership_number), packages(name)', { count: 'exact' })
        .is('payment_id', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + perPage - 1)

      if (error) throw new Error(error.message)

      return new Response(JSON.stringify({
        contributions: data ?? [],
        total: count ?? 0,
        page,
        per_page: perPage,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET — Stale pending payments (pending >30 minutes without callback)
    if (req.method === 'GET' && action === 'stale-pending') {
      requirePermission(session, 'payments', 'read')

      const { data, error } = await adminClient
        .from('payments')
        .select('id, amount, status, phone, checkout_request_id, created_at, member_id, members(full_name, membership_number, phone)')
        .eq('status', 'Pending')
        .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true })

      if (error) throw new Error(error.message)

      return new Response(JSON.stringify({
        payments: data ?? [],
        total: (data ?? []).length,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH — Mark stale payment as failed
    if (req.method === 'PATCH' && action === 'mark-failed' && resourceId) {
      requirePermission(session, 'payments', 'verify')

      const body = await req.json().catch(() => ({}))
      const reason = body.reason ?? 'Marked as failed by admin — stale pending payment'

      const { data, error } = await adminClient
        .from('payments')
        .update({
          status: 'Failed',
          failure_reason: reason,
        })
        .eq('id', resourceId)
        .eq('status', 'Pending')
        .select('id, amount, status')
        .single()

      if (error || !data) return new Response(JSON.stringify({ message: 'Payment not found or not pending' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'payment_marked_failed',
        resource: 'payment',
        resource_id: resourceId,
        meta: { reason, amount: data.amount },
      })

      return new Response(JSON.stringify({ payment: data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH — Link orphan payment to a contribution
    if (req.method === 'PATCH' && action === 'link-payment' && resourceId) {
      requirePermission(session, 'payments', 'verify')

      const body = await req.json()
      const { contribution_id } = body

      if (!contribution_id) {
        return new Response(JSON.stringify({ message: 'contribution_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Verify the contribution exists and is not already linked
      const { data: contrib, error: contribErr } = await adminClient
        .from('contributions')
        .select('id, payment_id, amount, member_id')
        .eq('id', contribution_id)
        .single()

      if (contribErr || !contrib) {
        return new Response(JSON.stringify({ message: 'Contribution not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      if (contrib.payment_id) {
        return new Response(JSON.stringify({ message: 'Contribution already linked to a payment' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Link the payment
      const { error: linkErr } = await adminClient
        .from('contributions')
        .update({ payment_id: resourceId })
        .eq('id', contribution_id)

      if (linkErr) throw new Error(linkErr.message)

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'payment_linked_to_contribution',
        resource: 'payment',
        resource_id: resourceId,
        meta: { contribution_id },
      })

      return new Response(JSON.stringify({ success: true, contribution_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH — Resolve exception
    if (req.method === 'PATCH' && resourceId) {
      requirePermission(session, 'payments', 'verify')

      const body = await req.json()
      const { status: newStatus, resolution_notes } = body

      if (!['resolved', 'ignored'].includes(newStatus)) {
        return new Response(JSON.stringify({ message: 'Status must be resolved or ignored' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { data, error } = await adminClient
        .from('reconciliation_exceptions')
        .update({
          status: newStatus,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          resolution_notes: resolution_notes ?? null,
        })
        .eq('id', resourceId)
        .select()
        .single()

      if (error) throw new Error('Exception not found')

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: `reconciliation_${newStatus}`,
        resource: 'reconciliation_exception',
        resource_id: resourceId,
        meta: { resolution_notes },
      })

      return new Response(JSON.stringify({ exception: data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('admin-reconciliation error:', err)
    return new Response(JSON.stringify({ message: 'An unexpected error occurred.', code: 'INTERNAL' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
