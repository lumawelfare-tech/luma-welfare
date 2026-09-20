import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient } from '../shared/supabase.ts'

/** UI mapping — does not change DB payment_status values. */
function mapPaymentUiStatus(
  status: string,
  createdAt: string | null | undefined,
): 'pending' | 'success' | 'failed' | 'expired' {
  if (status === 'Completed') return 'success'
  if (status === 'Failed' || status === 'Cancelled' || status === 'Reversed') return 'failed'
  if (status === 'Timeout') return 'expired'
  if (status === 'Pending' || status === 'Processing') {
    if (createdAt) {
      const ageMs = Date.now() - new Date(createdAt).getTime()
      if (ageMs > 15 * 60 * 1000) return 'expired'
    }
    return 'pending'
  }
  return 'pending'
}

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
    const today = new Date()
    const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

    const [regFeeResult, dashboardResult, contribSum, paymentsHist, pendingPay] = await Promise.all([
      adminClient
        .from('registration_fees')
        .select('status, amount, paid_at')
        .eq('member_id', user.id)
        .eq('fee_type', 'registration')
        .maybeSingle(),
      adminClient.rpc('build_member_dashboard', { p_member_id: user.id }),
      adminClient
        .from('contributions')
        .select('amount, status, period, subscription_id')
        .eq('member_id', user.id),
      adminClient
        .from('payments')
        .select('id, amount, status, mpesa_receipt, checkout_request_id, subscription_id, created_at, updated_at')
        .eq('member_id', user.id)
        .order('created_at', { ascending: false })
        .limit(25),
      adminClient
        .from('payments')
        .select('id, status, subscription_id, amount, created_at, checkout_request_id')
        .eq('member_id', user.id)
        .in('status', ['Pending', 'Processing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const registrationFeeStatus = regFeeResult.data?.status ?? 'unpaid'
    const registrationFeePaid = registrationFeeStatus === 'paid'

    const contribRows = contribSum.data ?? []
    const totalContributed = contribRows
      .filter((c) => ['Paid', 'Verified', 'Late'].includes(c.status))
      .reduce((sum, c) => sum + Number(c.amount ?? 0), 0)

    const monthPaid = contribRows.some(
      (c) => c.period === currentPeriod && ['Paid', 'Verified', 'Late'].includes(c.status),
    )

    function buildSummary(cards: Array<{
      package?: { name?: string | null } | null
      status?: string
      contributions?: { current_month_paid?: boolean }
      next_due_date?: string | null
      monthly_amount?: number | null
    }>) {
      const active = cards.filter((c) => c.status === 'active')
      const primary = active[0] ?? cards[0] ?? null
      let monthStatus: 'paid' | 'due' | 'overdue' = 'due'
      if (monthPaid || primary?.contributions?.current_month_paid) {
        monthStatus = 'paid'
      } else if (primary?.next_due_date) {
        const due = new Date(primary.next_due_date)
        if (due.getTime() < Date.now()) monthStatus = 'overdue'
      }
      return {
        total_contributed: totalContributed,
        month_status: monthStatus,
        current_period: currentPeriod,
        package_name: primary?.package?.name ?? null,
        monthly_amount: primary?.monthly_amount ?? null,
        pending_payment: pendingPay.data
          ? {
              ...pendingPay.data,
              ui_status: mapPaymentUiStatus(pendingPay.data.status, pendingPay.data.created_at),
            }
          : null,
      }
    }

    const recentPayments = (paymentsHist.data ?? []).map((p) => ({
      ...p,
      ui_status: mapPaymentUiStatus(p.status, p.created_at),
    }))

    if (dashboardResult.error) {
      const [subsResult, qualsResult] = await Promise.all([
        adminClient
          .from('subscriptions')
          .select('id, status, started_at, next_due_date, package_id, packages(code, name, waiting_period_months), package_tiers(name, amount)')
          .eq('member_id', user.id)
          .order('created_at'),
        adminClient
          .from('qualifications')
          .select('subscription_id, status, eligible_from, criteria_met, evaluated_at')
          .eq('member_id', user.id),
      ])

      const subs = subsResult.data ?? []
      const quals = qualsResult.data ?? []

      const { data: allContributions } = await adminClient
        .from('contributions')
        .select('subscription_id, status, period')
        .eq('member_id', user.id)

      const packageIds = [...new Set(subs.map((s) => s.package_id))]
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
      void qualsBySub

      const result = subs.map((s) => {
        const rules = rulesByPackage.get(s.package_id) ?? {}
        const contributions = (allContributions ?? []).filter((c) => c.subscription_id === s.id)
        const paid = contributions.filter((c) => ['Paid', 'Verified', 'Late'].includes(c.status)).length
        const waitingMonths = s.packages?.[0]?.waiting_period_months == null
          ? null
          : Number(s.packages?.[0]?.waiting_period_months)

        const requiresCurrent = (() => {
          const v = rules.requires_current_contributions
          if (v === true) return true
          if (typeof v === 'string') return v.trim().toLowerCase() === 'true'
          return false
        })()
        const arrearsAllowed = Number(rules.arrears_allowed_months ?? 0)
        const maxArrears = Number(rules.max_arrears_months ?? arrearsAllowed + 1)

        const coveredPeriods = new Set(
          contributions.filter((c) => ['Paid', 'Verified', 'Late'].includes(c.status)).map((c) => c.period),
        )
        const startedAt = s.started_at ? new Date(s.started_at) : null
        const monthsElapsed = startedAt
          ? Math.max(0, (today.getFullYear() - startedAt.getFullYear()) * 12 + (today.getMonth() - startedAt.getMonth()))
          : 0
        const arrearsMonths = Math.max(0, monthsElapsed - coveredPeriods.size)

        const currentMonthPaid = contributions.some(
          (c) => c.period === currentPeriod && ['Paid', 'Verified', 'Late'].includes(c.status),
        )
        const waitingMet = waitingMonths === null ? true : paid >= waitingMonths
        const atRisk = requiresCurrent && arrearsMonths > arrearsAllowed && arrearsMonths <= maxArrears
        const revoked = requiresCurrent && arrearsMonths > maxArrears

        let qualStatus: string
        if (s.status !== 'active' || revoked) qualStatus = 'revoked'
        else if (atRisk) qualStatus = 'at_risk'
        else if (waitingMet) qualStatus = 'eligible'
        else qualStatus = 'not_eligible'

        // Date-only calendar math (UTC) — avoid local TZ shifting eligible_from by a day in CI.
        const eligibleFrom = waitingMonths && startedAt
          ? (() => {
              const y = startedAt.getUTCFullYear()
              const m = startedAt.getUTCMonth()
              const d = startedAt.getUTCDate()
              return new Date(Date.UTC(y, m + waitingMonths, d)).toISOString().slice(0, 10)
            })()
          : startedAt?.toISOString().slice(0, 10) ?? null

        return {
          subscription_id: s.id,
          package: { code: s.packages?.[0]?.code, name: s.packages?.[0]?.name },
          tier_name: s.package_tiers?.[0]?.name ?? null,
          monthly_amount: Number(s.package_tiers?.[0]?.amount ?? 0),
          status: s.status,
          waiting_period_months: waitingMonths,
          contributions: {
            paid,
            required: waitingMonths,
            months_to_go: waitingMonths ? Math.max(0, waitingMonths - paid) : null,
            current_month_paid: currentMonthPaid,
          },
          qualification: { status: qualStatus, eligible_from: eligibleFrom, criteria_met: {} },
          welfare_cover_at_risk: s.packages?.[0]?.code === 'welfare' && !currentMonthPaid,
          next_due_date: s.next_due_date,
        }
      })

      return new Response(JSON.stringify({
        cards: result,
        registration_fee_status: registrationFeeStatus,
        registration_fee_paid: registrationFeePaid,
        summary: buildSummary(result),
        recent_payments: recentPayments,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cards = (dashboardResult.data ?? []) as Array<{
      package?: { name?: string | null } | null
      status?: string
      contributions?: { current_month_paid?: boolean }
      next_due_date?: string | null
      monthly_amount?: number | null
    }>

    return new Response(JSON.stringify({
      cards,
      registration_fee_status: registrationFeeStatus,
      registration_fee_paid: registrationFeePaid,
      summary: buildSummary(cards),
      recent_payments: recentPayments,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (_err) {
    return new Response(JSON.stringify({ message: 'Internal server error', code: 'INTERNAL' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
