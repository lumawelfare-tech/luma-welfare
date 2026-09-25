/**
 * OWASP Stage 1+2 security-fix contracts.
 * Offline source checks — do not delete these to hide failures.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseForgotPasswordBody, ValidationError } from '../../../../supabase/functions/shared/validate.ts'
import { detectAllowedImage, detectAllowedPublicMedia, looksLikeScriptableMarkup } from '../../../../supabase/functions/shared/file-upload.ts'
import { pathToFunctionName } from '../api-routes'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('Stage 1 — claim upload IDOR', () => {
  it('uses one claim id for ownership and write, and rejects mismatched aliases', () => {
    const src = read('supabase/functions/member-claims/index.ts')
    expect(src).toContain('Claim id mismatch')
    expect(src).toContain('idParam ?? claimIdAlias')
    expect(src).toMatch(/\.eq\('id', claimId\)/)
    expect(src).toContain('claim_id: claimId')
    expect(src).not.toMatch(/\.eq\('id', uploadClaimId\)/)
  })
})

describe('Stage 1 — login + forgot-password APIs', () => {
  it('maps SPA paths to rate-limited functions', () => {
    expect(pathToFunctionName('auth/login')).toBe('auth-login')
    expect(pathToFunctionName('auth/forgot-password')).toBe('auth-forgot-password')
  })

  it('AuthContext login does not call GoTrue signInWithPassword', () => {
    const src = read('frontend/src/context/AuthContext.tsx')
    expect(src).toContain("api<LoginResponse>('/auth/login'")
    expect(src).not.toMatch(/signInWithPassword\(\{\s*email,\s*password/)
  })

  it('ForgotPassword uses the audited API', () => {
    const src = read('frontend/src/pages/ForgotPassword.tsx')
    expect(src).toContain("'/auth/forgot-password'")
    expect(src).not.toContain('resetPasswordForEmail')
  })

  it('forgot-password parser rejects open redirects', () => {
    expect(
      parseForgotPasswordBody({
        email: 'a@b.co',
        redirectTo: 'https://luma-welfare.vercel.app/reset-password',
      }),
    ).toEqual({
      email: 'a@b.co',
      redirectTo: 'https://luma-welfare.vercel.app/reset-password',
    })
    expect(() =>
      parseForgotPasswordBody({
        email: 'a@b.co',
        redirectTo: 'https://evil.example/reset-password',
      }),
    ).toThrow(ValidationError)
  })
})

describe('Stage 1 — RBAC split', () => {
  it('settings, reveal, and exports no longer use members:read as the gate', () => {
    expect(read('supabase/functions/admin-settings/index.ts')).toContain("requirePermission(session, 'settings', 'read')")
    expect(read('supabase/functions/admin-settings/index.ts')).toContain("requirePermission(session, 'settings', 'update')")
    expect(read('supabase/functions/admin-settings/index.ts')).not.toContain("requirePermission(session, 'members', 'read')")
    expect(read('supabase/functions/admin-reveal-member-id/index.ts')).toContain("requirePermission(session, 'members', 'reveal')")
    expect(read('supabase/functions/admin-exports/index.ts')).toContain("requirePermission(session, 'exports', 'create')")
    expect(read('supabase/functions/admin-notifications/index.ts')).not.toContain("members:update")
  })
})

describe('Stage 1 — claims SoD and fee gate', () => {
  it('blocks self-approve and requires a paid registration fee', () => {
    expect(read('supabase/functions/admin-claims/index.ts')).toContain('SELF_APPROVE_FORBIDDEN')
    expect(read('supabase/functions/admin-members/index.ts')).toContain('FEE_REQUIRED')
    expect(read('supabase/functions/admin-members/index.ts')).not.toContain('markPaymentVerified')
  })
})

describe('Stage 1+2 — staff 2FA', () => {
  it('requires setup when 2FA is off and rate-limits TOTP', () => {
    const session = read('supabase/functions/shared/supabase.ts')
    expect(session).toContain('2fa_setup_required')
    expect(session).toContain('ADMIN_2FA_SETUP_REQUIRED')
    const twofa = read('supabase/functions/admin-2fa/index.ts')
    expect(twofa).toContain("rateLimitAsync(req, 'admin-2fa'")
    expect(twofa).toContain("action: 'totp_failed'")
    expect(twofa).not.toContain("verified: true, message: '2FA not enabled.")
  })
})

describe('Stage 2 — uploads, CORS, signup, audit, CI', () => {
  it('public image uploads use magic bytes', () => {
    expect(read('supabase/functions/admin-gallery/index.ts')).toContain('detectAllowedImage')
    expect(read('supabase/functions/admin-news/index.ts')).toContain('detectAllowedImage')
    expect(read('supabase/functions/admin-media/index.ts')).toContain('detectAllowedPublicMedia')
    expect(read('supabase/functions/member-profile/index.ts')).toContain('detectAllowedImage')
  })

  it('detectAllowedImage accepts JPEG and rejects HTML', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(detectAllowedImage(jpeg)?.ext).toBe('jpg')
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>')
    expect(detectAllowedImage(html)).toBeNull()
    expect(looksLikeScriptableMarkup(html)).toBe(true)
    const mp4 = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
    expect(detectAllowedPublicMedia(mp4)?.ext).toBe('mp4')
  })

  it('health and callback use handleCors; signup is disabled in config', () => {
    expect(read('supabase/functions/health/index.ts')).toContain('handleCors')
    expect(read('supabase/functions/payments-callback/index.ts')).toContain('handleCors')
    const cfg = read('supabase/config.toml')
    expect(cfg).toMatch(/enable_signup\s*=\s*false/)
    expect(cfg).not.toMatch(/enable_signup\s*=\s*true/)
  })

  it('anonymize scrubs leftover PII and audit UPDATE is blocked', () => {
    const mig = read('supabase/migrations/20260923170000_owasp_stage12_security_fixes.sql')
    expect(mig).toContain('residential_address = NULL')
    expect(mig).toContain('whatsapp_phone = NULL')
    expect(mig).toContain('emergency_contact_name = NULL')
    expect(mig).toContain('prevent_audit_log_update')
    expect(mig).toContain("('exports', 'create')")
  })

  it('deploy workflow does not interpolate function_name into the shell', () => {
    const wf = read('.github/workflows/ci.yml')
    expect(wf).toContain('FUNCTION_NAME: ${{ github.event.inputs.function_name }}')
    expect(wf).not.toContain('if [ -n "${{ inputs.function_name }}" ]')
    expect(wf).toContain('auth-forgot-password')
    expect(wf).toContain('VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_ANON_KEY }}')
    const verify = read('scripts/verify-deploy.sh')
    expect(verify).toContain('VITE_SUPABASE_PUBLISHABLE_KEY:-${SUPABASE_ANON_KEY')
    expect(verify).not.toContain('grep \'VITE_SUPABASE_PUBLISHABLE_KEY\' .env.local')
  })

  it('auth-forgot-password function exists', () => {
    expect(existsSync(resolve(root, 'supabase/functions/auth-forgot-password/index.ts'))).toBe(true)
  })
})
