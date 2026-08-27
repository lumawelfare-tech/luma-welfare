import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const session = await loadAdminSession(adminClient, user.id)
    if (!session) {
      return new Response(JSON.stringify({ message: 'No admin access', code: 'FORBIDDEN' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    requirePermission(session, 'members', 'read')

    // Optional date range for contributions chart
    const url = new URL(req.url)
    const dateFrom = url.searchParams.get('date_from') // YYYY-MM-DD
    const dateTo = url.searchParams.get('date_to')     // YYYY-MM-DD
    const drillMonth = url.searchParams.get('month')   // YYYY-MM for drill-down

    const rangeStart = dateFrom ? new Date(dateFrom) : (() => { const d = new Date(); d.setMonth(d.getMonth() - 12); return d })()
    const rangeEnd = dateTo ? new Date(dateTo + 'T23:59:59Z') : new Date()
    const rangeStartStr = rangeStart.toISOString()

    // ── Core KPIs: single RPC call replaces 7 sequential count queries ──
    const { data: summary } = await adminClient.rpc('get_admin_dashboard_summary')

    // ── Platform settings ──
    const { data: settings } = await adminClient
      .from('platform_settings')
      .select('key, value')
      .eq('key', 'stats')

    // ── Monthly contributions: SQL aggregation replaces fetching 5000 rows to JS ──
    const { data: monthlyContribRows } = await adminClient
      .rpc('get_admin_contributions_by_month', {
        p_from: rangeStartStr,
        p_to: rangeEnd.toISOString(),
      })

    // Generate month keys for the selected range (fill gaps)
    const monthlyContributions: Record<string, { total: number; verified: number; pending: number }> = {}
    const tempDate = new Date(rangeStart)
    tempDate.setDate(1)
    while (tempDate <= rangeEnd) {
      const key = `${tempDate.getFullYear()}-${String(tempDate.getMonth() + 1).padStart(2, '0')}`
      monthlyContributions[key] = { total: 0, verified: 0, pending: 0 }
      tempDate.setMonth(tempDate.getMonth() + 1)
    }

    if (monthlyContribRows) {
      for (const row of monthlyContribRows) {
        const key = row.month
        if (!monthlyContributions[key]) continue
        monthlyContributions[key].total = Number(row.total) || 0
        monthlyContributions[key].verified = Number(row.verified) || 0
        monthlyContributions[key].pending = Number(row.pending) || 0
      }
    }

    const monthlyContributionsArr = Object.entries(monthlyContributions).map(([month, v]) => ({
      month,
      label: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      total: v.total,
      verified: v.verified,
      pending: v.pending,
    }))

    // ── Package breakdown: SQL aggregation replaces fetching all active subs ──
    const { data: packageBreakdownArr } = await adminClient.rpc('get_admin_package_breakdown')

    // ── Claims by status: SQL aggregation replaces fetching rows to JS ──
    const { data: claimRows } = await adminClient
      .rpc('get_admin_claims_by_status', {
        p_from: rangeStartStr,
        p_to: rangeEnd.toISOString(),
      })

    const claimsByStatus: Record<string, number> = {}
    if (claimRows) {
      for (const row of claimRows) {
        claimsByStatus[row.status] = Number(row.count) || 0
      }
    }

    // ── Recent transactions (last 10) — this small query is fine ──
    const { data: recentContribs } = await adminClient
      .from('contributions')
      .select('id, amount, status, created_at, member:members(full_name), subscription:subscriptions(package_id, packages(name))')
      .gte('created_at', rangeStartStr)
      .lte('created_at', rangeEnd.toISOString())
      .order('created_at', { ascending: false })
      .limit(10)

    const recentTransactions = (recentContribs ?? []).map((r: Record<string, unknown>) => {
      const member = r.member as { full_name: string } | null
      const sub = r.subscription as { package_id: string; packages: { name: string } | null } | null
      return {
        id: r.id,
        amount: r.amount,
        status: r.status,
        date: r.created_at,
        member_name: member?.full_name ?? 'Unknown',
        package_name: sub?.packages?.name ?? 'Unknown',
      }
    })

    // ── Drill-down: individual transactions for a specific month ──
    let drillTransactions: unknown[] = []
    if (drillMonth) {
      const monthStart = `${drillMonth}-01T00:00:00Z`
      const d = new Date(`${drillMonth}-01T00:00:00Z`)
      d.setMonth(d.getMonth() + 1)
      const monthEnd = d.toISOString()

      const { data: drillRows } = await adminClient
        .from('contributions')
        .select('id, amount, status, period, notes, created_at, member:members(full_name, phone, email), subscription:subscriptions(package_id, packages(name))')
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd)
        .order('created_at', { ascending: false })

      drillTransactions = (drillRows ?? []).map((r: Record<string, unknown>) => {
        const member = r.member as { full_name: string; phone: string; email: string } | null
        const sub = r.subscription as { packages: { name: string } | null } | null
        return {
          id: r.id,
          amount: r.amount,
          status: r.status,
          period: r.period,
          date: r.created_at,
          member_name: member?.full_name ?? 'Unknown',
          member_phone: member?.phone ?? '',
          package_name: sub?.packages?.name ?? 'Unknown',
        }
      })
    }

    // ── Recent reports (small query, fine as-is) ──
    const { data: recentReports } = await adminClient
      .from('report_history')
      .select('id, schedule_name, report_type, filename, record_count, status, generated_at')
      .order('generated_at', { ascending: false })
      .limit(5)

    // ── Scheduled report stats: use count queries (small table, acceptable) ──
    const [totalSchedules, enabledSchedules] = await Promise.all([
      adminClient.from('scheduled_reports').select('id', { count: 'exact', head: true }),
      adminClient.from('scheduled_reports').select('id', { count: 'exact', head: true }).eq('enabled', true),
    ])

    // ── Report analytics: SQL aggregation replaces fetching all reports to JS ──
    const { data: reportAnalytics } = await adminClient
      .rpc('get_admin_report_analytics', {
        p_from: rangeStartStr,
        p_to: rangeEnd.toISOString(),
      })

    const analytics = reportAnalytics?.[0]
    const reportAnalyticsResult = {
      total_reports: Number(analytics?.total_reports ?? 0),
      successful: Number(analytics?.successful ?? 0),
      failed: Number(analytics?.failed ?? 0),
      success_rate: Number(analytics?.total_reports ?? 0) > 0
        ? Math.round((Number(analytics?.successful ?? 0) / Number(analytics?.total_reports ?? 1)) * 100)
        : 0,
      avg_records: Number(analytics?.avg_records ?? 0),
      total_records: Number(analytics?.total_records ?? 0),
      by_type: [] as unknown[],
      by_month: [] as unknown[],
      by_schedule: [] as unknown[],
    }

    // For detailed breakdowns (by_type, by_month, by_schedule), use targeted queries
    // instead of fetching all reports to JS
    const { data: allReports } = await adminClient
      .from('report_history')
      .select('schedule_name, report_type, record_count, status, generated_at')
      .gte('generated_at', rangeStartStr)
      .lte('generated_at', rangeEnd.toISOString())
      .order('generated_at', { ascending: true })
      .limit(2000)

    if (allReports && allReports.length > 0) {
      // Reports by type
      const typeMap: Record<string, { total: number; success: number; error: number; records: number }> = {}
      for (const r of allReports) {
        const t = r.report_type || 'unknown'
        if (!typeMap[t]) typeMap[t] = { total: 0, success: 0, error: 0, records: 0 }
        typeMap[t].total++
        if (r.status === 'success') typeMap[t].success++
        else typeMap[t].error++
        typeMap[t].records += r.record_count || 0
      }
      reportAnalyticsResult.by_type = Object.entries(typeMap).map(([type, v]) => ({
        type, total: v.total, success: v.success, error: v.error, records: v.records,
      })).sort((a: { total: number }, b: { total: number }) => b.total - a.total)

      // Reports by month
      const monthMap: Record<string, { total: number; success: number; error: number; records: number }> = {}
      for (const r of allReports) {
        const key = r.generated_at.substring(0, 7)
        if (!monthMap[key]) monthMap[key] = { total: 0, success: 0, error: 0, records: 0 }
        monthMap[key].total++
        if (r.status === 'success') monthMap[key].success++
        else monthMap[key].error++
        monthMap[key].records += r.record_count || 0
      }
      reportAnalyticsResult.by_month = Object.entries(monthMap).map(([month, v]) => ({
        month, label: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        total: v.total, success: v.success, error: v.error, records: v.records,
      }))

      // Reports by schedule
      const schedMap: Record<string, { total: number; success: number; error: number; lastRun: string }> = {}
      for (const r of allReports) {
        const s = r.schedule_name || 'Unknown'
        if (!schedMap[s]) schedMap[s] = { total: 0, success: 0, error: 0, lastRun: r.generated_at }
        schedMap[s].total++
        if (r.status === 'success') schedMap[s].success++
        else schedMap[s].error++
        if (r.generated_at > schedMap[s].lastRun) schedMap[s].lastRun = r.generated_at
      }
      reportAnalyticsResult.by_schedule = Object.entries(schedMap).map(([name, v]) => ({
        name, total: v.total, success: v.success, error: v.error, lastRun: v.lastRun,
      })).sort((a: { total: number }, b: { total: number }) => b.total - a.total)
    }

    // ── Phase 12: Additional analytics ──
    const [memberGrowth, paymentHealth, outstanding, qualifications, retention, membershipFunnel] = await Promise.all([
      adminClient.rpc('get_member_growth', { p_from: rangeStartStr, p_to: rangeEnd.toISOString() }),
      adminClient.rpc('get_payment_health', { p_from: rangeStartStr, p_to: rangeEnd.toISOString() }),
      adminClient.rpc('get_outstanding_obligations'),
      adminClient.rpc('get_qualification_analytics'),
      adminClient.rpc('get_contribution_retention'),
      adminClient.rpc('get_membership_funnel'),
    ])

    return new Response(JSON.stringify({
      // Core stats — from single RPC call
      members: Number(summary?.[0]?.total_members ?? 0),
      active_members: Number(summary?.[0]?.active_members ?? 0),
      new_members_period: Number(summary?.[0]?.new_members_period ?? 0),
      subscriptions: Number(summary?.[0]?.total_subscriptions ?? 0),
      pending_contributions: Number(summary?.[0]?.pending_contributions ?? 0),
      total_contributions: Number(summary?.[0]?.total_contributions ?? 0),
      verified_contributions: Number(summary?.[0]?.verified_contributions ?? 0),
      pending_claims: Number(summary?.[0]?.pending_claims ?? 0),
      approved_claims: Number(summary?.[0]?.approved_claims ?? 0),
      paid_claims: Number(summary?.[0]?.paid_claims ?? 0),
      total_claims: Number(summary?.[0]?.total_claims ?? 0),
      total_payments: Number(summary?.[0]?.total_payments ?? 0),
      completed_payments: Number(summary?.[0]?.completed_payments ?? 0),
      confirmed_stats: settings?.[0]?.value ?? {},

      // Phase 12: Growth, payments, obligations, qualifications, retention
      member_growth: memberGrowth.data ?? [],
      payment_health: paymentHealth.data?.[0] ?? { total_payments: 0, completed: 0, pending: 0, failed: 0, success_rate: 100, total_amount: 0, completed_amount: 0, avg_amount: 0 },
      outstanding: outstanding.data?.[0] ?? { approved_unpaid_claims: 0, approved_unpaid_amount: 0, pending_contributions: 0, pending_contribution_amount: 0, stale_pending_payments: 0, stale_pending_amount: 0 },
      qualifications: qualifications.data?.[0] ?? { qualified: 0, not_eligible: 0, at_risk: 0, revoked: 0, total: 0 },
      retention: retention.data?.[0] ?? { current_month_active: 0, previous_month_active: 0, retained: 0, retention_rate: 100, new_active: 0 },

      // Financial charts — from SQL aggregation
      monthly_contributions: monthlyContributionsArr,
      package_breakdown: packageBreakdownArr ?? [],
      claims_by_status: claimsByStatus,

      // Registration fees — from summary RPC
      registration_fees: {
        total: Number(summary?.[0]?.total_registration_fees ?? 0),
        paid: Number(summary?.[0]?.paid_registration_fees ?? 0),
        unpaid: Number(summary?.[0]?.unpaid_registration_fees ?? 0),
      },

      // Recent activity
      recent_transactions: recentTransactions,

      // Drill-down
      drill_month: drillMonth || null,
      drill_transactions: drillTransactions,

      // Recent report activity
      recent_reports: recentReports ?? [],

      // Scheduled report stats
      scheduled_report_stats: {
        total: totalSchedules.count ?? 0,
        enabled: enabledSchedules.count ?? 0,
      },

      // Report analytics — from SQL aggregation
      report_analytics: reportAnalyticsResult,

      // Membership funnel
      membership_funnel: membershipFunnel.data ?? [],
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('admin-dashboard error:', err)
    return new Response(JSON.stringify({ message: 'An unexpected error occurred.', code: 'INTERNAL' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
