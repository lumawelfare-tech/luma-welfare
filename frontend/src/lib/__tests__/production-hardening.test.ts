/**
 * Production hardening contracts (24 Sep 2026 audit remainder).
 * Offline only — do not treat skipped live RLS as a pass.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

function listMigrations(): string[] {
  return readdirSync(resolve(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
}

function frontendSrcFiles(): string[] {
  const dir = resolve(root, 'frontend/src')
  const out: string[] = []
  const walk = (d: string) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = resolve(d, name.name)
      if (name.isDirectory()) {
        if (name.name === '__tests__') continue
        walk(p)
      } else if (/\.(ts|tsx)$/.test(name.name)) {
        out.push(p)
      }
    }
  }
  walk(dir)
  return out
}

describe('session revocation — reuse staff helper', () => {
  const helper = read('supabase/functions/shared/session-invalidate.ts')
  const adminMembers = read('supabase/functions/admin-members/index.ts')
  const staff = read('supabase/functions/manage-user-role/index.ts')
  const ui = read('frontend/src/pages/admin/AdminMembers.tsx')

  it('helper mints a throwaway session then signs out globally, with one retry', () => {
    expect(helper).toContain('export async function invalidateUserSessions')
    expect(helper).toContain('export async function invalidateUserSessionsWithRetry')
    expect(helper).toContain('generateLink')
    expect(helper).toContain("type: 'magiclink'")
    expect(helper).toContain('verifyOtp')
    expect(helper).toContain("signOut(jwt, 'global')")
    expect(helper).toContain('attempt <= 2')
    expect(helper).toContain('return false')
    expect(helper).not.toContain('ban_duration')
    expect(helper).not.toMatch(/console\.(log|info|debug).*jwt/i)
  })

  it('suspend and close persist status before revoke and never roll the write back', () => {
    const patch = adminMembers.slice(
      adminMembers.indexOf('.update(updates)'),
      adminMembers.indexOf('sessionInvalidated !== undefined') + 80,
    )
    expect(patch.indexOf('.update(updates)')).toBeLessThan(patch.indexOf('invalidateUserSessionsWithRetry'))
    expect(patch).toContain("memberStatus === 'suspended' || memberStatus === 'closed'")
    expect(patch).toContain('member.session_invalidate_incomplete')
    expect(patch).toContain('session_invalidated')
    expect(patch).not.toMatch(/status:\s*'active'/)
    expect(adminMembers).not.toContain('.update({ status: previous')
  })

  it('staff role revoke uses the same helper', () => {
    expect(staff).toContain("from '../shared/session-invalidate.ts'")
    expect(staff).toContain('invalidateUserSessionsWithRetry')
    expect(staff).toContain('session_invalidated')
  })

  it('admin UI surfaces incomplete invalidation instead of hiding it', () => {
    expect(ui).toContain('session_invalidated === false')
    expect(ui).toMatch(/session could not be revoked/i)
  })
})

describe('KRA PIN least-privilege', () => {
  const revoke = 'supabase/migrations/20260924180000_revoke_members_kra_pin_select.sql'
  const profile = read('supabase/functions/member-profile/index.ts')
  const authMe = read('supabase/functions/auth-me/index.ts')
  const authLogin = read('supabase/functions/auth-login/index.ts')

  it('revokes column SELECT from anon and authenticated only', () => {
    expect(existsSync(resolve(root, revoke))).toBe(true)
    const mig = read(revoke)
    expect(mig).toContain('REVOKE SELECT (kra_pin) ON public.members FROM PUBLIC')
    expect(mig).toContain('REVOKE SELECT (kra_pin) ON public.members FROM anon')
    expect(mig).toContain('REVOKE SELECT (kra_pin) ON public.members FROM authenticated')
    expect(mig).not.toMatch(/REVOKE[\s\S]{0,40}service_role/)
    expect(mig).not.toMatch(/DROP COLUMN/)
  })

  it('GDPR export still reads members via service-role select *', () => {
    expect(profile).toContain("action === 'export'")
    expect(profile).toContain("adminClient.from('members').select('*')")
    expect(profile).toContain('member: memberRes.data')
    expect(profile).toContain('createAdminClient')
  })

  it('session and profile APIs never return raw kra_pin', () => {
    expect(authMe).toContain('stripMemberKraPin')
    expect(authLogin).toContain('stripMemberKraPin')
    expect(profile).toContain('kra_pin_masked')
    expect(profile).toContain('const { kra_pin: kraRaw, ...memberRest }')
  })

  it('frontend application code does not PostgREST-select kra_pin', () => {
    for (const file of frontendSrcFiles()) {
      const src = readFileSync(file, 'utf-8')
      if (src.includes(".from('members')") && /select\([^)]*kra_pin/.test(src)) {
        expect.fail(`${file} selects kra_pin from members`)
      }
    }
  })
})

describe('family ID uniqueness', () => {
  const path = 'supabase/migrations/20260924181000_family_members_id_number_unique.sql'
  const family = read('supabase/functions/member-family/index.ts')

  it('adds a partial unique index and stops if duplicates exist', () => {
    expect(existsSync(resolve(root, path))).toBe(true)
    const mig = read(path)
    expect(mig).toContain('family_members_member_id_number_active_unique')
    expect(mig).toContain('WHERE is_active = true')
    expect(mig).toContain('id_number IS NOT NULL')
    expect(mig).toContain('RAISE EXCEPTION')
    expect(mig).toContain('do not merge automatically')
    expect(mig).not.toMatch(/DELETE FROM public\.family_members/)
  })

  it('returns 409 on unique violation instead of a generic 500', () => {
    expect(family).toContain("error?.code === '23505'")
    expect(family).toContain('FAMILY_ID_DUPLICATE')
    expect(family).toContain('status: 409')
  })
})

describe('member_documents live RLS harness', () => {
  it('covers owner, peer, anonymous, storage, and kra_pin PostgREST', () => {
    const src = read('scripts/__tests__/rls-isolation.live.test.ts')
    expect(src).toContain("from('member_documents')")
    expect(src).toContain("'member-documents'")
    expect(src).toContain("select('kra_pin')")
    expect(src).toContain('describe.skip')
    expect(src).toContain('const live = Boolean(url && anon && service)')
    expect(src).not.toContain('describe.skipIf(false)')
  })

  it('does not treat missing secrets as a pass in the live suite gate', () => {
    const src = read('scripts/__tests__/rls-isolation.live.test.ts')
    expect(src).toContain("documents skip reason when secrets missing")
    expect(src).toContain("skipped — set SUPABASE_URL")
  })
})

describe('Daraja remains fail-closed', () => {
  it('payment edges stay gated on PAYMENTS_ENABLED === true', () => {
    expect(read('supabase/functions/payments-initiate/index.ts')).toContain("PAYMENTS_ENABLED') !== 'true'")
    expect(read('supabase/functions/payments-callback/index.ts')).toContain("PAYMENTS_ENABLED') !== 'true'")
    const fee = read('supabase/functions/member-registration-fee/index.ts')
    expect(fee).toContain("PAYMENTS_ENABLED') === 'true'")
    expect(fee).toContain('if (!paymentsEnabled)')
  })

  it('open package/payout conflict is still documented, not coded as a winner', () => {
    const open = read('docs/open-items.md')
    expect(open).toMatch(/12, 13 or 14/)
    expect(open).toMatch(/100,000/)
    expect(open).toContain('neither is implemented')
    expect(listMigrations().some((f) => /payout_winner|resolve_payout/i.test(f))).toBe(false)
    const settingsUi = read('frontend/src/pages/admin/AdminSettings.tsx')
    expect(settingsUi).toContain('/admin/settings?resource=open-questions')
    expect(settingsUi).toContain('These items stay open until Luma confirms them')
    expect(settingsUi).not.toMatch(/flat KSh 100,000 is correct|use the 12-package catalog as official/)
  })
})
