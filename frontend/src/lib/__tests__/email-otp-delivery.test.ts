/**
 * Email OTP delivery — static regression contracts.
 * Asserts the verification email path stays Resend-backed and does not
 * expose OTPs to clients or logs.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('Email OTP delivery contracts', () => {
  it('auth-register generates OTP, stores hash, and reports emailSent', () => {
    const src = read('supabase/functions/auth-register/index.ts')
    expect(src).toContain('generateOtp')
    expect(src).toContain('hashOtp')
    expect(src).toContain("from('email_verifications')")
    expect(src).toContain('sendEmail')
    expect(src).toContain('buildOtpEmail')
    expect(src).toContain('emailSent')
    expect(src).toContain('EMAIL_DELIVERY_FAILED')
    expect(src).toMatch(/buildOtpEmail\(code/)
    expect(src).toMatch(/hashOtp\(userId,\s*code\)/)
    // Never return plaintext OTP fields to the client
    expect(src).not.toMatch(/verificationCode\s*:/)
    expect(src).not.toMatch(/\botp_plain\b/)
    const responseBlock = src.slice(src.lastIndexOf('return json(201,'))
    expect(responseBlock).toContain('emailSent')
    expect(responseBlock).toContain('emailErrorCode')
    expect(responseBlock).not.toContain('${code}')
    expect(responseBlock).not.toMatch(/\bcode:\s*code\b/)
    expect(responseBlock).not.toMatch(/\bcode:\s*[`'"]\$\{code\}/)
  })

  it('auth-verify-email resend returns EMAIL_FAILED when provider rejects', () => {
    const src = read('supabase/functions/auth-verify-email/index.ts')
    expect(src).toContain("action === 'resend'")
    expect(src).toContain('sendEmail')
    expect(src).toContain('EMAIL_FAILED')
    expect(src).toContain('emailErrorCode')
    expect(src).not.toContain('console.log(code)')
    expect(src).not.toMatch(/json\([^)]*otp[:\s]/)
  })

  it('shared email helper classifies Resend domain failures', () => {
    const src = read('supabase/functions/shared/email.ts')
    expect(src).toContain('RESEND_API_KEY')
    expect(src).toContain('EMAIL_FROM')
    expect(src).toContain('classifyResendError')
    expect(src).toContain('DOMAIN_NOT_VERIFIED')
    expect(src).toContain('senderNeedsDomainVerification')
    expect(src).toContain('api.resend.com/emails')
  })

  it('OTP module uses CSPRNG + HMAC and never logs codes', () => {
    const src = read('supabase/functions/shared/otp.ts')
    expect(src).toContain('crypto.getRandomValues')
    expect(src).toContain('HMAC')
    expect(src).toContain('OTP_TTL_MINUTES')
    expect(src).toContain('OTP_MAX_ATTEMPTS')
    expect(src).not.toContain('console.log')
  })

  it('frontend surfaces delivery failure instead of claiming email was sent', () => {
    const register = read('frontend/src/pages/Register.tsx')
    const verify = read('frontend/src/pages/VerifyEmail.tsx')
    const auth = read('frontend/src/context/AuthContext.tsx')
    expect(auth).toContain('emailSent')
    expect(register).toContain('emailSent: result.emailSent')
    expect(verify).toContain('emailSent?: boolean')
    expect(verify).toContain('We could not deliver the verification email')
  })
})
