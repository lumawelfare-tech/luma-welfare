import { describe, it, expect } from 'vitest'
import {
  ageFromDateOfBirth,
  eligibleTiersForAge,
  packageRequiresDateOfBirth,
  resolveAgeTier,
  validateTierAgeOverlaps,
  formatPackageTiersSummary,
} from '../packageTiers'

const welfareTiers = [
  { id: 'a79', name: 'Age 0–79', amount: 100, min_age: 0, max_age: 79 },
  { id: 'a80', name: 'Age 80+', amount: 400, min_age: 80, max_age: null },
  { id: 'nuc', name: 'Nuclear Family', amount: 300, min_age: null, max_age: null },
  { id: 'ext', name: 'Extended Family', amount: 500, min_age: null, max_age: null },
]

const widows = [{ id: 'w', name: 'Standard', amount: 500, min_age: null, max_age: null }]

describe('packageTiers age resolution', () => {
  it('computes age boundaries at 79 and 80', () => {
    // As-of 2026-09-22
    const asOf = new Date('2026-09-22T12:00:00Z')
    expect(ageFromDateOfBirth('1947-09-22', asOf)).toBe(79)
    expect(ageFromDateOfBirth('1946-09-22', asOf)).toBe(80)
    expect(ageFromDateOfBirth('1946-09-23', asOf)).toBe(79)
  })

  it('resolves Welfare Individual age tier: 79 → 100, 80 → 400', () => {
    expect(resolveAgeTier(welfareTiers, 79)?.id).toBe('a79')
    expect(resolveAgeTier(welfareTiers, 79)?.amount).toBe(100)
    expect(resolveAgeTier(welfareTiers, 80)?.id).toBe('a80')
    expect(resolveAgeTier(welfareTiers, 80)?.amount).toBe(400)
  })

  it('keeps family tiers eligible regardless of age', () => {
    const e79 = eligibleTiersForAge(welfareTiers, 79)
    expect(e79.map((t) => t.id).sort()).toEqual(['a79', 'ext', 'nuc'])
    const e80 = eligibleTiersForAge(welfareTiers, 80)
    expect(e80.map((t) => t.id).sort()).toEqual(['a80', 'ext', 'nuc'])
  })

  it('flat Mission of Mercy / Widows resolves to KES 500', () => {
    expect(formatPackageTiersSummary(widows)).toContain('500')
    expect(eligibleTiersForAge(widows, 40)).toHaveLength(1)
    expect(eligibleTiersForAge(widows, 40)[0].amount).toBe(500)
  })

  it('blocks age-tier eligibility when DOB/age missing', () => {
    expect(packageRequiresDateOfBirth(welfareTiers)).toBe(true)
    const eligible = eligibleTiersForAge(welfareTiers, null)
    expect(eligible.every((t) => t.min_age == null && t.max_age == null)).toBe(true)
    expect(resolveAgeTier(welfareTiers, null)).toBeNull()
  })

  it('rejects overlapping age ranges', () => {
    expect(
      validateTierAgeOverlaps([
        { name: 'A', min_age: 0, max_age: 79 },
        { name: 'B', min_age: 79, max_age: 90 },
      ]),
    ).toMatch(/overlap/i)
    expect(
      validateTierAgeOverlaps([
        { name: 'A', min_age: 0, max_age: 79 },
        { name: 'B', min_age: 80, max_age: null },
      ]),
    ).toBeNull()
  })
})
