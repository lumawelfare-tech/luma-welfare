/**
 * Stage 5 remediations — leftover product/ops security (no PII encryption, no malware vendor, no Daraja).
 * Do not delete these to hide failures.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  MAX_MONEY_AMOUNT_KES,
  parseOptionalMoneyAmount,
  parseRequiredMoneyAmount,
  ValidationError,
} from '../../../../supabase/functions/shared/validate.ts'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('Stage 5 — money amount parser', () => {
  it('accepts finite positive amounts and treats empty as optional', () => {
    expect(parseOptionalMoneyAmount(null)).toBeNull()
    expect(parseOptionalMoneyAmount('')).toBeNull()
    expect(parseOptionalMoneyAmount(1500)).toBe(1500)
    expect(parseOptionalMoneyAmount('2500.50')).toBe(2500.5)
    expect(parseRequiredMoneyAmount(1)).toBe(1)
  })

  it('rejects non-finite, negative, scientific-notation, and over-cap values', () => {
    expect(() => parseOptionalMoneyAmount(Number.POSITIVE_INFINITY)).toThrow(ValidationError)
    expect(() => parseOptionalMoneyAmount(-10)).toThrow(ValidationError)
    expect(() => parseOptionalMoneyAmount(0)).toThrow(ValidationError)
    expect(() => parseOptionalMoneyAmount('1e7')).toThrow(ValidationError)
    expect(() => parseOptionalMoneyAmount(MAX_MONEY_AMOUNT_KES + 1)).toThrow(ValidationError)
    expect(() => parseOptionalMoneyAmount({ n: 10 })).toThrow(ValidationError)
    expect(() => parseRequiredMoneyAmount(null)).toThrow(ValidationError)
  })
})

describe('Stage 5 — claim/payout amounts are parsed', () => {
  it('member-claims uses the shared parser and returns VALIDATION on bad amounts', () => {
    const src = read('supabase/functions/member-claims/index.ts')
    expect(src).toContain('parseOptionalMoneyAmount')
    expect(src).toContain('amount requested')
    expect(src).toContain('instanceof ValidationError')
    expect(src).toContain("code: 'VALIDATION'")
  })

  it('admin-claims bounds approve and payout amounts', () => {
    const src = read('supabase/functions/admin-claims/index.ts')
    expect(src).toContain('parseOptionalMoneyAmount')
    expect(src).toContain('parseRequiredMoneyAmount')
    expect(src).toContain('payout amount')
    expect(src).toContain('approved amount')
    expect(src).not.toMatch(/Number\(body\.amount\)/)
    expect(src).not.toMatch(/if \(amount\) updates\.approved_amount = amount/)
  })
})

describe('Stage 5 — session invalidate is reported', () => {
  it('returns session_invalidated after retry + audit', () => {
    const src = read('supabase/functions/manage-user-role/index.ts')
    expect(src).toContain('invalidateUserSessionsWithRetry')
    expect(src).toContain('session_invalidated')
    expect(src).toContain('SESSION_INVALIDATE_INCOMPLETE')
    expect(src).toContain('staff.session_invalidate_incomplete')
  })
})

describe('Stage 5 — hosted CORS does not default to localhost', () => {
  it('uses supabase.co to drop localhost fallback', () => {
    const src = read('supabase/functions/shared/cors.ts')
    expect(src).toContain('isHostedSupabase')
    expect(src).toContain('.supabase.co')
    expect(src).toContain('LOCAL_DEV_ORIGINS')
    expect(src).not.toMatch(
      /Deno\.env\.get\('CORS_ALLOWED_ORIGIN'\)\s*\?\?\s*'https:\/\/luma-welfare\.vercel\.app,http:\/\/localhost/,
    )
  })
})

describe('Stage 5 — coverage floor + Firefox security-api', () => {
  it('enforces Vitest coverage thresholds', () => {
    const vite = read('frontend/vite.config.ts')
    expect(vite).toContain('thresholds')
    expect(vite).toMatch(/lines:\s*\d+/)
    const ci = read('.github/workflows/ci.yml')
    expect(ci).toContain('npm run test:coverage')
    expect(ci).not.toMatch(/Unit test coverage \(informational\)/)
    expect(ci).not.toMatch(/continue-on-error: true\s*\n\s*run: npm run test:coverage/)
  })

  it('runs security-api on Firefox', () => {
    const pw = read('playwright.config.ts')
    expect(pw).toContain('firefox-security-api')
    expect(pw).toContain('Desktop Firefox')
    expect(pw).toContain('security-api\\.spec\\.ts')
    const ci = read('.github/workflows/ci.yml')
    expect(ci).toContain('playwright install chromium firefox')
  })
})
