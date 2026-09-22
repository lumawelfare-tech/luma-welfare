import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string) {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('claims named officer verifiers', () => {
  it('migration adds eligibility and contribution officer name columns', () => {
    const sql = read('supabase/migrations/20260922240000_claims_named_verifiers.sql')
    expect(sql).toContain('eligibility_verified_by')
    expect(sql).toContain('contributions_verified_by')
    expect(sql).toContain('claims_eligibility_verified_by_len')
  })

  it('admin-claims requires officer names for checklist completion and approve', () => {
    const src = read('supabase/functions/admin-claims/index.ts')
    expect(src).toContain('eligibility_verified_by')
    expect(src).toContain('contributions_verified_by')
    expect(src).toContain('eligibilityVerifiedBy')
    expect(src).toContain('sanitizeOfficerName')
    expect(src).toMatch(/checklistComplete[\s\S]*eligibility_verified_by/)
  })

  it('AdminClaims UI exposes paper-form officer name fields', () => {
    const src = read('frontend/src/pages/admin/AdminClaims.tsx')
    expect(src).toContain('Eligibility verified by')
    expect(src).toContain('Contribution status verified by')
    expect(src).toContain('eligibilityVerifiedBy')
  })
})
