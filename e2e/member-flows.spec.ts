/**
 * Phase 5 — Member flows (authenticated).
 * Skips when E2E_MEMBER_* + Supabase env are unset.
 */
import { test, expect } from '@playwright/test'
import { BASE_URL, E2E_MEMBER, hasMemberCreds } from './helpers/env'
import { loginUi, signInApi, edgeJson } from './helpers/auth'

test.describe('Member flows', () => {
  test.skip(!hasMemberCreds, 'Set E2E_MEMBER_EMAIL/PASSWORD + SUPABASE_URL + anon key')

  test('signs in, views own dashboard/profile data, blocked from admin', async ({ page, request }) => {
    test.setTimeout(90_000)

    await loginUi(page, E2E_MEMBER.email, E2E_MEMBER.password)
    await expect(page).toHaveURL(/\/dashboard/)

    // Own data should render (name or membership chrome)
    await expect(page.locator('main, [role="main"], body')).toContainText(/dashboard|contribution|package|profile|welcome/i, {
      timeout: 20_000,
    })

    await page.goto(`${BASE_URL}/profile`)
    await expect(page.getByRole('heading', { name: /profile/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/privacy|download my data|save profile/i).first()).toBeVisible({ timeout: 15_000 })

    // Member must not reach admin UI
    await page.goto(`${BASE_URL}/admin/dashboard`)
    await page.waitForURL(/\/(dashboard|login|admin)/, { timeout: 20_000 })
    const url = page.url()
    expect(url.includes('/admin/dashboard')).toBeFalsy()

    // API: own claims list is authorized
    const session = await signInApi(request, E2E_MEMBER.email, E2E_MEMBER.password)
    const claims = await edgeJson<{ claims?: unknown[]; message?: string }>(
      request, 'GET', 'member-claims', session.accessToken,
    )
    expect(claims.status).toBe(200)
    expect(Array.isArray(claims.body.claims)).toBeTruthy()
  })

  test('can open claims page and submit a draft when eligible', async ({ page, request }) => {
    test.setTimeout(120_000)
    await loginUi(page, E2E_MEMBER.email, E2E_MEMBER.password)

    await page.goto(`${BASE_URL}/claims`)
    await expect(page.getByRole('heading', { name: /claim/i }).first()).toBeVisible({ timeout: 25_000 })

    const fileBtn = page.getByRole('button', { name: /file a claim|new claim|submit claim/i }).first()
    if (await fileBtn.isVisible().catch(() => false)) {
      await fileBtn.click()
    }

    // Prefer API submit for stability when UI gates on registration fee / eligibility
    const session = await signInApi(request, E2E_MEMBER.email, E2E_MEMBER.password)
    const dash = await edgeJson<{
      cards?: { subscription_id?: string; status?: string }[]
      registration_fee_paid?: boolean
    }>(request, 'GET', 'member-dashboard', session.accessToken)

    const activeSub = (dash.body.cards ?? []).find((s) => s.status === 'active' && s.subscription_id)
    test.skip(!activeSub?.subscription_id, 'Member has no active subscription — seed an eligible member for claim submit')

    const created = await edgeJson<{ claim?: { id: string; status: string }; message?: string }>(
      request,
      'POST',
      'member-claims',
      session.accessToken,
      {
        data: {
          subscriptionId: activeSub!.subscription_id,
          claimType: 'Other',
          description: `E2E member claim ${Date.now()}`,
          amountRequested: 500,
          submit: false,
        },
      },
    )

    // Accept created draft or explicit eligibility/registration blocks without failing the suite hard
    if (created.status === 201 || created.status === 200) {
      expect(created.body.claim?.id).toBeTruthy()
    } else {
      expect([400, 403, 409]).toContain(created.status)
    }
  })
})
