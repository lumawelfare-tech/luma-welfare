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

    // Core counts
    const [members, subs, pendingContribs, pendingClaims, approvedClaims, paidClaims, settings] = await Promise.all([
      adminClient.from('members').select('id', { count: 'exact', head: true }),
      adminClient.from('subscriptions').select('id', { count: 'exact', head: true }),
      adminClient.from('contributions').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
      adminClient.from('claims').select('id', { count: 'exact', head: true }).in('status', ['Submitted', 'Under Review', 'Additional Information Required']),
      adminClient.from('claims').select('id', { count: 'exact', head: true }).eq('status', 'Approved'),
      adminClient.from('claims').select('id', { count: 'exact', head: true }).eq('status', 'Paid'),
      adminClient.from('platform_settings').select('key, value').eq('key', 'stats'),
    ])

    // Financial data — contributions by month
    // Determine date range: use provided range or default to last 12 months
    const rangeStart = dateFrom ? new Date(dateFrom) : (() => { const d = new Date(); d.setMonth(d.getMonth() - 12); return d })()
    const rangeEnd = dateTo ? new Date(dateTo + 'T23:59:59Z') : new Date()
    const rangeStartStr = rangeStart.toISOString()

    const { data: contribRows } = await adminClient
      .from('contributions')
      .select('amount, created_at, status')
      .gte('created_at', rangeStartStr)
      .lte('created_at', rangeEnd.toISOString())
      .order('created_at', { ascending: true })

    // Generate month keys for the selected range
    const monthlyContributions: Record<string, { total: number; verified: number; pending: number }> = {}
    const tempDate = new Date(rangeStart)
    tempDate.setDate(1) // Start from the 1st of the month
    while (tempDate <= rangeEnd) {
      const key = `${tempDate.getFullYear()}-${String(tempDate.getMonth() + 1).padStart(2, '0')}`
      monthlyContributions[key] = { total: 0, verified: 0, pending: 0 }
      tempDate.setMonth(tempDate.getMonth() + 1)
    }

    if (contribRows) {
      for (const row of contribRows) {
        const key = row.created_at.substring(0, 7) // YYYY-MM
        if (!monthlyContributions[key]) continue
        const amt = Number(row.amount) || 0
        monthlyContributions[key].total += amt
        if (row.status === 'Verified') {
          monthlyContributions[key].verified += amt
        } else {
          monthlyContributions[key].pending += amt
        }
      }
    }

    const monthlyContributionsArr = Object.entries(monthlyContributions).map(([month, v]) => ({
      month,
      label: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      total: v.total,
      verified: v.verified,
      pending: v.pending,
    }))

    // Package subscription breakdown
    const { data: subRows } = await adminClient
      .from('subscriptions')
      .select('package_id, packages(name)')
      .eq('status', 'active')

    const packageBreakdown: Record<string, number> = {}
    if (subRows) {
      for (const sub of subRows) {
        const name = (sub.packages as { name: string } | null)?.name ?? 'Unknown'
        packageBreakdown[name] = (packageBreakdown[name] || 0) + 1
      }
    }
    const packageBreakdownArr = Object.entries(packageBreakdown)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    // Registration fee stats
    const [totalRegFees, paidRegFees, pendingRegFees] = await Promise.all([
      adminClient.from('registration_fees').select('id', { count: 'exact', head: true }),
      adminClient.from('registration_fees').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
      adminClient.from('registration_fees').select('id', { count: 'exact', head: true }).eq('status', 'unpaid'),
    ])

    // Recent transactions (last 10)
    const { data: recentContribs } = await adminClient
      .from('contributions')
      .select('id, amount, status, created_at, member:members(full_name), subscription:subscriptions(package_id, packages(name))')
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

    // Claims breakdown
    const { data: claimRows } = await adminClient
      .from('claims')
      .select('status')

    const claimsByStatus: Record<string, number> = {}
    if (claimRows) {
      for (const c of claimRows) {
        claimsByStatus[c.status] = (claimsByStatus[c.status] || 0) + 1
      }
    }

    return new Response(JSON.stringify({
      // Core stats
      members: members.count ?? 0,
      subscriptions: subs.count ?? 0,
      pending_contributions: pendingContribs.count ?? 0,
      pending_claims: pendingClaims.count ?? 0,
      approved_claims: approvedClaims.count ?? 0,
      paid_claims: paidClaims.count ?? 0,
      confirmed_stats: settings.data?.[0]?.value ?? {},

      // Financial charts
      monthly_contributions: monthlyContributionsArr,
      package_breakdown: packageBreakdownArr,
      claims_by_status: claimsByStatus,

      // Registration fees
      registration_fees: {
        total: totalRegFees.count ?? 0,
        paid: paidRegFees.count ?? 0,
        unpaid: pendingRegFees.count ?? 0,
      },

      // Recent activity
      recent_transactions: recentTransactions,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('FORBIDDEN') ? 403 : 500
    return new Response(JSON.stringify({ message, code: message.includes('FORBIDDEN') ? 'FORBIDDEN' : 'INTERNAL' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
