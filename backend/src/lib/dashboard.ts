import type { DbClient } from './supabase.js'
import { evaluateQualification } from './qualify.js'

export type DashboardSubscription = {
  id: string
  status: string
  started_at: string | null
  next_due_date: string | null
  package_code: string
  package_name: string
  tier_name: string | null
  monthly_amount: number
  waiting_period_months: number | null
  rules: Record<string, unknown>
}

export type ContributionRow = { status: string; period: string }

export async function buildMemberDashboard(
  admin: DbClient,
  memberId: string,
): Promise<unknown[]> {
  const { data: subs } = await admin
    .from('subscriptions')
    .select(
      'id, status, started_at, next_due_date, package_id, packages(code, name, waiting_period_months), package_tiers(name, amount)',
    )
    .eq('member_id', memberId)
    .order('created_at')

  const { data: allContributions } = await admin
    .from('contributions')
    .select('subscription_id, status, period')
    .eq('member_id', memberId)
    .order('period')

  const { data: allRules } = await admin.from('package_rules').select('package_id, key, value')

  const rulesByPackage = new Map<string, Record<string, unknown>>()
  for (const r of allRules ?? []) {
    const map = rulesByPackage.get(r.package_id) ?? {}
    map[r.key] = r.value
    rulesByPackage.set(r.package_id, map)
  }

  const { data: quals } = await admin
    .from('qualifications')
    .select('subscription_id, status, eligible_from, criteria_met, evaluated_at')
    .eq('member_id', memberId)

  const qualsBySub = new Map(
    (quals ?? []).map((q) => [q.subscription_id, q]),
  )

  const { data: member } = await admin.from('members').select('status').eq('id', memberId).single()

  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const currentPeriod = `${year}-${month}`

  return (subs ?? []).map((s) => {
    const rules = rulesByPackage.get(s.package_id) ?? {}
    const contributions = (allContributions ?? []).filter(
      (c) => c.subscription_id === s.id,
    )
    const paid = contributions.filter((c) =>
      ['Paid', 'Verified', 'Late'].includes(c.status),
    ).length

    const waitingMonths =
      s.packages?.[0]?.waiting_period_months === null ||
      s.packages?.[0]?.waiting_period_months === undefined
        ? null
        : Number(s.packages?.[0]?.waiting_period_months)

    const result = evaluateQualification(rules, {
      memberStatus: member?.status ?? 'pending_approval',
      subscriptionStatus: s.status,
      startedAt: s.started_at,
    }, contributions)

    const monthsToGo =
      waitingMonths === null
        ? null
        : Math.max(0, waitingMonths - paid)

    const currentMonthPaid = contributions.some(
      (c) => c.period === currentPeriod && ['Paid', 'Verified', 'Late'].includes(c.status),
    )
    const welfareAtRisk =
      s.packages?.[0]?.code === 'welfare' && !currentMonthPaid

    return {
      subscription_id: s.id,
      package: {
        code: s.packages?.[0]?.code,
        name: s.packages?.[0]?.name,
      },
      tier_name: s.package_tiers?.[0]?.name ?? null,
      monthly_amount: Number(s.package_tiers?.[0]?.amount ?? 0),
      status: s.status,
      waiting_period_months: waitingMonths,
      contributions: {
        paid,
        required: waitingMonths ?? null,
        months_to_go: monthsToGo,
        current_month_paid: currentMonthPaid,
      },
      qualification: result,
      welfare_cover_at_risk: welfareAtRisk,
      next_due_date: s.next_due_date,
      last_evaluation: qualsBySub.get(s.id)?.evaluated_at ?? null,
    }
  })
}