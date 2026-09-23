/**
 * Stage 4 remediations — offline contracts.
 * Do not delete these to hide failures.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

const MEMBER_FNS = [
  'member-profile',
  'member-contributions',
  'member-subscriptions',
  'member-family',
  'member-receipts',
  'member-notifications',
  'member-notification-prefs',
  'member-push-subscriptions',
  'member-registration-fee',
]

describe('Stage 4 — unexpected errors stay generic', () => {
  it('shared helper never returns Error.message', () => {
    const src = read('supabase/functions/shared/supabase.ts')
    expect(src).toContain('export function handleUnexpectedError')
    expect(src).toContain("message: 'An unexpected error occurred.'")
    expect(src).toContain("code: 'INTERNAL'")
    expect(src).toMatch(/handleUnexpectedError[\s\S]{0,400}err\.name/)
  })

  it('member Edge Functions use handleUnexpectedError', () => {
    for (const fn of MEMBER_FNS) {
      const src = read(`supabase/functions/${fn}/index.ts`)
      expect(src, fn).toContain('handleUnexpectedError')
      expect(src, fn).not.toMatch(/err instanceof Error \? err\.message : 'Internal/)
    }
    expect(read('supabase/functions/payments-list/index.ts')).toContain('handleUnexpectedError')
  })
})

describe('Stage 4 — failed login audit', () => {
  it('auth-login writes auth_failed for invalid login and inactive accounts', () => {
    const src = read('supabase/functions/auth-login/index.ts')
    expect(src).toContain("action: 'auth_failed'")
    expect(src).toContain("code: 'ACCOUNT_INACTIVE'")
    expect(src.match(/action: 'auth_failed'/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('Stage 4 — storage lockdown + CI develop E2E', () => {
  it('migration drops leftover authenticated media/exports writes', () => {
    const mig = read('supabase/migrations/20260923180000_owasp_stage4_storage_lockdown.sql')
    expect(mig).toContain('DROP POLICY IF EXISTS media_storage_admin_insert')
    expect(mig).toContain('DROP POLICY IF EXISTS "exports_insert_own"')
    expect(mig).toContain('DROP POLICY IF EXISTS "claim_docs_update_own"')
  })

  it('CI runs E2E and edge-check on develop pushes', () => {
    const ci = read('.github/workflows/ci.yml')
    expect(ci).toContain("github.ref == 'refs/heads/develop'")
    expect(ci).not.toContain('(github.ref == \'refs/heads/main\' && github.event_name == \'push\')')
  })
})
