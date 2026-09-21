import type { APIRequestContext } from '@playwright/test'
import { SUPABASE_URL } from './env'
import { serviceHeaders } from './auth'

type SeedClaim = { id: string; claim_number?: string }

/**
 * Seed Submitted claims for E2E approve/reject via service role.
 * Returns empty array when the member has no usable package/subscription.
 */
export async function seedSubmittedClaims(
  request: APIRequestContext,
  memberId: string,
  count = 2,
): Promise<SeedClaim[]> {
  const headers = await serviceHeaders()

  const subRes = await request.get(
    `${SUPABASE_URL}/rest/v1/subscriptions?member_id=eq.${memberId}&status=eq.active&select=id,package_id&limit=1`,
    { headers: { ...headers, Prefer: 'return=representation' } },
  )
  if (!subRes.ok()) return []
  const subs = await subRes.json() as { id: string; package_id: string }[]
  if (!subs.length) return []

  const sub = subs[0]
  const created: SeedClaim[] = []

  for (let i = 0; i < count; i++) {
    const claimNumber = `E2E-${Date.now()}-${i}`
    const res = await request.post(`${SUPABASE_URL}/rest/v1/claims`, {
      headers: { ...headers, Prefer: 'return=representation' },
      data: {
        member_id: memberId,
        subscription_id: sub.id,
        package_id: sub.package_id,
        claim_number: claimNumber,
        claim_type: 'Other',
        description: `E2E seeded claim ${i + 1}`,
        amount_requested: 1000 + i,
        status: 'Submitted',
        submitted_at: new Date().toISOString(),
      },
    })
    if (!res.ok()) continue
    const rows = await res.json() as SeedClaim[]
    if (rows[0]?.id) created.push(rows[0])
  }

  return created
}

export async function deleteClaims(request: APIRequestContext, ids: string[]) {
  if (!ids.length) return
  const headers = await serviceHeaders()
  await request.delete(
    `${SUPABASE_URL}/rest/v1/claims?id=in.(${ids.join(',')})`,
    { headers },
  )
}

/**
 * Seed a Pending contribution for the member's active subscription (manual / non-M-Pesa path).
 */
export async function seedPendingContribution(
  request: APIRequestContext,
  memberId: string,
): Promise<{ id: string } | null> {
  const headers = await serviceHeaders()
  const subRes = await request.get(
    `${SUPABASE_URL}/rest/v1/subscriptions?member_id=eq.${memberId}&status=eq.active&select=id,package_id,package_tiers(amount)&limit=1`,
    { headers },
  )
  if (!subRes.ok()) return null
  const subs = await subRes.json() as {
    id: string
    package_id: string
    package_tiers?: { amount?: number }[] | { amount?: number }
  }[]
  if (!subs.length) return null

  const sub = subs[0]
  const tier = Array.isArray(sub.package_tiers) ? sub.package_tiers[0] : sub.package_tiers
  const amount = Number(tier?.amount ?? 500)
  const period = `E2E-${new Date().toISOString().slice(0, 7)}-${Date.now()}`

  const res = await request.post(`${SUPABASE_URL}/rest/v1/contributions`, {
    headers: { ...headers, Prefer: 'return=representation' },
    data: {
      member_id: memberId,
      subscription_id: sub.id,
      package_id: sub.package_id,
      period,
      amount,
      status: 'Pending',
      recorded_by: memberId,
    },
  })
  if (!res.ok()) return null
  const rows = await res.json() as { id: string }[]
  return rows[0] ?? null
}

export async function deleteContributions(request: APIRequestContext, ids: string[]) {
  if (!ids.length) return
  const headers = await serviceHeaders()
  await request.delete(
    `${SUPABASE_URL}/rest/v1/contributions?id=in.(${ids.join(',')})`,
    { headers },
  )
}
