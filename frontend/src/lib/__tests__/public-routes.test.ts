import { describe, expect, it } from 'vitest'
import { PUBLIC_ROUTES, NOINDEX_PREFIXES, resolveSiteUrl } from '../public-routes'
import { DEFAULT_IMAGE, formatPageTitle, SITE_NAME } from '../seo'

describe('public routes registry', () => {
  it('includes core marketing paths once', () => {
    const paths = PUBLIC_ROUTES.map((r) => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/packages')
    expect(paths).toContain('/contact')
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('keeps portals/auth out of the public list', () => {
    const paths = PUBLIC_ROUTES.map((r) => r.path)
    for (const prefix of ['/admin', '/dashboard', '/login']) {
      expect(paths.some((p) => p === prefix || p.startsWith(`${prefix}/`))).toBe(false)
    }
    expect(NOINDEX_PREFIXES).toContain('/admin')
    expect(NOINDEX_PREFIXES).toContain('/login')
  })

  it('resolves site URL from env with production default', () => {
    expect(resolveSiteUrl({})).toBe('https://luma-welfare.vercel.app')
    expect(resolveSiteUrl({ VITE_SITE_URL: 'https://example.org/' })).toBe('https://example.org')
  })
})

describe('OG defaults', () => {
  it('points DEFAULT_IMAGE at the dedicated 1200×630 asset', () => {
    expect(DEFAULT_IMAGE).toMatch(/\/brand\/og-default\.png$/)
    expect(formatPageTitle('Packages')).toBe(`Packages | ${SITE_NAME}`)
  })
})
