/**
 * Live package catalog check (Critical audit: live list vs official schedule).
 *
 * Uses public-data Edge Function (anon) — no service role required.
 * Skips when SUPABASE_URL + anon key are unset.
 *
 * Run: npm run test:rls
 */
import { describe, it, expect } from 'vitest'

const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
const anon =
  process.env.SUPABASE_ANON_KEY
  ?? process.env.SUPABASE_PUBLISHABLE_KEY
  ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? ''

const live = Boolean(url && anon)
const describeLive = live ? describe : describe.skip

const REQUIRED_TOP_LEVEL = [
  'welfare',
  'hospital',
  'education',
  'business',
  'building',
  'land',
  'farming',
  'wedding',
  'dowry',
  'disaster',
  'youth',
  'senior',
  'mission_of_mercy',
] as const

const REQUIRED_MOM_CHILDREN = [
  'mission_children',
  'mission_widows',
  'mission_single_mothers',
] as const

type Tier = {
  name: string
  amount: number
  min_age?: number | null
  max_age?: number | null
}

type Pkg = {
  id: string
  code: string
  name: string
  parent_package_id?: string | null
  waiting_period_months: number | null
  tiers: Tier[]
}

describeLive('Live package catalog (public-data)', () => {
  it('exposes official packages, MoM nesting, and Welfare age tiers', async () => {
    const res = await fetch(`${url}/functions/v1/public-data?resource=packages`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { packages?: Pkg[] }
    const packages = body.packages ?? []
    const byCode = new Map(packages.map((p) => [p.code, p]))

    for (const code of REQUIRED_TOP_LEVEL) {
      expect(byCode.has(code), `missing top-level package ${code}`).toBe(true)
      expect(byCode.get(code)?.parent_package_id ?? null).toBeNull()
    }

    const mom = byCode.get('mission_of_mercy')
    expect(mom).toBeTruthy()
    expect(mom!.waiting_period_months).toBe(12)

    for (const code of REQUIRED_MOM_CHILDREN) {
      const child = byCode.get(code)
      expect(child, `missing MoM child ${code}`).toBeTruthy()
      expect(child!.parent_package_id).toBe(mom!.id)
      expect(
        child!.tiers.some((t) => Number(t.amount) === 500),
        `${code} should have KES 500 tier`,
      ).toBe(true)
    }

    const welfare = byCode.get('welfare')
    expect(welfare).toBeTruthy()
    const age79 = welfare!.tiers.find((t) => t.min_age === 0 && t.max_age === 79)
    const age80 = welfare!.tiers.find((t) => t.min_age === 80 && (t.max_age == null || t.max_age === undefined))
    const nuclear = welfare!.tiers.find((t) => /nuclear/i.test(t.name))
    const extended = welfare!.tiers.find((t) => /extended/i.test(t.name))
    expect(Number(age79?.amount)).toBe(100)
    expect(Number(age80?.amount)).toBe(400)
    expect(Number(nuclear?.amount)).toBe(300)
    expect(Number(extended?.amount)).toBe(500)
  })
})
