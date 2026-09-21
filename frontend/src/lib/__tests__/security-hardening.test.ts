/**
 * Security hardening — rate-limit subject + memory consume tests
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('rate-limit source contracts', () => {
  it('does not trust X-Forwarded-For as the primary identity', () => {
    const src = read('supabase/functions/shared/rate-limit.ts')
    const core = read('supabase/functions/shared/rate-limit-core.ts')
    expect(src).toContain('cf-connecting-ip')
    expect(core).toMatch(/Intentionally ignore X-Forwarded-For|Do NOT trust/)
    expect(core).toContain('ip:untrusted')
    expect(src).toContain('consume_rate_limit')
    expect(src).toContain('RATE_LIMIT_UNAVAILABLE')
    expect(core).toContain('FAIL_CLOSED_IDENTIFIERS')
  })

  it('covers auth, payments-initiate, and admin mutations', () => {
    const src = read('supabase/functions/shared/rate-limit.ts')
    expect(src).toContain("'auth-login'")
    expect(src).toContain("'payments-initiate'")
    expect(src).toContain("'admin-members-mutation'")
    expect(src).toContain("'admin-webhook-test'")
  })

  it('auth and payments callers use rateLimitAsync', () => {
    expect(read('supabase/functions/auth-login/index.ts')).toContain('rateLimitAsync')
    expect(read('supabase/functions/auth-register/index.ts')).toContain('rateLimitAsync')
    expect(read('supabase/functions/auth-verify-email/index.ts')).toContain('rateLimitAsync')
    expect(read('supabase/functions/payments-initiate/index.ts')).toContain('rateLimitAsync')
  })

  it('migration defines atomic consume_rate_limit RPC', () => {
    const mig = read('supabase/migrations/20260921120000_rate_limit_buckets.sql')
    expect(mig).toContain('CREATE OR REPLACE FUNCTION public.consume_rate_limit')
    expect(mig).toContain('ON CONFLICT (bucket_key) DO UPDATE')
    expect(mig).toContain('GRANT EXECUTE')
    expect(mig).toContain('service_role')
  })
})

describe('webhook and search wiring contracts', () => {
  it('admin-settings validates webhooks on store and test', () => {
    const src = read('supabase/functions/admin-settings/index.ts')
    expect(src).toContain('assertSafeWebhookUrl')
    expect(src).toContain('safeWebhookFetch')
    expect(src).toContain('Webhook delivery failed.')
    expect(src).not.toMatch(/Test failed: \$\{err/)
  })

  it('health-check validates before delivery', () => {
    const src = read('frontend/api/cron/health-check.ts')
    expect(src).toContain('assertSafeWebhookUrl')
    expect(src).toContain('safeWebhookFetch')
  })

  it('admin search paths use buildIlikeOrFilter or sanitizeSearch', () => {
    for (const f of [
      'supabase/functions/admin-subscriptions/index.ts',
      'supabase/functions/admin-settings/index.ts',
      'supabase/functions/admin-news/index.ts',
      'supabase/functions/admin-media/index.ts',
      'supabase/functions/admin-gallery/index.ts',
      'supabase/functions/admin-reconciliation/index.ts',
      'supabase/functions/admin-scheduled-reports/index.ts',
      'supabase/functions/admin-exports-worker/index.ts',
    ]) {
      const src = read(f)
      expect(src.includes('buildIlikeOrFilter') || src.includes('sanitizeSearch')).toBe(true)
      expect(src).not.toMatch(/\.or\(`[^`]*\$\{/)
    }
  })

  it('OTP module no longer falls back to service role', () => {
    const src = read('supabase/functions/shared/otp.ts')
    expect(src).toContain('OtpConfigError')
    expect(src).toContain('OTP_ALLOW_LOCAL_DEV_FALLBACK')
    expect(src).not.toMatch(/luma-otp-pepper:\$\{serviceKey\}/)
    expect(src).not.toContain("?? 'luma-local-dev'")
  })
})
