/**
 * Pre-deploy hardening contracts (25 Sep 2026).
 * Offline only — live apply is a separate ops step.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

const mig = read('supabase/migrations/20260925160000_pre_deploy_hardening.sql')
const limits = read('supabase/functions/shared/rate-limit.ts')
const core = read('supabase/functions/shared/rate-limit-core.ts')

describe('pre-deploy RLS + column grants', () => {
  it('FORCEs remaining ENABLE-only tables', () => {
    for (const table of [
      'packages',
      'email_verifications',
      'payouts',
      'open_questions',
      'saved_reports',
      'notification_preferences',
    ]) {
      expect(mig).toContain(`'${table}'`)
    }
    expect(mig).toContain('FORCE ROW LEVEL SECURITY')
  })

  it('restricts package_rules to active packages (not USING true)', () => {
    expect(mig).toContain('package_rules_public_read')
    expect(mig).toContain('p.is_active = true')
    const policy = mig.slice(mig.indexOf('CREATE POLICY "package_rules_public_read"'))
    expect(policy).not.toMatch(/USING\s*\(\s*true\s*\)/)
  })

  it('revokes kra_pin UPDATE from client roles and lists it on the privileged trigger', () => {
    expect(mig).toContain('REVOKE UPDATE (kra_pin) ON public.members FROM PUBLIC')
    expect(mig).toContain('REVOKE UPDATE (kra_pin) ON public.members FROM anon')
    expect(mig).toContain('REVOKE UPDATE (kra_pin) ON public.members FROM authenticated')
    expect(mig).not.toMatch(/REVOKE[\s\S]{0,40}service_role/)
    expect(mig).toContain('NEW.kra_pin IS DISTINCT FROM OLD.kra_pin')
  })

  it('adds saved_reports admin-own policies', () => {
    expect(mig).toContain('saved_reports_admin_read')
    expect(mig).toContain('saved_reports_admin_insert')
    expect(mig).toContain('saved_reports_admin_delete')
    expect(mig).toContain('created_by = auth.uid()')
  })
})

describe('pre-deploy storage', () => {
  it('drops authenticated claim object policies and admin export SELECT', () => {
    expect(mig).toContain('DROP POLICY IF EXISTS "claim_docs_insert_own"')
    expect(mig).toContain('DROP POLICY IF EXISTS "claim_docs_read_own"')
    expect(mig).toContain('DROP POLICY IF EXISTS "exports_admin_select_own"')
  })

  it('creates a public-read gallery bucket with no authenticated writes', () => {
    expect(mig).toContain("'gallery'")
    expect(mig).toContain('gallery_storage_public_read')
    expect(mig).toContain('DROP POLICY IF EXISTS gallery_storage_admin_insert')
    expect(mig).toContain('public = true')
  })
})

describe('pre-deploy AI rate limits and spend caps', () => {
  it('lists assistant and ingest as fail-closed with dedicated limits', () => {
    expect(limits).toContain("'member-assistant': { windowMs: 60_000, max: 10 }")
    expect(limits).toContain("'admin-kb-ingest': { windowMs: 300_000, max: 3 }")
    expect(core).toContain("'member-assistant'")
    expect(core).toContain("'admin-kb-ingest'")
  })

  it('member-claims still uploads via service role after claim policy drop', () => {
    const claims = read('supabase/functions/member-claims/index.ts')
    expect(claims).toContain("from('claim-documents')")
    expect(claims).toContain('createAdminClient')
    expect(claims).toContain('withSignedClaimDocumentUrls')
  })
})
