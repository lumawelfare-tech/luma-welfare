/**
 * Package contribution tier helpers — age resolution + overlap validation.
 * Used by member join UI and unit tests. Edge Functions mirror critical checks.
 */

export type AgeTierLike = {
  id: string
  name: string
  amount: number
  min_age?: number | null
  max_age?: number | null
  is_active?: boolean
}

/** Whole-year age from ISO date of birth as of `asOf` (default today UTC). */
export function ageFromDateOfBirth(dob: string | null | undefined, asOf: Date = new Date()): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null
  const birth = new Date(`${dob.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(birth.getTime())) return null
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear()
  const m = asOf.getUTCMonth() - birth.getUTCMonth()
  if (m < 0 || (m === 0 && asOf.getUTCDate() < birth.getUTCDate())) age -= 1
  if (age < 0 || age > 130) return null
  return age
}

export function tierHasAgeBounds(t: AgeTierLike): boolean {
  return t.min_age != null || t.max_age != null
}

export function tierMatchesAge(t: AgeTierLike, age: number): boolean {
  if (t.min_age != null && age < t.min_age) return false
  if (t.max_age != null && age > t.max_age) return false
  return true
}

/** True when this package requires DOB because at least one active age-bounded tier exists. */
export function packageRequiresDateOfBirth(tiers: AgeTierLike[]): boolean {
  return tiers.some((t) => (t.is_active !== false) && tierHasAgeBounds(t))
}

/**
 * Tiers a member may select:
 * - Unbounded (family / flat) always included
 * - Age-bounded only when age matches
 * If age is null and package has age-bounded tiers, only unbounded tiers remain
 * (caller should block join when the only sensible option needs DOB).
 */
export function eligibleTiersForAge(tiers: AgeTierLike[], age: number | null): AgeTierLike[] {
  const active = tiers.filter((t) => t.is_active !== false)
  return active.filter((t) => {
    if (!tierHasAgeBounds(t)) return true
    if (age == null) return false
    return tierMatchesAge(t, age)
  })
}

/** Prefer a single matching age-bounded tier for auto-select; else null. */
export function resolveAgeTier(tiers: AgeTierLike[], age: number | null): AgeTierLike | null {
  if (age == null) return null
  const matches = tiers.filter(
    (t) => t.is_active !== false && tierHasAgeBounds(t) && tierMatchesAge(t, age),
  )
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    // Prefer narrowest band (both bounds set)
    return [...matches].sort((a, b) => {
      const wa = (a.max_age ?? 200) - (a.min_age ?? 0)
      const wb = (b.max_age ?? 200) - (b.min_age ?? 0)
      return wa - wb
    })[0]
  }
  return null
}

export type TierBoundInput = { min_age?: number | null; max_age?: number | null; name?: string }

function rangeOverlap(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
): boolean {
  return aMin <= bMax && bMin <= aMax
}

/**
 * Age-bounded tiers on the same package must not overlap.
 * Unbounded tiers (both ages null) are ignored for overlap.
 */
export function validateTierAgeOverlaps(tiers: TierBoundInput[]): string | null {
  const bounded = tiers
    .map((t, index) => ({
      index,
      name: t.name ?? `tier ${index + 1}`,
      min: t.min_age ?? null,
      max: t.max_age ?? null,
    }))
    .filter((t) => t.min != null || t.max != null)

  for (let i = 0; i < bounded.length; i++) {
    for (let j = i + 1; j < bounded.length; j++) {
      const a = bounded[i]
      const b = bounded[j]
      const aMin = a.min ?? 0
      const aMax = a.max ?? 200
      const bMin = b.min ?? 0
      const bMax = b.max ?? 200
      if (rangeOverlap(aMin, aMax, bMin, bMax)) {
        return `Age ranges overlap between "${a.name}" and "${b.name}".`
      }
    }
  }
  return null
}

export function formatTierPriceLabel(t: AgeTierLike): string {
  const amount = `KES ${Number(t.amount).toLocaleString('en-KE')}`
  if (tierHasAgeBounds(t)) {
    if (t.min_age != null && t.max_age != null) return `${t.min_age}–${t.max_age}: ${amount}`
    if (t.min_age != null) return `${t.min_age}+: ${amount}`
    if (t.max_age != null) return `≤${t.max_age}: ${amount}`
  }
  return `${t.name} — ${amount}/mo`
}

export function formatPackageTiersSummary(tiers: AgeTierLike[]): string {
  const active = tiers.filter((t) => t.is_active !== false)
  if (active.length === 0) return 'No price set'
  if (active.length === 1 && !tierHasAgeBounds(active[0])) {
    return `KES ${Number(active[0].amount).toLocaleString('en-KE')}/mo`
  }
  return active.map(formatTierPriceLabel).join(' · ')
}
