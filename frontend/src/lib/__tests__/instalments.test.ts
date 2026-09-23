import { describe, expect, it } from 'vitest'
import {
  assertInstalmentAmount,
  isPeriodFullyPaid,
  progressPercent,
  remainingToRecord,
  roundKes,
} from '../instalments'

describe('Lipa Pole Pole instalment math', () => {
  it('rejects zero and negative amounts', () => {
    expect(assertInstalmentAmount(0, 100).ok).toBe(false)
    expect(assertInstalmentAmount(-1, 100).ok).toBe(false)
    if (!assertInstalmentAmount(0, 100).ok) {
      expect(assertInstalmentAmount(0, 100).code).toBe('AMOUNT_INVALID')
    }
  })

  it('rejects amounts above remaining (no overpay / no negative remaining)', () => {
    const result = assertInstalmentAmount(50, 40)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('OVERPAYMENT')
    expect(remainingToRecord(100, 100)).toBe(0)
    expect(remainingToRecord(100, 150)).toBe(0)
  })

  it('accepts any positive amount up to remaining including 1 and the final exact remainder', () => {
    expect(assertInstalmentAmount(1, 100).ok).toBe(true)
    expect(assertInstalmentAmount(5, 100).ok).toBe(true)
    expect(assertInstalmentAmount(30, 30).ok).toBe(true)
  })

  it('marks the period fully paid only when verified sum meets the monthly required amount', () => {
    expect(isPeriodFullyPaid(100, 50)).toBe(false)
    expect(isPeriodFullyPaid(100, 100)).toBe(true)
    expect(isPeriodFullyPaid(100, 100.004)).toBe(true)
    expect(isPeriodFullyPaid(0, 0)).toBe(false)
  })

  it('reserves pending plus verified against remaining-to-record', () => {
    expect(remainingToRecord(1200, 400 + 200)).toBe(600)
    expect(roundKes(10.555)).toBe(10.56)
    expect(progressPercent(100, 25)).toBe(25)
    expect(progressPercent(100, 100)).toBe(100)
  })
})
