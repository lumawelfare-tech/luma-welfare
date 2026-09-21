/**
 * Phase 5 — Mobile viewport (375px) member smoke.
 */
import { test, expect, devices } from '@playwright/test'
import { BASE_URL, E2E_MEMBER, hasMemberCreds } from './helpers/env'
import { loginUi } from './helpers/auth'

test.use({ ...devices['iPhone 12'], viewport: { width: 375, height: 812 } })

test.describe('Member mobile (375px)', () => {
  test.skip(!hasMemberCreds, 'Set E2E_MEMBER_EMAIL/PASSWORD + Supabase env')

  test('login → dashboard usable without horizontal overflow', async ({ page }) => {
    test.setTimeout(90_000)
    await loginUi(page, E2E_MEMBER.email, E2E_MEMBER.password)
    await expect(page).toHaveURL(/\/dashboard/)

    await expect(page.locator('body')).toBeVisible()
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 8)

    await page.goto(`${BASE_URL}/claims`)
    await expect(page.getByRole('heading', { name: /claim/i }).first()).toBeVisible({ timeout: 25_000 })
    const claimsOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 8)
    expect(claimsOverflow).toBeTruthy()
  })
})
