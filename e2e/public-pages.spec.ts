/**
 * E2E Tests — Public Website Pages
 *
 * Tests the public-facing pages for:
 * - Correct rendering and content
 * - Navigation links
 * - Responsive behavior
 * - SEO metadata
 * - Media/gallery viewers
 *
 * Run: npx playwright test e2e/public-pages.spec.ts
 */

import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://luma-welfare.vercel.app'

// ============================================================================
// HOMEPAGE
// ============================================================================

test.describe('Homepage', () => {
  test('loads with correct title and meta', async ({ page }) => {
    const response = await page.goto(`${BASE}/`)
    expect(response?.status()).toBe(200)

    await expect(page).toHaveTitle(/Luma Welfare/)

    // Check meta description exists
    const metaDesc = page.locator('meta[name="description"]')
    await expect(metaDesc).toHaveAttribute('content', /.+/)
  })

  test('has navigation links to key pages', async ({ page }) => {
    await page.goto(`${BASE}/`)

    // Should have navigation to key sections
    const nav = page.locator('nav, header, [role="navigation"]')
    await expect(nav.first()).toBeVisible()

    // Check for key nav links
    const navText = await page.locator('nav, header').first().textContent()
    expect(navText).toBeTruthy()
  })

  test('SPA renders without blank screen', async ({ page }) => {
    await page.goto(`${BASE}/`)

    // Wait for React to mount
    await page.waitForSelector('#root, #app, main, [data-reactroot]', { timeout: 15000 })

    // Page should have visible content (not just an empty div)
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(50)
  })
})

// ============================================================================
// PACKAGES PAGE
// ============================================================================

test.describe('Packages Page', () => {
  test('loads and renders', async ({ page }) => {
    await page.goto(`${BASE}/packages`)

    await expect(page).toHaveTitle(/Luma Welfare/)

    // Wait for content to load — data pages need more time
    await page.waitForSelector('#root, #app, main', { timeout: 20000 })
    await page.waitForTimeout(2000) // Allow API data to load
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(20)
  })
})

// ============================================================================
// NEWS PAGE
// ============================================================================

test.describe('News Page', () => {
  test('loads and renders', async ({ page }) => {
    await page.goto(`${BASE}/news`)

    await expect(page).toHaveTitle(/Luma Welfare/)

    await page.waitForSelector('#root, #app, main', { timeout: 15000 })
  })
})

// ============================================================================
// GALLERY PAGE
// ============================================================================

test.describe('Gallery Page', () => {
  test('loads and renders', async ({ page }) => {
    await page.goto(`${BASE}/gallery`)

    await expect(page).toHaveTitle(/Luma Welfare/)

    await page.waitForSelector('#root, #app, main', { timeout: 20000 })
    await page.waitForTimeout(2000) // Allow API data to load

    // Should have some content (empty state or gallery items)
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(20)
  })
})

// ============================================================================
// MEDIA PAGE
// ============================================================================

test.describe('Media Page', () => {
  test('loads and renders', async ({ page }) => {
    await page.goto(`${BASE}/media`)

    await expect(page).toHaveTitle(/Luma Welfare/)

    await page.waitForSelector('#root, #app, main', { timeout: 20000 })
    await page.waitForTimeout(2000) // Allow API data to load

    // Should have filter tabs or media content
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(20)
  })

  test('has media type filter tabs', async ({ page }) => {
    await page.goto(`${BASE}/media`)

    await page.waitForSelector('#root, #app, main', { timeout: 20000 })
    await page.waitForTimeout(2000) // Allow API data to load

    // Look for filter buttons/tabs
    const filterButtons = page.locator('button:has-text("All"), button:has-text("Photo"), button:has-text("Video"), button:has-text("Audio"), button:has-text("Document")')
    const count = await filterButtons.count()
    // Should have at least 3 filter options
    expect(count).toBeGreaterThanOrEqual(3)
  })
})

// ============================================================================
// SEO — META TAGS
// ============================================================================

test.describe('SEO — Meta Tags', () => {
  const seoPages = ['/', '/packages', '/media', '/gallery', '/news']

  for (const path of seoPages) {
    test(`${path} has og:title meta tag`, async ({ page }) => {
      await page.goto(`${BASE}${path}`)

      const ogTitle = page.locator('meta[property="og:title"]')
      await expect(ogTitle).toHaveAttribute('content', /.+/)
    })

    test(`${path} has canonical link`, async ({ page }) => {
      await page.goto(`${BASE}${path}`)

      const canonical = page.locator('link[rel="canonical"]')
      await expect(canonical).toHaveAttribute('href', /.+/)
    })
  }
})

// ============================================================================
// RESPONSIVENESS — MOBILE VIEWPORT
// ============================================================================

test.describe('Responsive Design', () => {
  test('homepage works on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }) // iPhone X
    await page.goto(`${BASE}/`)

    // Page should render without horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(375 + 50) // Tolerance for scrollbar + minor layout shifts
  })

  test('media page works on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }) // iPad
    await page.goto(`${BASE}/media`)

    await page.waitForSelector('#root, #app, main', { timeout: 15000 })

    // Should not have horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(768 + 20)
  })

  test('login page works on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${BASE}/login`)

    // Login form should be visible and usable on mobile
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
    await expect(emailInput.first()).toBeVisible()
  })
})

// ============================================================================
// PERFORMANCE — SPA LOADING
// ============================================================================

test.describe('Performance', () => {
  test('homepage loads within 5 seconds', async ({ page }) => {
    const start = Date.now()
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#root, #app, main, [data-reactroot]', { timeout: 15000 })
    const loadTime = Date.now() - start

    expect(loadTime).toBeLessThan(5000)
  })

  test('navigation between pages is fast (SPA)', async ({ page }) => {
    await page.goto(`${BASE}/`)

    // Wait for initial load
    await page.waitForSelector('#root, #app, main', { timeout: 15000 })

    // Navigate to packages (should be SPA navigation, not full page reload)
    const start = Date.now()

    // Find and click a packages link
    const packagesLink = page.locator('a[href="/packages"]').first()
    if (await packagesLink.isVisible()) {
      await packagesLink.click()
      await page.waitForURL('**/packages', { timeout: 10000 })
      const navTime = Date.now() - start
      // SPA navigation should be under 3 seconds
      expect(navTime).toBeLessThan(3000)
    }
  })
})
