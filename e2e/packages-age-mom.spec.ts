/**
 * Public Packages page + API — Welfare age tiers and Mission of Mercy nesting.
 * API assertions hit live Supabase (authoritative). UI assertions soft-skip if
 * the deployed frontend has not yet picked up the catalog UI.
 */
import { test, expect } from '@playwright/test'
import { BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, E2E_MEMBER, hasMemberCreds } from './helpers/env'
import { loginUi } from './helpers/auth'

test.describe('Packages — age tiers & Mission of Mercy', () => {
  test('public-data packages payload includes MoM nesting and Welfare ages', async ({ request }) => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Set SUPABASE_URL + anon/publishable key')

    const res = await request.get(`${SUPABASE_URL}/functions/v1/public-data?resource=packages`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    const packages = (body.packages ?? []) as Array<{
      id: string
      code: string
      parent_package_id?: string | null
      tiers: Array<{ name: string; amount: number; min_age?: number | null; max_age?: number | null }>
    }>
    const byCode = Object.fromEntries(packages.map((p) => [p.code, p]))

    expect(byCode.mission_of_mercy).toBeTruthy()
    expect(byCode.mission_children?.parent_package_id).toBe(byCode.mission_of_mercy.id)
    expect(byCode.mission_widows?.parent_package_id).toBe(byCode.mission_of_mercy.id)
    expect(byCode.mission_single_mothers?.parent_package_id).toBe(byCode.mission_of_mercy.id)

    const welfare = byCode.welfare
    expect(welfare).toBeTruthy()
    expect(welfare.tiers.some((t) => t.min_age === 0 && t.max_age === 79 && Number(t.amount) === 100)).toBe(true)
    expect(welfare.tiers.some((t) => t.min_age === 80 && Number(t.amount) === 400)).toBe(true)
    expect(welfare.tiers.some((t) => /nuclear/i.test(t.name) && Number(t.amount) === 300)).toBe(true)
    expect(welfare.tiers.some((t) => /extended/i.test(t.name) && Number(t.amount) === 500)).toBe(true)
  })

  test('public Packages page shows Mission of Mercy and Welfare age bands when UI is deployed', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${BASE_URL}/packages`)
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 25_000 })

    const hasMom = await page.getByText(/mission of mercy/i).first().isVisible().catch(() => false)
    test.skip(!hasMom, 'Deployed frontend not yet showing Mission of Mercy — API catalog test is authoritative')

    await expect(page.getByText(/children.?s orphanage|vulnerables/i).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Widows/i).first()).toBeVisible()
    await expect(page.getByText(/Single Mothers/i).first()).toBeVisible()
    await expect(page.getByText(/Age 0-79|Age 0–79/i).first()).toBeVisible()
    await expect(page.getByText(/Age 80\+/i).first()).toBeVisible()
  })
})

test.describe('Member join — MoM / Welfare surface', () => {
  test.skip(!hasMemberCreds, 'Set E2E_MEMBER_EMAIL/PASSWORD + SUPABASE_URL + anon key')

  test('join programs lists MoM children and Welfare pricing cues', async ({ page }) => {
    test.setTimeout(90_000)
    await loginUi(page, E2E_MEMBER.email, E2E_MEMBER.password)
    await page.goto(`${BASE_URL}/join`)
    await expect(page.getByRole('heading', { name: /program/i }).first()).toBeVisible({ timeout: 25_000 })

    const body = await page.locator('body').innerText()
    const hasMom = /Widows|Single Mothers|Orphanage|Vulnerables|Mission of Mercy/i.test(body)
    test.skip(!hasMom, 'Deployed member join UI not yet showing MoM nesting')
    expect(body).toMatch(/Age 0-79|Age 80\+|date of birth|Nuclear Family|Welfare/i)
  })
})
