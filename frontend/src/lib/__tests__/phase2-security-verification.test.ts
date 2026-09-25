/**
 * Phase 2 — static security verification (no live Supabase required).
 * Live RLS isolation lives in scripts/__tests__/rls-isolation.live.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

function listMigrations(): string[] {
  const dir = resolve(root, 'supabase/migrations')
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
}

describe('Phase 2 — migration hygiene', () => {
  it('does not keep APPLY_TO_STAGING.sql inside migrations/', () => {
    expect(existsSync(resolve(root, 'supabase/migrations/APPLY_TO_STAGING.sql'))).toBe(false)
    expect(existsSync(resolve(root, 'docs/legacy-backend-sql/APPLY_TO_STAGING.sql'))).toBe(true)
  })

  it('includes phase2 security verification migration with FORCE RLS + private exports bucket', () => {
    const mig = read('supabase/migrations/20260921140000_phase2_security_verification.sql')
    expect(mig).toContain("INSERT INTO storage.buckets")
    expect(mig).toContain("'exports'")
    expect(mig).toContain('public = false')
    expect(mig).toContain('FORCE ROW LEVEL SECURITY')
    expect(mig).toContain("'claim_documents'")
    expect(mig).toContain("'members'")
  })

  it('claim-documents bucket is private with size and MIME limits', () => {
    const mig = read('supabase/migrations/20260825140000_create_claim_documents_bucket.sql')
    expect(mig).toMatch(/false/)
    expect(mig).toContain('10485760')
    expect(mig).toContain('application/pdf')
  })
})

describe('Phase 2 — intentional public USING(true) allowlist', () => {
  const allowed = [
    'package_rules_public_read',
    'news_events_public_read',
    'gallery_items_public_read',
    'media_items_public_read',
    'platform_settings_public_read',
    'media_storage_public_read',
    // service_role policies that pair with Block authenticated/anon
    'Service role only',
  ]

  it('every USING (true) policy name in migrations is reviewed', () => {
    const hits: string[] = []
    for (const file of listMigrations()) {
      const sql = read(join('supabase/migrations', file))
      const re = /CREATE POLICY\s+"([^"]+)"[\s\S]{0,400}?USING\s*\(\s*true\s*\)/gi
      let m: RegExpExecArray | null
      while ((m = re.exec(sql)) !== null) {
        hits.push(m[1])
      }
    }
    for (const name of hits) {
      const ok = allowed.some((a) => name === a || name.includes('Service role'))
      expect(ok, `Unreviewed USING(true) policy: ${name}`).toBe(true)
    }
  })
})

describe('Phase 2 — claim documents use signed URLs', () => {
  it('member-claims stores path and signs downloads', () => {
    const src = read('supabase/functions/member-claims/index.ts')
    expect(src).toContain('withSignedClaimDocumentUrls')
    expect(src).not.toContain('getPublicUrl')
  })

  it('admin-claims signs document downloads', () => {
    const src = read('supabase/functions/admin-claims/index.ts')
    expect(src).toContain('withSignedClaimDocumentUrls')
  })

  it('storage-signed helper defaults to 15-minute TTL', () => {
    const src = read('supabase/functions/shared/storage-signed.ts')
    expect(src).toContain('PRIVATE_SIGNED_URL_TTL_SECONDS = 15 * 60')
    expect(src).toContain('CLAIM_DOC_SIGNED_URL_TTL_SECONDS = PRIVATE_SIGNED_URL_TTL_SECONDS')
    expect(src).toContain('createSignedUrl')
  })
})

describe('Phase 2 — edge auth contracts (critical functions)', () => {
  const memberFns = [
    'member-dashboard',
    'member-profile',
    'member-family',
    'member-claims',
    'member-contributions',
    'member-receipts',
    'member-identity-docs',
  ]

  for (const fn of memberFns) {
    it(`${fn} requires getAuthenticatedUser`, () => {
      const src = read(`supabase/functions/${fn}/index.ts`)
      expect(src).toContain('getAuthenticatedUser')
      expect(src).toMatch(/status:\s*401|UNAUTHORIZED|Not authenticated/)
    })
  }

  const adminFns = [
    'admin-claims',
    'admin-members',
    'admin-contributions',
    'admin-dashboard',
  ]

  for (const fn of adminFns) {
    it(`${fn} loads admin session and permissions`, () => {
      const src = read(`supabase/functions/${fn}/index.ts`)
      expect(src).toContain('loadAdminSession')
      expect(src).toContain('requirePermission')
    })
  }

  it('auth-login and auth-register validate bodies via shared parsers', () => {
    expect(read('supabase/functions/auth-login/index.ts')).toContain('parseLoginBody')
    expect(read('supabase/functions/auth-register/index.ts')).toContain('parseRegisterBody')
  })

  it('cors helper uses exact-origin allowlist (no wildcard vercel.app)', () => {
    const src = read('supabase/functions/shared/cors.ts')
    expect(src).toContain('Exact origin matching only')
    expect(src).toContain('getAllowedOrigins')
    expect(src).toContain('.includes(')
    expect(src).toContain('https://www.lumawelfare.or.ke')
    expect(src).toContain('https://lumawelfare.or.ke')
    expect(src).toContain('https://luma-welfare.vercel.app')
    expect(src).toContain('[...new Set([...base, ...extra])]')
    expect(src).not.toMatch(/\*\.vercel\.app/)
    expect(src).not.toMatch(/endsWith\(['"]\.vercel\.app['"]\)/)
  })
})
