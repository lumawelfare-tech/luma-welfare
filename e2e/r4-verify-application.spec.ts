/**
 * R4 — Application confirmation on Verify Email (server number + sessionStorage).
 * Does not create real members; uses sessionStorage / URL email only.
 */
import { test, expect } from '@playwright/test'

const BASE = (process.env.BASE_URL || 'https://luma-welfare.vercel.app').replace(/\/+$/, '')

test.describe('R4 Verify Email application confirmation', () => {
  test('shows application number and pending verification from sessionStorage; survives refresh', async ({
    page,
  }) => {
    const appNo = 'LUMA-APP-20260922-99999'
    const email = 'r4-e2e@example.com'

    await page.goto(`${BASE}/verify-email`)
    await page.evaluate(
      ({ appNo: n, email: e }) => {
        sessionStorage.setItem(
          'luma.pendingApplication',
          JSON.stringify({ email: e, applicationNumber: n, registrationFee: { amount: 300, currency: 'KES' } }),
        )
      },
      { appNo, email },
    )
    await page.goto(`${BASE}/verify-email?email=${encodeURIComponent(email)}`)
    await page.waitForSelector('#root, #app, main', { timeout: 15000 })

    await expect(page.getByTestId('application-received')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('application-number')).toHaveText(appNo)
    await expect(page.getByTestId('membership-status')).toContainText(/pending verification/i)

    // OTP UI still present
    await expect(page.getByLabel(/Digit 1/i)).toBeVisible()

    await page.reload()
    await page.waitForSelector('#root, #app, main', { timeout: 15000 })
    await expect(page.getByTestId('application-number')).toHaveText(appNo)
    await expect(page.getByTestId('membership-status')).toContainText(/pending verification/i)
  })

  test('does not fabricate an application number when storage is empty', async ({ page }) => {
    await page.goto(`${BASE}/verify-email`)
    await page.evaluate(() => sessionStorage.removeItem('luma.pendingApplication'))
    await page.goto(`${BASE}/verify-email?email=${encodeURIComponent('nobody@example.com')}`)
    await page.waitForSelector('#root, #app, main', { timeout: 15000 })

    await expect(page.getByTestId('application-number')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /Verify Your Email/i })).toBeVisible()
  })
})
