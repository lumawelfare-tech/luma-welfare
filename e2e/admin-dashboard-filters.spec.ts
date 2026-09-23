/**
 * Smoke: admin dashboard metric deep-links land on filtered list screens.
 * Skips without E2E_ADMIN_* credentials. Completes staff 2FA when E2E_ADMIN_TOTP_SECRET is set.
 */
import { test, expect } from '@playwright/test'
import { BASE_URL, hasAdminCreds } from './helpers/env'
import { loginAdminUi } from './helpers/auth'

test.describe('Admin dashboard filter deep links', () => {
  test.skip(!hasAdminCreds, 'Set E2E_ADMIN_EMAIL/PASSWORD + SUPABASE_URL + anon key')

  test('metric links open members/claims/contributions/subscriptions with status query', async ({ page }) => {
    test.setTimeout(90_000)
    await loginAdminUi(page)

    await page.goto(`${BASE_URL}/admin/dashboard`)
    await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible({ timeout: 25_000 })

    // Active Members → /admin/members?status=active
    await page.getByRole('link', { name: /view active members/i }).click()
    await expect(page).toHaveURL(/\/admin\/members\?status=active/)
    await expect(page.getByRole('button', { name: /^Active$/i }).or(page.getByRole('button', { pressed: true, name: /active/i })).first()).toBeVisible({ timeout: 20_000 })

    await page.goto(`${BASE_URL}/admin/dashboard`)
    await page.getByRole('link', { name: /view pending claims/i }).click()
    await expect(page).toHaveURL(/\/admin\/claims\?status=Submitted/)
    await expect(page.getByRole('heading', { name: /claim/i }).first()).toBeVisible({ timeout: 20_000 })

    await page.goto(`${BASE_URL}/admin/dashboard`)
    await page.getByRole('link', { name: /view confirmed revenue/i }).click()
    await expect(page).toHaveURL(/\/admin\/contributions\?status=Verified/)

    await page.goto(`${BASE_URL}/admin/dashboard`)
    await page.getByRole('link', { name: /view active subscriptions/i }).click()
    await expect(page).toHaveURL(/\/admin\/subscriptions\?status=active/)
  })

  test('direct status query params select the matching filter chip', async ({ page }) => {
    test.setTimeout(90_000)
    await loginAdminUi(page)

    await page.goto(`${BASE_URL}/admin/members?status=pending_approval`)
    await expect(page).toHaveURL(/status=pending_approval/)
    const pending = page.getByRole('button', { name: /^Pending$/i }).first()
    await expect(pending).toBeVisible({ timeout: 20_000 })
    await expect(pending).toHaveAttribute('aria-pressed', 'true')
  })
})
