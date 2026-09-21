/**
 * Security hardening — OTP_HASH_SECRET fail-closed tests
 */
import { describe, it, expect } from 'vitest'
import {
  resolveOtpHmacSecret,
  isOtpLocalDevFallbackAllowed,
  hashOtp,
  OtpConfigError,
  LOCAL_DEV_OTP_PEPPER,
} from '../../../../supabase/functions/shared/otp.ts'

function envMap(map: Record<string, string | undefined>) {
  return {
    get(name: string) {
      return map[name]
    },
  }
}

describe('OTP_HASH_SECRET hardening', () => {
  it('hashes when OTP_HASH_SECRET is present', async () => {
    const env = envMap({ OTP_HASH_SECRET: 'unit-test-secret-32chars-minimum!!' })
    const a = await hashOtp('user-1', '123456', env)
    const b = await hashOtp('user-1', '123456', env)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('fails closed when secret missing outside local-dev gate', () => {
    const env = envMap({
      SUPABASE_URL: 'https://mkbxigxmhqdhxmptanqr.supabase.co',
    })
    expect(() => resolveOtpHmacSecret(env)).toThrow(OtpConfigError)
  })

  it('allows local-dev pepper only with explicit gate + local URL', () => {
    const env = envMap({
      OTP_ALLOW_LOCAL_DEV_FALLBACK: 'true',
      SUPABASE_URL: 'http://127.0.0.1:54321',
    })
    expect(isOtpLocalDevFallbackAllowed(env)).toBe(true)
    expect(resolveOtpHmacSecret(env)).toBe(LOCAL_DEV_OTP_PEPPER)
  })

  it('does not allow local-dev fallback against production URL', () => {
    const env = envMap({
      OTP_ALLOW_LOCAL_DEV_FALLBACK: 'true',
      SUPABASE_URL: 'https://mkbxigxmhqdhxmptanqr.supabase.co',
    })
    expect(isOtpLocalDevFallbackAllowed(env)).toBe(false)
    expect(() => resolveOtpHmacSecret(env)).toThrow(OtpConfigError)
  })

  it('never uses service-role key as HMAC secret', () => {
    const env = envMap({
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_should_never_be_otp_pepper',
      SUPABASE_URL: 'https://mkbxigxmhqdhxmptanqr.supabase.co',
    })
    expect(() => resolveOtpHmacSecret(env)).toThrow(OtpConfigError)
  })

  it('never uses hard-coded luma-local-dev in production', () => {
    const env = envMap({
      SUPABASE_URL: 'https://mkbxigxmhqdhxmptanqr.supabase.co',
    })
    expect(() => resolveOtpHmacSecret(env)).toThrow(OtpConfigError)
    try {
      resolveOtpHmacSecret(env)
    } catch (err) {
      expect(String(err)).not.toContain('luma-local-dev')
    }
  })
})
