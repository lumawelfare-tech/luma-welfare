import { describe, expect, it } from 'vitest'
import {
  legalConfig,
  listUnresolvedLegalPlaceholders,
  displayLegalValue,
  assertLegalConfigReadyForRelease,
  isPlaceholder,
} from '../../config/legal'

describe('legalConfig', () => {
  it('is in draft mode with version strings set', () => {
    expect(legalConfig.draftPendingLegalReview).toBe(true)
    expect(legalConfig.privacyPolicyVersion.length).toBeGreaterThan(0)
    expect(legalConfig.termsVersion.length).toBeGreaterThan(0)
  })

  it('hides placeholder values from display helpers', () => {
    expect(isPlaceholder('PLACEHOLDER_FOO')).toBe(true)
    expect(displayLegalValue('PLACEHOLDER_PHYSICAL_ADDRESS')).toBeNull()
    expect(displayLegalValue('Luma Welfare')).toBe('Luma Welfare')
  })

  it('lists unresolved required placeholders while drafting', () => {
    const unresolved = listUnresolvedLegalPlaceholders()
    expect(unresolved.length).toBeGreaterThan(0)
    expect(unresolved).toContain('legalEntityName')
  })

  it('allows release assertion to pass while draft remains true', () => {
    expect(() => assertLegalConfigReadyForRelease()).not.toThrow()
  })

  it('fails release assertion when draft is cleared with placeholders', () => {
    expect(() =>
      assertLegalConfigReadyForRelease({
        ...legalConfig,
        draftPendingLegalReview: false,
      }),
    ).toThrow(/placeholders/)
  })
})
