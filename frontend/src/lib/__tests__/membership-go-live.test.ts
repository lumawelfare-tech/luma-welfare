/**
 * Production go-live contracts — Vercel cron, CSP, payments kill-switch.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('Vercel cron deploys with frontend root', () => {
  const frontendVercel = JSON.parse(read('frontend/vercel.json'))

  it('declares cleanup and health-check crons', () => {
    const paths = (frontendVercel.crons ?? []).map((c: { path: string }) => c.path)
    expect(paths).toContain('/api/cron/cleanup')
    expect(paths).toContain('/api/cron/health-check')
  })

  it('excludes api/ from SPA rewrite', () => {
    const rewrite = frontendVercel.rewrites?.[0]?.source as string
    expect(rewrite).toContain('api/')
  })

  it('ships cron handlers under frontend/api', () => {
    const cleanup = read('frontend/api/cron/cleanup.ts')
    const health = read('frontend/api/cron/health-check.ts')
    expect(cleanup).toContain('CRON_SECRET')
    expect(cleanup).toContain("Bearer ${cronSecret}")
    expect(health).toContain('CRON_SECRET')
    expect(health).toContain('detail=true')
    expect(health).toContain('x-cron-secret')
  })
})

describe('Production CSP', () => {
  it('does not allow script-src unsafe-inline on frontend vercel.json', () => {
    const cfg = JSON.parse(read('frontend/vercel.json'))
    const csp = cfg.headers?.[0]?.headers?.find(
      (h: { key: string }) => h.key === 'Content-Security-Policy',
    )?.value as string
    expect(csp).toBeTruthy()
    const scriptSrc = csp.split(';').map((d: string) => d.trim()).find((d: string) => d.startsWith('script-src'))
    expect(scriptSrc).toBe("script-src 'self'")
    expect(scriptSrc).not.toContain('unsafe-inline')
  })

  it('index.html has no inline application/ld+json script', () => {
    const html = read('frontend/index.html')
    expect(html).not.toContain('application/ld+json')
  })
})

describe('Payments remain disabled by default', () => {
  it('initiate and callback respect PAYMENTS_ENABLED', () => {
    expect(read('supabase/functions/payments-initiate/index.ts')).toContain("PAYMENTS_ENABLED') !== 'true'")
    expect(read('supabase/functions/payments-callback/index.ts')).toContain("PAYMENTS_ENABLED') !== 'true'")
    expect(read('backend/.env.example')).toMatch(/PAYMENTS_ENABLED=false/)
  })
})
