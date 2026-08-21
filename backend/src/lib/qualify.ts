// Qualification engine (Section 5).
// The decision is built from admin-configurable per-package rules, never from
// hardcoded `if months == 12` checks. Three patterns are supported:
//   1. Fixed waiting period, standard (12 months)
//   2. Fixed waiting period, shorter (6 months — Education)
//   3. No waiting period, ongoing condition (Welfare — contributions current)
//
// Decision model:
//   Contribution Period + Minimum Contributions + Account Status
//   + Waiting Period (or "none — contributions current" rule)
//   + Arrears Rules + Other Package-Specific Conditions
//   = Qualification Decision

export type RuleMap = Record<string, unknown>

export type QualifyInput = {
  memberStatus: string
  subscriptionStatus: string
  startedAt: string | null
  now?: Date
}

export type QualificationResult = {
  status: 'eligible' | 'not_eligible' | 'at_risk' | 'revoked'
  eligibleFrom: string | null
  criteriaMet: Record<string, unknown>
}

const PAID_STATUSES = ['Paid', 'Verified', 'Late']

function num(ruleMap: RuleMap, key: string, fallback: number): number {
  const v = ruleMap[key]
  if (v === null || v === undefined) return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function bool(ruleMap: RuleMap, key: string, fallback: boolean): boolean {
  const v = ruleMap[key]
  if (v === null || v === undefined) return fallback
  return v === true || v === 'true'
}

function monthsBetween(start: Date, end: Date): number {
  return Math.max(
    0,
    (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()),
  )
}

export function evaluateQualification(
  rules: RuleMap,
  input: QualifyInput,
  paidContributions: { status: string; period: string }[],
): QualificationResult {
  const now = input.now ?? new Date()

  const waitingPeriod = num(rules, 'waiting_period_months', 12)
  const requiresCurrent = bool(rules, 'requires_current_contributions', false)
  const minContributions = num(rules, 'min_contributions', 0)
  const arrearsAllowed = num(rules, 'arrears_allowed_months', 0)
  const maxArrears = num(rules, 'max_arrears_months', arrearsAllowed + 1)

  const paidCount = paidContributions.filter((c) =>
    PAID_STATUSES.includes(c.status),
  ).length

  const startedAt = input.startedAt ? new Date(input.startedAt) : null
  const monthsElapsed = startedAt ? monthsBetween(startedAt, now) : 0

  // Months since the subscription started that have no paid contribution.
  // A contribution counts for the month it covers; a gap of N months means N
  // periods went unpaid.
  const coveredPeriods = new Set(
    paidContributions.filter((c) => PAID_STATUSES.includes(c.status)).map((c) => c.period),
  )
  const arrearsMonths = Math.max(
    0,
    monthsElapsed - coveredPeriods.size,
  )

  const accountActive = input.memberStatus === 'active'
  const subscriptionActive = input.subscriptionStatus === 'active'

  const waitingPeriodIsNone = waitingPeriod === 0
  const waitingMet = waitingPeriodIsNone
    ? !requiresCurrent || arrearsMonths <= arrearsAllowed
    : paidCount >= waitingPeriod

  const minMet = paidCount >= minContributions

  const currentOk = requiresCurrent ? arrearsMonths <= arrearsAllowed : true
  const coverAtRisk = requiresCurrent
    ? arrearsMonths > arrearsAllowed && arrearsMonths <= maxArrears
    : false
  const coverRevoked = requiresCurrent ? arrearsMonths > maxArrears : false

  let status: QualificationResult['status']
  if (!accountActive || !subscriptionActive || coverRevoked) {
    status = 'revoked'
  } else if (coverAtRisk || (requiresCurrent && !currentOk)) {
    status = 'at_risk'
  } else if (waitingMet && minMet) {
    status = 'eligible'
  } else {
    status = 'not_eligible'
  }

  const eligibleFrom =
    !waitingPeriodIsNone && startedAt
      ? new Date(
          startedAt.getFullYear(),
          startedAt.getMonth() + waitingPeriod,
          startedAt.getDate(),
        )
          .toISOString()
          .slice(0, 10)
      : startedAt?.toISOString().slice(0, 10) ?? null

  return {
    status,
    eligibleFrom,
    criteriaMet: {
      account_active: accountActive,
      subscription_active: subscriptionActive,
      waiting_period: {
        required_months: waitingPeriodIsNone ? null : waitingPeriod,
        rule: waitingPeriodIsNone ? 'contributions current' : 'fixed months',
        met: waitingMet,
      },
      min_contributions: { required: minContributions, met: minMet },
      contributions_current: { required: requiresCurrent, met: currentOk },
      arrears: { months: arrearsMonths, allowed: arrearsAllowed, max: maxArrears },
      cover_status: {
        at_risk: coverAtRisk,
        revoked: coverRevoked,
      },
    },
  }
}