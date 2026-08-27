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

    // Packages list for filter dropdown
    if (action === 'packages') {
      requirePermission(session, 'members', 'read')
      const { data, error } = await adminClient.from('packages').select('id, name, code').order('name')
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ packages: data ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Saved Report Bookmarks — LIST
    if (action === 'bookmarks' && req.method === 'GET') {
      requirePermission(session, 'members', 'read')
      const { data, error } = await adminClient
        .from('saved_reports')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ bookmarks: data ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Saved Report Bookmarks — CREATE
    if (action === 'bookmarks' && req.method === 'POST') {
      requirePermission(session, 'members', 'read')
      const body = await req.json()
      if (!body.name || !body.report_type) {
        return new Response(JSON.stringify({ message: 'name and report_type are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data, error } = await adminClient
        .from('saved_reports')
        .insert({
          name: body.name,
          report_type: body.report_type,
          filters: body.filters ?? {},
          created_by: user.id,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ bookmark: data }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Saved Report Bookmarks — DELETE
    if (action === 'bookmarks' && req.method === 'DELETE') {
      requirePermission(session, 'members', 'read')
      const bookmarkId = url.searchParams.get('bookmark_id')
      if (!bookmarkId) {
        return new Response(JSON.stringify({ message: 'bookmark_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error } = await adminClient
        .from('saved_reports')
        .delete()
        .eq('id', bookmarkId)
        .eq('created_by', user.id)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ message: 'Deleted' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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

      const [regFeeResult, contribResult, claimResult] = await Promise.all([
        adminClient.rpc('get_registration_fee_stats'),
        adminClient.rpc('get_contribution_stats'),
        adminClient.rpc('get_claim_stats'),
      ])
      const regFeeStats = regFeeResult.data
      const contribStats = contribResult.data  
      const claimStats = claimResult.data

      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: 'report_generated', resource: 'report', meta: { type: 'financial-summary', format: 'json' } })

      return new Response(JSON.stringify({
        report: 'Financial Summary',
        summary: {
          registration_fees_collected: Number(regFeeStats?.[0]?.paid_amount ?? 0),
          total_contributions: Number(contribStats?.[0]?.verified_amount ?? 0),
          total_claims_approved: Number(claimStats?.[0]?.approved_amount ?? 0) + Number(claimStats?.[0]?.paid_amount ?? 0),
          registration_fees_count: Number(regFeeStats?.[0]?.paid_count ?? 0),
          contributions_count: Number(contribStats?.[0]?.verified_count ?? 0),
          claims_approved_count: Number(claimStats?.[0]?.approved_count ?? 0) + Number(claimStats?.[0]?.paid_count ?? 0),
        },
        generated_at: new Date().toISOString(),
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // KPI Overview — uses single RPC call instead of 7 parallel count queries
    if (action === 'kpi') {
      requirePermission(session, 'members', 'read')

      const { data: summary } = await adminClient.rpc('get_admin_dashboard_summary')
      const s = summary?.[0]

      // Financial stats via RPC
      const [contribs, claims, regFees] = await Promise.all([
        adminClient.rpc('get_contribution_stats'),
        adminClient.rpc('get_claim_stats'),
        adminClient.rpc('get_registration_fee_stats'),
      ])

      const contribData = contribs.data?.[0]
      const claimData = claims.data?.[0]
      const regFeeData = regFees.data?.[0]

      return new Response(JSON.stringify({
        kpi: {
          total_members: Number(s?.total_members ?? 0),
          active_subscriptions: Number(s?.active_subscriptions ?? 0),
          total_contributions: Number(contribData?.verified_amount ?? 0),
          total_claims_approved: Number(claimData?.approved_amount ?? 0) + Number(claimData?.paid_amount ?? 0),
          registration_fees_collected: Number(regFeeData?.paid_amount ?? 0),
          pending_contributions: Number(s?.pending_contributions ?? 0),
          pending_claims: Number(s?.pending_claims ?? 0),
          this_month_contributions: 0,
          this_month_claims: 0,
          contributions_growth_pct: 0,
          paid_registration_fees: Number(regFeeData?.paid_count ?? 0),
          unpaid_registration_fees: Number(regFeeData?.pending_count ?? 0),
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
    console.error('admin-reports error:', err)
    return new Response(JSON.stringify({ message: 'An unexpected error occurred.', code: 'INTERNAL' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
