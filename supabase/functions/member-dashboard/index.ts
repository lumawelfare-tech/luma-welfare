import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient } from '../shared/supabase.ts'

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

    // Parallel fetch: registration fee + dashboard data
    const [regFeeResult, dashboardResult] = await Promise.all([
      adminClient
        .from('registration_fees')
        .select('status, amount, paid_at')
        .eq('member_id', user.id)
        .eq('fee_type', 'registration')
        .maybeSingle(),
      adminClient.rpc('build_member_dashboard', { p_member_id: user.id }),
    ])

    const registrationFeeStatus = regFeeResult.data?.status ?? 'unpaid'
    const registrationFeePaid = registrationFeeStatus === 'paid'

    if (dashboardResult.error) {
      // Fallback: use optimized direct queries with joins (not N+1)
      const [subsResult, qualsResult, memberResult] = await Promise.all([
        adminClient
          .from('subscriptions')
          .select('id, status, started_at, next_due_date, package_id, packages(code, name, waiting_period_months), package_tiers(name, amount)')
          .eq('member_id', user.id)
          .order('created_at'),
        adminClient
          .from('qualifications')
          .select('subscription_id, status, eligible_from, criteria_met, evaluated_at')
          .eq('member_id', user.id),
        adminClient
          .from('members')
          .select('status')
          .eq('id', user.id)
          .single(),
      ])

      const subs = subsResult.data ?? []
      const quals = qualsResult.data ?? []
      const member = memberResult.data

      // Batch fetch all contributions for this member (not per-subscription N+1)
      const { data: allContributions } = await adminClient
        .from('contributions')
        .select('subscription_id, status, period')
        .eq('member_id', user.id)

      // Batch fetch all package rules
      const packageIds = [...new Set(subs.map(s => s.package_id))]
      const { data: allRules } = packageIds.length > 0
        ? await adminClient
            .from('package_rules')
            .select('package_id, key, value')
            .in('package_id', packageIds)
        : { data: [] }

      const rulesByPackage = new Map<string, Record<string, unknown>>()
      for (const r of allRules ?? []) {
        const map = rulesByPackage.get(r.package_id) ?? {}
        map[r.key] = r.value
        rulesByPackage.set(r.package_id, map)
      }

      const qualsBySub = new Map((quals ?? []).map((q) => [q.subscription_id, q]))

      const today = new Date()
      const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

      const result = subs.map((s) => {
        const rules = rulesByPackage.get(s.package_id) ?? {}
        const contributions = (allContributions ?? []).filter((c) => c.subscription_id === s.id)
        const paid = contributions.filter((c) => ['Paid', 'Verified', 'Late'].includes(c.status)).length
        const waitingMonths = s.packages?.[0]?.waiting_period_months === null || s.packages?.[0]?.waiting_period_months === undefined
          ? null
          : Number(s.packages?.[0]?.waiting_period_months)

        const requiresCurrent = rules.requires_current_contributions === true || rules.requires_current_contributions === 'true'
        const arrearsAllowed = Number(rules.arrears_allowed_months ?? 0)
        const maxArrears = Number(rules.max_arrears_months ?? arrearsAllowed + 1)

        const coveredPeriods = new Set(contributions.filter((c) => ['Paid', 'Verified', 'Late'].includes(c.status)).map((c) => c.period))
        const startedAt = s.started_at ? new Date(s.started_at) : null
        const monthsElapsed = startedAt ? Math.max(0, (today.getFullYear() - startedAt.getFullYear()) * 12 + (today.getMonth() - startedAt.getMonth())) : 0
        const arrearsMonths = Math.max(0, monthsElapsed - coveredPeriods.size)

        const currentMonthPaid = contributions.some((c) => c.period === currentPeriod && ['Paid', 'Verified', 'Late'].includes(c.status))
        const waitingMet = waitingMonths === null ? true : paid >= waitingMonths
        const atRisk = requiresCurrent && arrearsMonths > arrearsAllowed && arrearsMonths <= maxArrears
        const revoked = requiresCurrent && arrearsMonths > maxArrears

        let qualStatus: string
        if (s.status !== 'active' || revoked) qualStatus = 'revoked'
        else if (atRisk) qualStatus = 'at_risk'
        else if (waitingMet) qualStatus = 'eligible'
        else qualStatus = 'not_eligible'

        const eligibleFrom = waitingMonths && startedAt
          ? new Date(startedAt.getFullYear(), startedAt.getMonth() + waitingMonths, startedAt.getDate()).toISOString().slice(0, 10)
          : startedAt?.toISOString().slice(0, 10) ?? null

        return {
          subscription_id: s.id,
          package: { code: s.packages?.[0]?.code, name: s.packages?.[0]?.name },
          tier_name: s.package_tiers?.[0]?.name ?? null,
          monthly_amount: Number(s.package_tiers?.[0]?.amount ?? 0),
          status: s.status,
          waiting_period_months: waitingMonths,
          contributions: { paid, required: waitingMonths, months_to_go: waitingMonths ? Math.max(0, waitingMonths - paid) : null, current_month_paid: currentMonthPaid },
          qualification: { status: qualStatus, eligible_from: eligibleFrom, criteria_met: {} },
          welfare_cover_at_risk: s.packages?.[0]?.code === 'welfare' && !currentMonthPaid,
          next_due_date: s.next_due_date,
        }
      })

      return new Response(JSON.stringify({ cards: result, registration_fee_status: registrationFeeStatus, registration_fee_paid: registrationFeePaid }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ cards: dashboardResult.data ?? [], registration_fee_status: registrationFeeStatus, registration_fee_paid: registrationFeePaid }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ message: 'Internal server error', code: 'INTERNAL' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
