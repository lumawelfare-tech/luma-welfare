/**
 * Phase 1 security containment — static regression tests.
 *
 * These assert the containment contracts in source without requiring a live
 * Supabase project. Live RLS/auth checks remain in the DATABASE_URL suites.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('Phase 1 — unauthenticated service-role functions require CRON_SECRET', () => {
  it('send-report-email calls requireCronSecret', () => {
    const src = read('supabase/functions/send-report-email/index.ts')
    expect(src).toContain("from '../shared/internal-auth.ts'")
    expect(src).toContain('requireCronSecret(req)')
  })

  it('admin-exports-worker calls requireCronSecret before worker_id', () => {
    const src = read('supabase/functions/admin-exports-worker/index.ts')
    expect(src).toContain("from '../shared/internal-auth.ts'")
    expect(src).toContain('requireCronSecret(req)')
    expect(src).not.toContain('No user authentication required')
  })

  it('internal-auth fails closed when CRON_SECRET is unset', () => {
    const src = read('supabase/functions/shared/internal-auth.ts')
    expect(src).toContain('CRON_SECRET')
    expect(src).toContain('503')
    expect(src).toContain('401')
    expect(src).toContain('timingSafeEqual')
  })
})

describe('Phase 1 — JWT deploy strategy is allowlisted', () => {
  it('deploy script does not blanket --no-verify-jwt', () => {
    const src = read('scripts/deploy-edge-functions.sh')
    expect(src).toContain('NO_VERIFY_JWT_FUNCTIONS')
    expect(src).toContain('requires_no_verify_jwt')
    // Must not deploy every function with a hard-coded --no-verify-jwt outside the allowlist helper
    const deployLoop = src.slice(src.indexOf('for fn in'))
    expect(deployLoop).toMatch(/requires_no_verify_jwt/)
    expect(src).toContain('auth-register')
    expect(src).toContain('send-report-email')
    expect(src).toContain('admin-exports-worker')
  })

  it('CI single-function deploy uses the same allowlist', () => {
    const src = read('.github/workflows/deploy-functions.yml')
    expect(src).toContain('auth-register|auth-verify-email|auth-login|public-data|payments-callback|send-report-email|admin-exports-worker|health')
    expect(src).not.toMatch(/supabase functions deploy \$\{?\{? inputs\.function_name \}?\}? --project-ref mkbxigxmhqdhxmptanqr --no-verify-jwt/)
  })
})

describe('Phase 1 — OAuth provisioning disabled', () => {
  it('auth-oauth-provision returns 410 and never inserts members', () => {
    const src = read('supabase/functions/auth-oauth-provision/index.ts')
    expect(src).toContain('410')
    expect(src).toContain('OAUTH_PROVISION_DISABLED')
    expect(src).not.toContain(".from('members')")
    expect(src).not.toContain("status: 'active'")
  })
})

describe('Phase 1 — public settings allowlist', () => {
  it('public-data only selects org_contact and stats', () => {
    const src = read('supabase/functions/public-data/index.ts')
    expect(src).toContain("PUBLIC_SETTINGS_KEYS")
    expect(src).toContain("'org_contact'")
    expect(src).toContain("'stats'")
    expect(src).toMatch(/\.in\('key'/)
  })

  it('admin settings UI loads via admin-settings, not public-data', () => {
    const src = read('frontend/src/pages/admin/AdminSettings.tsx')
    expect(src).toContain("/admin/settings?resource=settings")
    // Must not call the public settings path (exact public route, not the admin one).
    expect(src.includes("api('/settings?resource=settings'") || src.includes('api("/settings?resource=settings"')).toBe(false)
    expect(src).not.toMatch(/api<[^>]*>\(\s*['"]\/settings\?resource=settings['"]/)
  })
})

describe('Phase 1 — RLS containment migration', () => {
  const migration = read('supabase/migrations/20260907000000_phase1_security_containment.sql')

  it('constrains payment and contribution inserts to Pending', () => {
    expect(migration).toMatch(/payments_insert_own[\s\S]*status = 'Pending'/)
    expect(migration).toMatch(/contributions_insert_own[\s\S]*status = 'Pending'/)
  })

  it('constrains claim insert/update status transitions', () => {
    expect(migration).toMatch(/claims_insert_own[\s\S]*status IN \('Draft', 'Submitted'\)/)
    expect(migration).toMatch(/claims_update_own_draft[\s\S]*WITH CHECK[\s\S]*status IN \('Draft', 'Submitted'\)/)
  })

  it('allowlists platform_settings public read keys', () => {
    expect(migration).toMatch(/platform_settings_public_read[\s\S]*key IN \('org_contact', 'stats'\)/)
  })

  it('enables RLS on payouts and open_questions', () => {
    expect(migration).toContain('ALTER TABLE IF EXISTS payouts ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('ALTER TABLE IF EXISTS open_questions ENABLE ROW LEVEL SECURITY')
  })
})

describe('Production security lockdown migration', () => {
  const migration = read('supabase/migrations/20260919160000_production_security_lockdown.sql')

  it('adds ownership check to member_search_contributions', () => {
    expect(migration).toContain('member_search_contributions')
    expect(migration).toContain("RAISE EXCEPTION 'forbidden'")
    expect(migration).toContain('p_member_id IS DISTINCT FROM auth.uid()')
  })

  it('revokes broad EXECUTE on push broadcast RPC', () => {
    expect(migration).toContain('get_all_active_push_subscriptions')
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION get_all_active_push_subscriptions\(\) FROM PUBLIC, anon, authenticated/)
  })

  it('hardens export_jobs and registration_fees insert policies', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "export_jobs_select_own"')
    expect(migration).toMatch(/registration_fees_insert_own[\s\S]*status IN \('unpaid', 'pending'\)/)
    expect(migration).toMatch(/subscriptions_insert_own[\s\S]*status = 'pending'/)
  })

  it('enables RLS on package_rules', () => {
    expect(migration).toContain('ALTER TABLE IF EXISTS package_rules ENABLE ROW LEVEL SECURITY')
  })
})

describe('Claim eligibility fail-closed', () => {
  it('member-claims requires eligible qualification (null is denied)', () => {
    const src = read('supabase/functions/member-claims/index.ts')
    expect(src).toContain("!qual || qual.status !== 'eligible'")
    expect(src).not.toContain('if (qual && qual.status !== ')
  })
})

describe('Payments callback authentication', () => {
  it('requires MPESA_CALLBACK_SECRET and respects PAYMENTS_ENABLED', () => {
    const src = read('supabase/functions/payments-callback/index.ts')
    expect(src).toContain('MPESA_CALLBACK_SECRET')
    expect(src).toContain('authorizeCallback')
    expect(src).toContain("PAYMENTS_ENABLED') !== 'true'")
  })
})

describe('Admin 2FA step-up', () => {
  it('does not return current_code from setup', () => {
    const src = read('supabase/functions/admin-2fa/index.ts')
    expect(src).not.toContain('current_code')
    expect(src).toContain('mintAdmin2faStepUpToken')
    expect(src).toContain('skip2faCheck: true')
  })

  it('loadAdminSession enforces step-up when 2FA enabled', () => {
    const src = read('supabase/functions/shared/supabase.ts')
    expect(src).toContain('2fa_required')
    expect(src).toContain('verifyAdmin2faStepUpToken')
  })
})
