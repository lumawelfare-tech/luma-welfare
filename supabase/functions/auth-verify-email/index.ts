import { handleCors, corsHeaders } from '../shared/cors.ts'
import { createAdminClient, logAudit } from '../shared/supabase.ts'
import { sendEmail, buildOtpEmail } from '../shared/email.ts'
import { rateLimit } from '../shared/rate-limit.ts'
import {
  generateOtp,
  hashOtp,
  otpMatches,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  RESEND_HOURLY_LIMIT,
} from '../shared/otp.ts'

/**
 * auth-verify-email — server-authoritative OTP email verification.
 *
 * Actions (POST):
 *   default / ?action=verify  body: { email, code }   → verify a 6-digit code
 *   ?action=resend            body: { email }          → issue a new code
 *
 * Security:
 *   - Codes stored as HMAC-SHA256 hashes only (shared/otp.ts)
 *   - 10-minute TTL, single-use, max 5 attempts per code
 *   - Resend: 60s cooldown + max 3 per rolling hour (atomic conditional updates)
 *   - Per-IP rate limits on both actions
 *   - Anti-enumeration: unknown emails get generic responses
 *   - Activation (auth email_confirm + member status) only happens here,
 *     never on the client.
 */

const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function invalidCode(): Response {
  return json(400, {
    message: 'Invalid code. Please check the email and try again.',
    code: 'INVALID_CODE',
  })
}

/** Keep response timing uniform for unknown emails/hashes. */
async function timingBurn(): Promise<void> {
  await otpMatches(DUMMY_USER_ID, '000000', null)
}

/** Flip auth email confirmation + activate a pending member. Idempotent. */
async function activateMember(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  await adminClient
    .from('members')
    .update({ status: 'active' })
    .eq('id', userId)
    .eq('status', 'pending_approval')

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    email_confirm: true,
  })
  if (error) {
    // Member activation is already effective; log so ops can confirm the
    // Supabase auth flag (only matters when email confirmations are enforced).
    console.error(`auth-verify-email: updateUserById failed for ${userId}: ${error.message}`)
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return json(405, { message: 'Method not allowed' })
  }

  const url = new URL(req.url)
  let action = url.searchParams.get('action') ?? 'verify'
  let body: Record<string, unknown> = {}
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  if (typeof body.action === 'string' && body.action) action = body.action
  action = action.toLowerCase()

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || !EMAIL_RE.test(email)) {
    return json(400, { message: 'A valid email address is required.', code: 'VALIDATION' })
  }

  const adminClient = createAdminClient()

  // ── VERIFY ────────────────────────────────────────────────────────────────
  if (action === 'verify') {
    const limit = rateLimit(req, 'auth-verify-email', { windowMs: 60_000, max: 10 })
    if (!limit.ok) return limit.response!

    const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : ''
    if (!/^\d{6}$/.test(code)) return invalidCode()

    const { data: member } = await adminClient
      .from('members')
      .select('id, status')
      .ilike('email', email)
      .maybeSingle()

    if (!member) {
      await timingBurn()
      return invalidCode()
    }

    const { data: row } = await adminClient
      .from('email_verifications')
      .select('id, otp_hash, expires_at, attempts, verified_at')
      .eq('user_id', member.id)
      .maybeSingle()

    if (!row) {
      await timingBurn()
      return invalidCode()
    }

    // Already verified — idempotent success (also self-heals activation).
    if (row.verified_at) {
      if ((member as { status: string }).status === 'pending_approval') {
        await activateMember(adminClient, member.id)
      }
      return json(200, { verified: true, alreadyVerified: true })
    }

    // Attempt cap — block this code entirely.
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      const expiresAtMs = new Date(row.expires_at).getTime()
      const coolDownSec = Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 1000))
      return json(429, {
        message: 'Too many incorrect attempts. Please request a new code.',
        code: 'TOO_MANY_ATTEMPTS',
        retry_after: coolDownSec,
      })
    }

    // Expiry check.
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return json(400, {
        message: 'This code has expired. Please request a new one.',
        code: 'EXPIRED_CODE',
      })
    }

    const matches = await otpMatches(member.id, code, row.otp_hash)

    if (!matches) {
      // Atomic attempt increment — never exceeds the cap.
      const { data: bumped } = await adminClient
        .from('email_verifications')
        .update({ attempts: row.attempts + 1 })
        .eq('id', row.id)
        .lt('attempts', OTP_MAX_ATTEMPTS)
        .select('attempts')
        .maybeSingle()

      const attempts = bumped?.attempts ?? row.attempts + 1
      await logAudit(adminClient, {
        actor_id: member.id,
        action: 'OTP_FAILED',
        resource: 'email_verification',
        resource_id: member.id,
        meta: { attempts },
      })

      if (attempts >= OTP_MAX_ATTEMPTS) {
        return json(429, {
          message: 'Too many incorrect attempts. Please request a new code.',
          code: 'TOO_MANY_ATTEMPTS',
        })
      }
      return json(400, {
        message: `Invalid code. ${OTP_MAX_ATTEMPTS - attempts} attempt${OTP_MAX_ATTEMPTS - attempts === 1 ? '' : 's'} remaining.`,
        code: 'INVALID_CODE',
      })
    }

    // Single-use claim — atomic; concurrent verifiers are idempotent.
    const { data: claimed } = await adminClient
      .from('email_verifications')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('verified_at', null)
      .select('id')
      .maybeSingle()

    if (claimed) {
      await activateMember(adminClient, member.id)
      await logAudit(adminClient, {
        actor_id: member.id,
        action: 'OTP_VERIFIED',
        resource: 'email_verification',
        resource_id: member.id,
      })
    }

    return json(200, { verified: true, alreadyVerified: !claimed })
  }

  // ── RESEND ────────────────────────────────────────────────────────────────
  if (action === 'resend') {
    const limit = rateLimit(req, 'auth-verify-email-resend', { windowMs: 60_000, max: 5 })
    if (!limit.ok) return limit.response!

    const { data: member } = await adminClient
      .from('members')
      .select('id, status')
      .ilike('email', email)
      .maybeSingle()

    if (!member) {
      // Anti-enumeration: generic success, no email is sent.
      await timingBurn()
      return json(200, { sent: true, retryAfter: RESEND_COOLDOWN_SECONDS })
    }

    const { data: row } = await adminClient
      .from('email_verifications')
      .select('id, hourly_count, hourly_window_start, verified_at, created_at')
      .eq('user_id', member.id)
      .maybeSingle()

    // Already verified (or legacy account with a confirmed auth email and an
    // active membership) — nothing to resend.
    if (row?.verified_at) {
      return json(200, { alreadyVerified: true })
    }
    const { data: authUser } = await adminClient.auth.admin.getUserById(member.id)
    const emailConfirmed = !!authUser?.user?.email_confirmed_at
    if (emailConfirmed && (member as { status: string }).status === 'active') {
      return json(200, { alreadyVerified: true })
    }

    const nowIso = new Date().toISOString()
    const code = generateOtp()
    const otpHash = await hashOtp(member.id, code)
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString()
    const cooldownCutoff = new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000).toISOString()
    const hourCutoff = new Date(Date.now() - 3_600_000).toISOString()

    let issued = false

    if (row) {
      // Branch 1: hourly window stale → reset counters atomically.
      const { data: reset } = await adminClient
        .from('email_verifications')
        .update({
          otp_hash: otpHash,
          expires_at: expiresAt,
          attempts: 0,
          hourly_count: 1,
          hourly_window_start: nowIso,
          verified_at: null,
          created_at: nowIso,
        })
        .eq('id', row.id)
        .lt('hourly_window_start', hourCutoff)
        .select('id')
        .maybeSingle()
      issued = !!reset

      // Branch 2: within window → cooldown + hourly cap, atomically.
      if (!issued) {
        const { data: bumped } = await adminClient
          .from('email_verifications')
          .update({
            otp_hash: otpHash,
            expires_at: expiresAt,
            attempts: 0,
            hourly_count: row.hourly_count + 1,
            verified_at: null,
            created_at: nowIso,
          })
          .eq('id', row.id)
          .gte('hourly_window_start', hourCutoff)
          .lt('hourly_count', RESEND_HOURLY_LIMIT)
          .lt('created_at', cooldownCutoff)
          .select('id')
          .maybeSingle()
        issued = !!bumped
      }
    } else {
      // First code for this account.
      const { data: inserted, error: insertError } = await adminClient
        .from('email_verifications')
        .insert({
          user_id: member.id,
          email,
          otp_hash: otpHash,
          expires_at: expiresAt,
          attempts: 0,
          hourly_count: 1,
          hourly_window_start: nowIso,
        })
        .select('id')
        .maybeSingle()
      issued = !!inserted && !insertError
    }

    if (!issued) {
      if (!row) {
        return json(500, { message: 'Could not create a verification code. Try again.', code: 'INTERNAL' })
      }
      const inCooldown = new Date(row.created_at).getTime() > Date.now() - RESEND_COOLDOWN_SECONDS * 1000
      if (inCooldown) {
        const retryAfter = Math.max(1, Math.ceil((new Date(row.created_at).getTime() + RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000))
        return json(429, {
          message: `Please wait ${retryAfter}s before requesting a new code.`,
          code: 'RESEND_COOLDOWN',
          retry_after: retryAfter,
        })
      }
      const windowEndMs = new Date(row.hourly_window_start).getTime() + 3_600_000
      const retryAfter = Math.max(1, Math.ceil((windowEndMs - Date.now()) / 1000))
      return json(429, {
        message: `Resend limit reached (${RESEND_HOURLY_LIMIT} per hour). Please try again later.`,
        code: 'RATE_LIMITED',
        retry_after: retryAfter,
      })
    }

    // Deliver the new code.
    const result = await sendEmail(email, 'Luma Welfare Verification Code', buildOtpEmail(code, OTP_TTL_MINUTES))
    if (!result.success) {
      await logAudit(adminClient, {
        actor_id: member.id,
        action: 'EMAIL_DELIVERY_FAILED',
        resource: 'email_verification',
        resource_id: member.id,
        meta: { context: 'resend', reason: result.error ?? 'unknown' },
      })
      return json(502, {
        message: 'We could not send the verification email. Please try again shortly.',
        code: 'EMAIL_FAILED',
      })
    }

    await logAudit(adminClient, {
      actor_id: member.id,
      action: 'OTP_RESENT',
      resource: 'email_verification',
      resource_id: member.id,
    })

    return json(200, {
      sent: true,
      retryAfter: RESEND_COOLDOWN_SECONDS,
      expiresInSeconds: OTP_TTL_MINUTES * 60,
    })
  }

  return json(400, { message: 'Unknown action.', code: 'VALIDATION' })
})
