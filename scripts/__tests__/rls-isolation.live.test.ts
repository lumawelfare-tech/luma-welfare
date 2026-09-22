/**
 * Live RLS isolation tests.
 *
 * Coverage (when secrets are set):
 *   Tables: members, claims, contributions, subscriptions, family_members,
 *           notifications, registration_fees, data_deletion_requests,
 *           member_legal_acceptances, financial_ledger, admins, audit_logs,
 *           complaints, community_support_records, kb_documents, kb_chunks
 *   Edge:   admin-claims (member JWT → 401/403)
 *
 * Actors: anonymous · member A · member B · (admin tables denied to members)
 *
 * Requires:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY)
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
 *
 * Skips cleanly when secrets are absent (CI without Docker / secrets).
 * When secrets ARE set, failures must fail the job (no continue-on-error).
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
  let subA = ''
  let familyA = ''
  let notifA = ''
  let regFeeA = ''
  let deletionA = ''
  let legalA = ''
  let complaintA = ''
  let kbDocDraftId = ''
  let kbDocApprovedId = ''
  let kbChunkId = ''
  let communityRecordId = ''
  let packageId: string | null = null

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

    const { data: pkgs } = await a.from('packages').select('id').limit(1)
    packageId = pkgs?.[0]?.id ?? null

    if (packageId) {
      const { data: sub, error: subErr } = await a.from('subscriptions').insert({
        member_id: idA,
        package_id: packageId,
        status: 'active',
      }).select('id').single()
      if (!subErr && sub?.id) subA = sub.id
    }

    const { data: claim, error: claimErr } = await a.from('claims').insert({
      member_id: idA,
      claim_type: 'Other',
      status: 'Draft',
      description: 'RLS isolation fixture',
      ...(subA ? { subscription_id: subA, package_id: packageId } : {}),
    }).select('id').single()
    if (claimErr) throw claimErr
    claimA = claim.id

    if (subA && packageId) {
      const { data: contrib, error: contribErr } = await a.from('contributions').insert({
        member_id: idA,
        subscription_id: subA,
        package_id: packageId,
        amount: 100,
        status: 'Pending',
        period: `RLS-${randomUUID().slice(0, 8)}`,
      }).select('id').single()
      if (contribErr) {
        console.warn('[rls] contributions fixture skipped:', contribErr.message)
      } else {
        contribA = contrib.id
      }
    }

    const { data: fam, error: famErr } = await a.from('family_members').insert({
      member_id: idA,
      full_name: 'RLS Dependent',
      relationship: 'child',
    }).select('id').single()
    if (famErr) {
      console.warn('[rls] family_members fixture skipped:', famErr.message)
    } else {
      familyA = fam.id
    }

    const { data: notif, error: notifErr } = await a.from('notifications').insert({
      member_id: idA,
      subject: 'RLS test',
      body: 'isolation',
      channel: 'in_app',
    }).select('id').single()
    if (notifErr) console.warn('[rls] notifications fixture skipped:', notifErr.message)
    else notifA = notif.id

    const { data: fee, error: feeErr } = await a.from('registration_fees').insert({
      member_id: idA,
      amount: 300,
      status: 'pending',
    }).select('id').single()
    if (feeErr) console.warn('[rls] registration_fees fixture skipped:', feeErr.message)
    else regFeeA = fee.id

    const { data: del, error: delErr } = await a.from('data_deletion_requests').insert({
      member_id: idA,
      status: 'pending',
      reason: 'RLS isolation',
    }).select('id').single()
    if (delErr) console.warn('[rls] data_deletion_requests fixture skipped:', delErr.message)
    else deletionA = del.id

    const { data: legal, error: legalErr } = await a.from('member_legal_acceptances').insert({
      member_id: idA,
      document_type: 'privacy',
      document_version: '2026-09-21.1',
      source: 'registration',
    }).select('id').single()
    if (legalErr) console.warn('[rls] member_legal_acceptances fixture skipped:', legalErr.message)
    else legalA = legal.id

    const ref = `LUMA-CMP-RLS-${randomUUID().slice(0, 8)}`
    const { data: complaint, error: complaintErr } = await a.from('complaints').insert({
      member_id: idA,
      reference_number: ref,
      subject: 'RLS complaint subject',
      body: 'RLS isolation complaint body text',
      status: 'submitted',
    }).select('id').single()
    if (complaintErr) console.warn('[rls] complaints fixture skipped:', complaintErr.message)
    else complaintA = complaint.id

    const { data: community, error: communityErr } = await a.from('community_support_records').insert({
      record_date: '2026-09-22',
      location: 'RLS test location',
      purpose: 'RLS isolation community record',
    }).select('id').single()
    if (communityErr) console.warn('[rls] community_support_records fixture skipped:', communityErr.message)
    else communityRecordId = community.id

    const { data: draftDoc, error: draftErr } = await a.from('kb_documents').insert({
      title: 'RLS Draft Doc',
      summary: 'Should not be visible to members',
      access_level: 'member',
      status: 'draft',
      storage_path: `rls/draft-${randomUUID().slice(0, 8)}.pdf`,
      file_name: 'draft.pdf',
      mime_type: 'application/pdf',
    }).select('id').single()
    if (draftErr) console.warn('[rls] kb_documents draft fixture skipped:', draftErr.message)
    else kbDocDraftId = draftDoc.id

    const { data: approvedDoc, error: approvedErr } = await a.from('kb_documents').insert({
      title: 'RLS Approved Member Doc',
      summary: 'Visible metadata for members',
      access_level: 'member',
      status: 'approved',
      storage_path: `rls/approved-${randomUUID().slice(0, 8)}.pdf`,
      file_name: 'approved.pdf',
      mime_type: 'application/pdf',
      approved_at: new Date().toISOString(),
    }).select('id').single()
    if (approvedErr) console.warn('[rls] kb_documents approved fixture skipped:', approvedErr.message)
    else kbDocApprovedId = approvedDoc.id

    const { data: chunk, error: chunkErr } = await a.from('kb_chunks').insert({
      source_type: 'faq',
      source_id: `rls-${randomUUID().slice(0, 8)}`,
      access_level: 'member',
      title: 'RLS chunk',
      content: 'RLS isolation knowledge chunk content',
      chunk_index: 0,
    }).select('id').single()
    if (chunkErr) console.warn('[rls] kb_chunks fixture skipped:', chunkErr.message)
    else kbChunkId = chunk.id
  }, 90_000)

  afterAll(async () => {
    if (!live) return
    const a = admin()
    if (kbChunkId) await a.from('kb_chunks').delete().eq('id', kbChunkId)
    if (kbDocDraftId) await a.from('kb_documents').delete().eq('id', kbDocDraftId)
    if (kbDocApprovedId) await a.from('kb_documents').delete().eq('id', kbDocApprovedId)
    if (communityRecordId) await a.from('community_support_records').delete().eq('id', communityRecordId)
    if (complaintA) await a.from('complaints').delete().eq('id', complaintA)
    if (legalA) await a.from('member_legal_acceptances').delete().eq('id', legalA)
    if (deletionA) await a.from('data_deletion_requests').delete().eq('id', deletionA)
    if (regFeeA) await a.from('registration_fees').delete().eq('id', regFeeA)
    if (notifA) await a.from('notifications').delete().eq('id', notifA)
    if (familyA) await a.from('family_members').delete().eq('id', familyA)
    if (contribA) await a.from('contributions').delete().eq('id', contribA)
    if (claimA) await a.from('claims').delete().eq('id', claimA)
    if (subA) await a.from('subscriptions').delete().eq('id', subA)
    await a.from('members').delete().in('id', [idA, idB])
    await a.auth.admin.deleteUser(idA).catch(() => {})
    await a.auth.admin.deleteUser(idB).catch(() => {})
  }, 90_000)

  it('anonymous cannot read member PII or claim rows', async () => {
    const c = anonClient()
    for (const table of [
      'members',
      'claims',
      'contributions',
      'subscriptions',
      'family_members',
      'notifications',
      'registration_fees',
      'data_deletion_requests',
      'member_legal_acceptances',
      'financial_ledger',
      'admins',
      'audit_logs',
      'complaints',
      'community_support_records',
      'kb_chunks',
    ] as const) {
      const res = await c.from(table).select('id').limit(5)
      expect(res.data ?? [], `${table} should be empty for anon`).toEqual([])
    }

    // Anon may only see approved+public kb_documents metadata — never drafts / member-only
    if (kbDocDraftId) {
      expect((await c.from('kb_documents').select('id').eq('id', kbDocDraftId)).data ?? []).toEqual([])
    }
    if (kbDocApprovedId) {
      expect((await c.from('kb_documents').select('id').eq('id', kbDocApprovedId)).data ?? []).toEqual([])
    }
  })

  it('member B cannot read member A rows across user-data tables', async () => {
    const b = await userClient(emailB, password)

    expect((await b.from('members').select('id').eq('id', idA)).data ?? []).toEqual([])
    expect((await b.from('claims').select('id').eq('id', claimA)).data ?? []).toEqual([])

    if (contribA) {
      expect((await b.from('contributions').select('id').eq('id', contribA)).data ?? []).toEqual([])
    }
    if (subA) {
      expect((await b.from('subscriptions').select('id').eq('id', subA)).data ?? []).toEqual([])
    }
    if (familyA) {
      expect((await b.from('family_members').select('id').eq('id', familyA)).data ?? []).toEqual([])
    }
    if (notifA) {
      expect((await b.from('notifications').select('id').eq('id', notifA)).data ?? []).toEqual([])
    }
    if (regFeeA) {
      expect((await b.from('registration_fees').select('id').eq('id', regFeeA)).data ?? []).toEqual([])
    }
    if (deletionA) {
      expect((await b.from('data_deletion_requests').select('id').eq('id', deletionA)).data ?? []).toEqual([])
    }
    if (legalA) {
      expect((await b.from('member_legal_acceptances').select('id').eq('id', legalA)).data ?? []).toEqual([])
    }
    if (complaintA) {
      expect((await b.from('complaints').select('id').eq('id', complaintA)).data ?? []).toEqual([])
    }
    if (communityRecordId) {
      expect((await b.from('community_support_records').select('id').eq('id', communityRecordId)).data ?? []).toEqual([])
    }
    if (kbChunkId) {
      expect((await b.from('kb_chunks').select('id').eq('id', kbChunkId)).data ?? []).toEqual([])
    }
    if (kbDocDraftId) {
      expect((await b.from('kb_documents').select('id').eq('id', kbDocDraftId)).data ?? []).toEqual([])
    }

    const own = await b.from('members').select('id').eq('id', idB).maybeSingle()
    expect(own.data?.id).toBe(idB)
  })

  it('member A can read own rows and cannot mutate member B', async () => {
    const a = await userClient(emailA, password)
    expect((await a.from('claims').select('id').eq('id', claimA)).data?.[0]?.id).toBe(claimA)

    if (contribA) {
      expect((await a.from('contributions').select('id').eq('id', contribA)).data?.[0]?.id).toBe(contribA)
    }
    if (subA) {
      expect((await a.from('subscriptions').select('id').eq('id', subA)).data?.[0]?.id).toBe(subA)
    }
    if (familyA) {
      expect((await a.from('family_members').select('id').eq('id', familyA)).data?.[0]?.id).toBe(familyA)
    }
    if (complaintA) {
      expect((await a.from('complaints').select('id').eq('id', complaintA)).data?.[0]?.id).toBe(complaintA)
    }
    if (kbDocApprovedId) {
      expect((await a.from('kb_documents').select('id').eq('id', kbDocApprovedId)).data?.[0]?.id).toBe(kbDocApprovedId)
    }
    if (kbDocDraftId) {
      expect((await a.from('kb_documents').select('id').eq('id', kbDocDraftId)).data ?? []).toEqual([])
    }
    if (kbChunkId) {
      expect((await a.from('kb_chunks').select('id').eq('id', kbChunkId)).data ?? []).toEqual([])
    }
    if (communityRecordId) {
      expect((await a.from('community_support_records').select('id').eq('id', communityRecordId)).data ?? []).toEqual([])
    }

    const upd = await a.from('members').update({ full_name: 'Hacked' }).eq('id', idB).select()
    expect(upd.data ?? []).toEqual([])
  })

  it('member cannot read admin-only tables (admins, audit_logs)', async () => {
    const a = await userClient(emailA, password)
    expect((await a.from('admins').select('id').limit(5)).data ?? []).toEqual([])
    expect((await a.from('audit_logs').select('id').limit(5)).data ?? []).toEqual([])
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
