/**
 * Live RLS isolation tests.
 *
 * Requires a reachable Supabase project (local `supabase start` or preview) with:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY)
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
 *
 * Skips cleanly when secrets are absent (CI without Docker / secrets).
 *
 * Run: npm run test:rls
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.SUPABASE_URL?.replace(/\/+$/, '') ?? ''
const anon =
  process.env.SUPABASE_ANON_KEY
  ?? process.env.SUPABASE_PUBLISHABLE_KEY
  ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? ''
const service =
  process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? process.env.SUPABASE_SECRET_KEY
  ?? ''

const live = Boolean(url && anon && service)

const describeLive = live ? describe : describe.skip

function admin(): SupabaseClient {
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
}

function anonClient(): SupabaseClient {
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function userClient(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
  return c
}

describeLive('RLS isolation (live)', () => {
  const password = `Test-${randomUUID().slice(0, 8)}-Aa1`
  const emailA = `rls-a-${randomUUID().slice(0, 8)}@example.com`
  const emailB = `rls-b-${randomUUID().slice(0, 8)}@example.com`
  let idA = ''
  let idB = ''
  let claimA = ''
  let contribA = ''

  beforeAll(async () => {
    const a = admin()
    for (const email of [emailA, emailB]) {
      const { data, error } = await a.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) throw error
      if (email === emailA) idA = data.user!.id
      else idB = data.user!.id
    }

    // Minimal member rows (service role)
    for (const [id, email, name] of [
      [idA, emailA, 'RLS Member A'],
      [idB, emailB, 'RLS Member B'],
    ] as const) {
      await a.from('members').upsert({
        id,
        email,
        full_name: name,
        phone: '0712345678',
        status: 'active',
      })
    }

    const { data: claim, error: claimErr } = await a.from('claims').insert({
      member_id: idA,
      claim_type: 'Other',
      status: 'Draft',
      description: 'RLS isolation fixture',
    }).select('id').single()
    if (claimErr) throw claimErr
    claimA = claim.id

    const { data: contrib, error: contribErr } = await a.from('contributions').insert({
      member_id: idA,
      amount: 100,
      status: 'Pending',
      period: '2099-01',
    }).select('id').single()
    if (contribErr) {
      // contributions may require subscription_id — soft-skip contrib checks
      console.warn('[rls] contributions fixture skipped:', contribErr.message)
    } else {
      contribA = contrib.id
    }
  }, 60_000)

  afterAll(async () => {
    if (!live) return
    const a = admin()
    if (claimA) await a.from('claims').delete().eq('id', claimA)
    if (contribA) await a.from('contributions').delete().eq('id', contribA)
    await a.from('members').delete().in('id', [idA, idB])
    await a.auth.admin.deleteUser(idA).catch(() => {})
    await a.auth.admin.deleteUser(idB).catch(() => {})
  }, 60_000)

  it('anonymous cannot read members or claims', async () => {
    const c = anonClient()
    const members = await c.from('members').select('id').limit(5)
    expect(members.data ?? []).toEqual([])
    const claims = await c.from('claims').select('id').limit(5)
    expect(claims.data ?? []).toEqual([])
  })

  it('member B cannot read member A profile or claims', async () => {
    const b = await userClient(emailB, password)
    const profile = await b.from('members').select('id, email').eq('id', idA)
    expect(profile.data ?? []).toEqual([])

    const claims = await b.from('claims').select('id').eq('id', claimA)
    expect(claims.data ?? []).toEqual([])

    const own = await b.from('members').select('id').eq('id', idB).maybeSingle()
    expect(own.data?.id).toBe(idB)
  })

  it('member A can read own claim and cannot update member B', async () => {
    const a = await userClient(emailA, password)
    const claims = await a.from('claims').select('id').eq('id', claimA)
    expect(claims.data?.[0]?.id).toBe(claimA)

    const upd = await a.from('members').update({ full_name: 'Hacked' }).eq('id', idB).select()
    expect(upd.data ?? []).toEqual([])
  })

  it('member cannot call admin-only tables (admins, audit_logs)', async () => {
    const a = await userClient(emailA, password)
    const admins = await a.from('admins').select('id').limit(5)
    expect(admins.data ?? []).toEqual([])
    const logs = await a.from('audit_logs').select('id').limit(5)
    expect(logs.data ?? []).toEqual([])
  })

  it('non-admin edge call to admin-claims returns 403/401', async () => {
    const a = await userClient(emailA, password)
    const { data: session } = await a.auth.getSession()
    const token = session.session?.access_token
    expect(token).toBeTruthy()
    const res = await fetch(`${url}/functions/v1/admin-claims`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
      },
    })
    expect([401, 403]).toContain(res.status)
  })
})

describe('RLS live suite gate', () => {
  it('documents skip reason when secrets missing', () => {
    if (!live) {
      expect(live).toBe(false)
      console.info('[rls] skipped — set SUPABASE_URL + anon + service_role to run live isolation')
    } else {
      expect(live).toBe(true)
    }
  })
})
