/**
 * Mirror of frontend package tier age checks for Edge Functions (Deno).
 * Keep in sync with frontend/src/lib/packageTiers.ts
 */

export type AgeTierLike = {
  id: string
  name: string
  amount: number
  min_age?: number | null
  max_age?: number | null
  is_active?: boolean
}

export function ageFromDateOfBirth(dob: string | null | undefined, asOf: Date = new Date()): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(String(dob))) return null
  const birth = new Date(`${String(dob).slice(0, 10)}T00:00:00Z`)
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

export function validateTierAgeOverlaps(
  tiers: { min_age?: number | null; max_age?: number | null; name?: string }[],
): string | null {
  const bounded = tiers
    .map((t, index) => ({
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
      if (aMin <= bMax && bMin <= aMax) {
        return `Age ranges overlap between "${a.name}" and "${b.name}".`
      }
    }
  }
  return null
}

/** Ensure selected tier is allowed for member age; returns error message or null. */
export function assertTierAllowedForAge(
  tier: AgeTierLike | null,
  allTiers: AgeTierLike[],
  age: number | null,
): string | null {
  const hasAgeTiers = allTiers.some((t) => t.is_active !== false && tierHasAgeBounds(t))
  if (!tier) {
    if (hasAgeTiers && age == null) {
      return 'Add your date of birth on your profile before joining a package with age-based pricing.'
    }
    return null
  }
  if (!tierHasAgeBounds(tier)) return null
  if (age == null) {
    return 'Add your date of birth on your profile before selecting an age-based contribution tier.'
  }
  if (!tierMatchesAge(tier, age)) {
    return `The selected tier "${tier.name}" does not match your age (${age}).`
  }
  return null
}
