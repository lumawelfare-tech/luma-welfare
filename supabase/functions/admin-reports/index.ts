import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

/**
 * Admin Reports & Exports
 *
 * GET /admin-reports?action=registration-fees    — registration fee report
 * GET /admin-reports?action=contributions         — contributions report
 * GET /admin-reports?action=subscriptions         — subscriptions report
 * GET /admin-reports?action=claims                — claims report
 * GET /admin-reports?action=members               — members report
 * GET /admin-reports?action=financial-summary     — financial summary
 *
 * All return JSON. Frontend handles CSV/Excel/PDF generation from the data.
 */

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
    const action = url.searchParams.get('type') ?? url.searchParams.get('action') ?? 'financial-summary'
    const dateFrom = url.searchParams.get('dateFrom') ?? url.searchParams.get('from')
    const dateTo = url.searchParams.get('dateTo') ?? url.searchParams.get('to')
    const status = url.searchParams.get('status')
    const packageFilter = url.searchParams.get('package')

    // Registration Fees Report
    if (action === 'registration-fees') {
      requirePermission(session, 'members', 'read')
      let query = adminClient
        .from('registration_fees')
        .select('id, member_id, amount, currency, status, payment_method, mpesa_receipt, transaction_reference, paid_at, created_at, members(full_name, phone, email, membership_number)')
        .eq('fee_type', 'registration')
        .order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)
      if (dateFrom) query = query.gte('created_at', dateFrom)
      if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')

      const { data, error } = await query
      if (error) throw new Error(error.message)

      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'report_generated', resource: 'report', meta: { type: 'registration-fees', format: 'json' } })

      return new Response(JSON.stringify({ report: 'Registration Fees', data: data ?? [], generated_at: new Date().toISOString() }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Contributions Report
    if (action === 'contributions') {
      requirePermission(session, 'contributions', 'read')
      let query = adminClient
        .from('contributions')
        .select('id, period, amount, status, notes, created_at, member_id, members(full_name, phone, membership_number), packages(code, name), payments(mpesa_receipt, channel)')
        .order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)
      if (packageFilter) query = query.eq('package_id', packageFilter)
      if (dateFrom) query = query.gte('created_at', dateFrom)
      if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')

      const { data, error } = await query.limit(500)
      if (error) throw new Error(error.message)

      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'report_generated', resource: 'report', meta: { type: 'contributions', format: 'json' } })

      return new Response(JSON.stringify({ report: 'Contributions', data: data ?? [], generated_at: new Date().toISOString() }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Subscriptions Report
    if (action === 'subscriptions') {
      requirePermission(session, 'members', 'read')
      let query = adminClient
        .from('subscriptions')
        .select('id, status, started_at, next_due_date, cancelled_at, created_at, member_id, members(full_name, phone, email, membership_number), packages(code, name), package_tiers(name, amount)')
        .order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)
      if (packageFilter) query = query.eq('package_id', packageFilter)
      if (dateFrom) query = query.gte('created_at', dateFrom)
      if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')

      const { data, error } = await query.limit(500)
      if (error) throw new Error(error.message)

      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'report_generated', resource: 'report', meta: { type: 'subscriptions', format: 'json' } })

      return new Response(JSON.stringify({ report: 'Subscriptions', data: data ?? [], generated_at: new Date().toISOString() }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Claims Report
    if (action === 'claims') {
      requirePermission(session, 'claims', 'read')
      let query = adminClient
        .from('claims')
        .select('id, claim_number, claim_type, amount_requested, status, created_at, submitted_at, decided_at, member_id, members(full_name, phone, email), packages(code, name)')
        .order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)
      if (packageFilter) query = query.eq('package_id', packageFilter)
      if (dateFrom) query = query.gte('created_at', dateFrom)
      if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')

      const { data, error } = await query.limit(500)
      if (error) throw new Error(error.message)

      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'report_generated', resource: 'report', meta: { type: 'claims', format: 'json' } })

      return new Response(JSON.stringify({ report: 'Claims', data: data ?? [], generated_at: new Date().toISOString() }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Members Report
    if (action === 'members') {
      requirePermission(session, 'members', 'read')
      let query = adminClient
        .from('members')
        .select('id, membership_number, full_name, phone, email, status, joined_at, created_at')
        .order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)
      if (dateFrom) query = query.gte('created_at', dateFrom)
      if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')

      const { data, error } = await query.limit(500)
      if (error) throw new Error(error.message)

      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'report_generated', resource: 'report', meta: { type: 'members', format: 'json' } })

      return new Response(JSON.stringify({ report: 'Members', data: data ?? [], generated_at: new Date().toISOString() }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Financial Summary
    if (action === 'financial-summary') {
      requirePermission(session, 'members', 'read')

      const [regFeeStats, contribStats, claimStats] = await Promise.all([
        adminClient.from('registration_fees').select('status, amount').eq('fee_type', 'registration'),
        adminClient.from('contributions').select('status, amount'),
        adminClient.from('claims').select('status, amount_requested'),
      ])

      const totalRegFees = (regFeeStats.data ?? []).filter(f => f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)
      const totalContributions = (contribStats.data ?? []).filter(c => c.status === 'Verified' || c.status === 'Paid').reduce((s, c) => s + Number(c.amount), 0)
      const totalClaimsApproved = (claimStats.data ?? []).filter(c => c.status === 'Approved' || c.status === 'Paid').reduce((s, c) => s + Number(c.amount_requested ?? 0), 0)

      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'report_generated', resource: 'report', meta: { type: 'financial-summary', format: 'json' } })

      return new Response(JSON.stringify({
        report: 'Financial Summary',
        summary: {
          registration_fees_collected: totalRegFees,
          total_contributions: totalContributions,
          total_claims_approved: totalClaimsApproved,
          registration_fees_count: (regFeeStats.data ?? []).filter(f => f.status === 'paid').length,
          contributions_count: (contribStats.data ?? []).filter(c => c.status === 'Verified' || c.status === 'Paid').length,
          claims_approved_count: (claimStats.data ?? []).filter(c => c.status === 'Approved' || c.status === 'Paid').length,
        },
        generated_at: new Date().toISOString(),
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
