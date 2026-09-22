/**
 * Accessibility smoke checks (axe) for key public surfaces.
 * Run: npx playwright test e2e/a11y.spec.ts
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'

test.describe('Accessibility (axe)', () => {
  test('home page has no serious axe violations', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await page.waitForSelector('main, #root', { timeout: 15000 })
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })

  test('login page has no serious axe violations', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.waitForSelector('form, main, #root', { timeout: 15000 })
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })

  test('contact page has no serious axe violations', async ({ page }) => {
    await page.goto(`${BASE}/contact`)
    await page.waitForSelector('main, #root', { timeout: 15000 })
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })

  test('register page has no serious axe violations', async ({ page }) => {
    await page.goto(`${BASE}/register`)
    await page.waitForSelector('form, main, #root', { timeout: 15000 })
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })
})
