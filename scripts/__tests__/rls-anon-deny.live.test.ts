/**
 * Live RLS isolation checks that need ONLY the publishable (anon) key.
 *
 * Complements rls-isolation.live.test.ts, which needs the service-role key
 * and therefore self-skips in environments without Docker/secrets. This file
 * still runs and verifies the anonymous threat model:
 *
 *   - sensitive tables expose no rows to anon
 *   - sensitive columns expose no values to anon
 *   - anon cannot escalate to service-role capabilities
 *   - private storage buckets expose no objects and cannot be enumerated
 *   - intentionally public reads stay public (regression guard)
 *
 * Read-only. No writes are issued.
 *
 * Run: npx vitest run --config frontend/vitest.workspace-rls.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function loadConfig(): { url: string; anon: string } {
  const envPath = resolve(import.meta.dirname, '../../.env.local')
  let file: Record<string, string> = {}
  try {
    for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) file[m[1]] = m[2].trim()
    }
  } catch { /* ignore */ }

  const url = (process.env.SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || file.SUPABASE_URL
    || file.VITE_SUPABASE_URL
    || '').replace(/\/+$/, '')
  const anon = process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || file.SUPABASE_ANON_KEY
    || file.VITE_SUPABASE_PUBLISHABLE_KEY
    || ''

  return { url, anon }
}

const { url, anon } = loadConfig()
const live = Boolean(url && anon)
const describeLive = live ? describe : describe.skip

function anonClient(): SupabaseClient {
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * PostgREST answers a missing relation with PGRST205 / 42P01 and `data: null`.
 * The `res.data ?? []` assertions below would swallow that as a passing empty
 * result, so a dropped table read as "secure". Fail loudly instead.
 */
function expectRelationExists(table: string, error: { code?: string; message?: string } | null): void {
  const code = error?.code ?? ''
  const message = error?.message ?? ''
  const missing =
    code === 'PGRST205' ||
    code === '42P01' ||
    /could not find the table|does not exist/i.test(message)
  expect(
    missing,
    `${table} is missing from the database — this deny check would pass vacuously`,
  ).toBe(false)
}

/** Tables that must never expose rows to an unauthenticated caller. */
const SENSITIVE_TABLES = [
  'members',
  'claims',
  'contributions',
  'subscriptions',
  'family_members',
  'notifications',
  'registration_fees',
  'data_deletion_requests',
  'member_legal_acceptances',
  'admins',
  'roles',
  'audit_logs',
  'complaints',
  'community_support_records',
  'member_documents',
  'email_verifications',
  'report_history',
  'scheduled_reports',
  'saved_reports',
  'webhook_events',
  'system_webhooks',
  'rate_limit_buckets',
]

/** Tables that are intentionally readable by anonymous visitors. */
const PUBLIC_TABLES = [
  'packages',
  'package_tiers',
  'package_rules',
  'news_events',
  'gallery_items',
  'media_items',
]

/** Settings keys that are safe to expose. Anything new must be added here. */
const PUBLIC_SETTING_KEYS = new Set(['org_contact', 'stats', 'registration_fee'])

describeLive('RLS — anonymous read isolation (live)', () => {
  it.each(SENSITIVE_TABLES)('%s exposes no rows to the anon key', async (table) => {
    const res = await anonClient().from(table).select('*').limit(25)
    expectRelationExists(table, res.error)
    // A denied table yields `data === null`; a leak yields rows.
    expect(res.data ?? [], `${table} must be empty for the anon key`).toEqual([])
  })

  it('exposes no members.kra_pin / email / id_number values to anon', async () => {
    const res = await anonClient()
      .from('members')
      .select('kra_pin, email, id_number, phone')
      .limit(50)
    expect(res.data ?? []).toEqual([])
  })

  it('exposes no member rows even with an unfiltered select', async () => {
    const res = await anonClient()
      .from('members')
      .select('id, email, full_name, status')
      .limit(100)
    expect(res.data ?? []).toEqual([])
  })

  it('keeps the intentionally public tables readable', async () => {
    const c = anonClient()
    for (const table of PUBLIC_TABLES) {
      const res = await c.from(table).select('*').limit(1)
      expect(res.error, `${table} should stay publicly readable`).toBeFalsy()
      expect(Array.isArray(res.data)).toBe(true)
    }
  })

  it('publishes only allow-listed platform settings keys', async () => {
    const res = await anonClient().from('platform_settings').select('key, value')
    expect(res.error).toBeFalsy()
    const keys = (res.data ?? []).map((r) => (r as { key: string }).key)
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys) {
      expect(PUBLIC_SETTING_KEYS.has(k), `unexpected public settings key: ${k}`).toBe(true)
    }
  })

  it('only exposes approved, public kb_documents to anon', async () => {
    const res = await anonClient()
      .from('kb_documents')
      .select('id, status, access_level, title')
      .limit(50)
    const rows = (res.data ?? []) as { status?: string; access_level?: string }[]
    for (const row of rows) {
      expect(row.status, `kb doc "${row.title}" must be approved before anon read`).toBe('approved')
      expect(row.access_level, `kb doc "${row.title}" must be public`).toBe('public')
    }
  })

  it('does not expose any secret-bearing settings key to anon', async () => {
    const res = await anonClient().from('platform_settings').select('key, value')
    const keys = (res.data ?? []).map((k => (k as { key: string }).key))
    const sensitive = /secret|token|password|mpesa|service.?role|private|credential|webhook.?url/i
    for (const k of keys) expect(sensitive.test(k), `sensitive settings key exposed: ${k}`).toBe(false)
  })
})

describeLive('RLS — anon privilege escalation (live)', () => {
  it('cannot list users through the admin auth API', async () => {
    const res = await anonClient().auth.admin.listUsers()
    expect(res.error, 'anon key must not reach auth.admin').toBeTruthy()
    expect(res.data?.users ?? []).toEqual([])
  })

  it('cannot request a service-role session', async () => {
    const res = await anonClient().auth.signInWithPassword({
      email: 'nobody@example.com',
      password: 'WrongPassword123',
    })
    expect(res.error).toBeTruthy()
    expect(res.data?.session ?? null).toBeNull()
    expect(res.data?.user ?? null).toBeNull()
  })

  it('cannot enumerate storage buckets', async () => {
    const res = await anonClient().storage.listBuckets()
    if (res.error) return // denied outright
    expect(res.data ?? [], 'anon must not enumerate private buckets').toEqual([])
  })

  it('cannot read objects from the private member-documents bucket', async () => {
    const res = await anonClient().storage.from('member-documents').list('', { limit: 20 })
    if (res.error) return // denied outright
    expect(res.data ?? []).toEqual([])
  })

  it('cannot read objects from the private claim-documents bucket', async () => {
    const res = await anonClient().storage.from('claim-documents').list('', { limit: 20 })
    if (res.error) return
    expect(res.data ?? []).toEqual([])
  })
})

describeLive('RLS — authorization regression guards (live)', () => {
  it('an anonymous admin edge call is refused', async () => {
    const res = await fetch(`${url}/functions/v1/admin-members`, { headers: { apikey: anon } })
    expect([401, 403]).toContain(res.status)
  })

  it('an anonymous member edge call is refused', async () => {
    const res = await fetch(`${url}/functions/v1/member-dashboard`, { headers: { apikey: anon } })
    expect([401, 403]).toContain(res.status)
  })

  it('a forged JWT is refused on an admin edge call', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({
        sub: '00000000-0000-4000-8000-000000000000',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url')
    const forged = `${header}.${payload}.forged-signature`

    const res = await fetch(`${url}/functions/v1/admin-claims`, {
      headers: { apikey: anon, Authorization: `Bearer ${forged}` },
    })
    expect([401, 403]).toContain(res.status)
  })

  it('a valid-shape but unsigned JWT is refused on a member edge call', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({
        sub: '11111111-1111-4111-8111-111111111111',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url')
    const forged = `${header}.${payload}.not-a-real-signature`

    const res = await fetch(`${url}/functions/v1/member-profile`, {
      headers: { apikey: anon, Authorization: `Bearer ${forged}` },
    })
    expect([401, 403]).toContain(res.status)
  })
})
