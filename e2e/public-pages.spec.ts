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

    await page.waitForSelector('main', { timeout: 20_000 })
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 })
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

    await page.waitForSelector('main', { timeout: 15_000 })
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 })
  })
})

// ============================================================================
// GALLERY PAGE
// ============================================================================

test.describe('Gallery Page', () => {
  test('loads and renders', async ({ page }) => {
    await page.goto(`${BASE}/gallery`)

    await expect(page).toHaveTitle(/Luma Welfare/)

    await page.waitForSelector('main', { timeout: 20_000 })
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 })

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

    await page.waitForSelector('main', { timeout: 20_000 })
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 })

    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(20)
  })

  test('has media type filter tabs', async ({ page }) => {
    await page.goto(`${BASE}/media`)

    await page.waitForSelector('main', { timeout: 20_000 })
    await expect(
      page.locator('button:has-text("All"), button:has-text("Photo"), button:has-text("Video")').first(),
    ).toBeVisible({ timeout: 20_000 })

    const filterButtons = page.locator('button:has-text("All"), button:has-text("Photo"), button:has-text("Video"), button:has-text("Audio"), button:has-text("Document")')
    const count = await filterButtons.count()
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

  test('homepage has no floating WhatsApp FAB or sticky guest Join bar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${BASE}/`)
    await page.waitForSelector('main', { timeout: 15000 })

    await expect(page.getByRole('link', { name: 'Chat on WhatsApp' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Join Luma — Free Registration/i })).toHaveCount(0)
  })
})

// ============================================================================
// FOOTER
// ============================================================================

test.describe('Site footer', () => {
  test('is the last landmark and links resolve without 404', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await page.waitForSelector('[data-testid="site-footer"], footer', { timeout: 20_000 })
    await page.waitForFunction(() => !document.querySelector('main[data-prerender="true"]'), null, {
      timeout: 20_000,
    }).catch(() => {})

    const footer = page.locator('[data-testid="site-footer"], footer[role="contentinfo"]').last()
    await expect(footer).toBeVisible()

    const isLast = await page.evaluate(() => {
      const footers = Array.from(document.querySelectorAll('footer, [data-testid="site-footer"]'))
      const last = footers[footers.length - 1]
      if (!last) return false
      let el: Element | null = last
      while (el && el.parentElement && el.parentElement !== document.body) {
        el = el.parentElement
      }
      const rootChildren = Array.from(document.querySelector('#root')?.children ?? document.body.children)
      const lastMeaningful = [...rootChildren].reverse().find((n) => {
        if (!(n instanceof HTMLElement)) return false
        const text = (n.textContent || '').trim()
        const cls = String(n.className || '')
        if (!text && cls.includes('pointer-events-none')) return false
        return true
      })
      return lastMeaningful != null && (lastMeaningful === el || lastMeaningful.contains(last))
    })
    expect(isLast).toBe(true)

    const paths = [
      '/about',
      '/how-it-works',
      '/packages',
      '/register',
      '/faq',
      '/contact',
      '/privacy',
      '/terms',
    ]
    for (const path of paths) {
      const link = footer.locator(`a[href="${path}"]`).first()
      await expect(link).toBeVisible()
      const response = await page.request.get(`${BASE}${path}`)
      expect(response.status(), `${path} should not 404`).toBeLessThan(400)
    }

    const faqCount = await footer.locator('a[href="/faq"]').count()
    expect(faqCount).toBe(1)
  })

  test('has no horizontal scroll at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${BASE}/`)
    await page.waitForSelector('[data-testid="site-footer"], footer', { timeout: 20_000 })
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(375 + 8)
  })
})

// ============================================================================
// FOOTER IS LAST — NO ORPHAN BOOT BRAND
// ============================================================================

const PUBLIC_CHECK_ROUTES = [
  '/',
  '/about',
  '/packages',
  '/how-it-works',
  '/faq',
  '/contact',
  '/privacy',
  '/terms',
  '/register',
] as const

test.describe('Footer is last on public routes', () => {
  for (const route of PUBLIC_CHECK_ROUTES) {
    for (const viewport of [
      { width: 375, height: 812, label: '375px' },
      { width: 1280, height: 800, label: '1280px' },
    ] as const) {
      test(`${route} @ ${viewport.label}: footer last, no orphan boot brand`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.goto(`${BASE}${route === '/' ? '/' : route}`, { waitUntil: 'networkidle' })
        await page.waitForSelector('[data-testid="site-footer"], footer[role="contentinfo"]', {
          timeout: 20_000,
        })

        // Wait for SPA to replace prerender shell
        await page.waitForFunction(() => !document.querySelector('main[data-prerender="true"]'), null, {
          timeout: 20_000,
        }).catch(() => {})

        const result = await page.evaluate(() => {
          const footer = document.querySelector('[data-testid="site-footer"], footer[role="contentinfo"]')
          if (!footer) return { ok: false, reason: 'no-footer' as const }

          const orphans = Array.from(
            document.querySelectorAll(
              'body > .app-boot-static, body > .app-boot-static__wordmark, body > .app-boot-static__tag',
            ),
          ).map((el) => (el.textContent || '').trim())

          // Last meaningful content node in body (ignore empty toast hosts)
          const bodyKids = Array.from(document.body.children).filter((el) => {
            const text = (el.textContent || '').trim()
            const cls = String(el.className || '')
            if (el.id === 'root') return true
            if (!text && cls.includes('pointer-events-none')) return false
            return true
          })
          const last = bodyKids[bodyKids.length - 1]
          const lastIsRoot = last?.id === 'root'

          // Brand wordmark "Luma Welfare" as direct brand line inside footer (once)
          const footerBrand = footer.querySelectorAll('*')
          let footerNameHits = 0
          footerBrand.forEach((el) => {
            if (el.childElementCount === 0 && (el.textContent || '').trim() === 'Luma Welfare') {
              footerNameHits += 1
            }
          })

          // Nothing with Community Welfare after footer in document order
          const afterFooter: string[] = []
          const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
          let passed = false
          let node = walk.currentNode as Element | null
          while (node) {
            if (node === footer) {
              passed = true
            } else if (passed && node !== footer && !footer.contains(node)) {
              const t = (node.textContent || '').trim()
              if (t === 'Community Welfare' || t === 'COMMUNITY WELFARE') {
                // only count leaf-ish
                if (node.childElementCount === 0) afterFooter.push(t)
              }
              if (
                node.classList?.contains('app-boot-static__wordmark') ||
                node.classList?.contains('app-boot-static__tag')
              ) {
                afterFooter.push(node.className)
              }
            }
            node = walk.nextNode() as Element | null
          }

          return {
            ok: true as const,
            orphans,
            lastIsRoot,
            footerNameHits,
            afterFooter,
          }
        })

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.orphans, 'no orphan boot nodes under body').toEqual([])
        expect(result.afterFooter, 'no Community Welfare / boot brand after footer').toEqual([])
        expect(result.lastIsRoot, 'footer lives inside #root which is last body child').toBe(true)
        expect(result.footerNameHits).toBeGreaterThanOrEqual(1)
        expect(result.footerNameHits).toBeLessThanOrEqual(2)
      })
    }
  }
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

test.describe('Official organisation copy', () => {
  test('FAQ, Privacy, and Terms contain key phrases from the org documents', async ({ page }) => {
    await page.goto(`${BASE}/faq`)
    await expect(page.getByRole('heading', { name: /Frequently Asked Questions/i })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /What is LUMA Welfare and when was it founded/i }).click()
    await expect(page.getByText(/Boss Williams/i).first()).toBeVisible()
    await expect(page.getByText(/Mission of Mercy/i).first()).toBeVisible()
    await page.getByRole('button', { name: /core values/i }).click()
    await expect(page.getByText(/Unity/i).first()).toBeVisible()
    await page.getByRole('button', { name: /Must I pay every month for every package/i }).click()
    await expect(page.getByText(/Every enrolled package requires its applicable monthly contribution/i).first()).toBeVisible()
    await expect(page.getByText(/Monthly payments cannot be skipped for any package/i).first()).toBeVisible()

    await page.goto(`${BASE}/privacy`)
    await expect(page.getByRole('heading', { name: /Privacy Policy/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/DRAFT/i).first()).toBeVisible()
    await expect(page.getByText(/legitimate welfare activities/i).first()).toBeVisible()

    await page.goto(`${BASE}/terms`)
    await expect(page.getByRole('heading', { name: /Terms/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/DRAFT/i).first()).toBeVisible()
    await expect(page.getByText(/does not automatically guarantee/i).first()).toBeVisible()
    await expect(page.getByText(/Every enrolled package requires its applicable monthly contribution/i).first()).toBeVisible()
    await expect(page.getByText(/Monthly payments cannot be skipped for any package/i).first()).toBeVisible()
  })
})
