import { handleCors, corsHeaders } from '../shared/cors.ts'
import { createAdminClient, logAudit } from '../shared/supabase.ts'
import { sendEmail, buildOtpEmail } from '../shared/email.ts'
import { rateLimit } from '../shared/rate-limit.ts'
import { generateOtp, hashOtp, OTP_TTL_MINUTES } from '../shared/otp.ts'

/**
 * auth-register — creates the Supabase Auth user, a member record in
 * pending state, and emails a 6-digit OTP for email verification.
 *
 * Flow: register → /verify-email (user enters OTP) → auth-verify-email
 * activates the auth user + member record. Registration itself never
 * activates the account.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // Rate limit: 5 registration attempts per minute per IP
  const limit = rateLimit(req, 'register', { windowMs: 60_000, max: 5 })
  if (!limit.ok) return limit.response!

  if (req.method !== 'POST') {
    return json(405, { message: 'Method not allowed' })
  }

  try {
    const body = await req.json()
    const { email, password, fullName, phone, idNumber } = body

    // Validation
    if (!email || !password || !fullName || !phone) {
      return json(400, { message: 'Missing required fields.', code: 'VALIDATION' })
    }

    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return json(400, { message: 'Enter a valid email address.', code: 'VALIDATION' })
    }

    if (password.length < 8) {
      return json(400, { message: 'Password must be at least 8 characters.', code: 'VALIDATION' })
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return json(400, { message: 'Password must contain at least one letter and one number.', code: 'VALIDATION' })
    }

    if (!/^0[17]\d{8}$/.test(phone)) {
      return json(400, { message: 'Enter a valid Kenyan phone number.', code: 'VALIDATION' })
    }

    const adminClient = createAdminClient()

    // Create auth user using admin client (unconfirmed until OTP verification)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { full_name: fullName },
    })

    if (authError) {
      if (authError.message.toLowerCase().includes('already registered')) {
        return json(409, { message: 'That email is already registered. Sign in instead.', code: 'EMAIL_TAKEN' })
      }
      return json(400, { message: authError.message, code: 'AUTH' })
    }

    const userId = authData.user.id

    // Create member record in PENDING state — activated by OTP verification.
    const { error: memberError } = await adminClient.from('members').insert({
      id: userId,
      full_name: fullName,
      phone,
      id_number: idNumber || null,
      email: email.toLowerCase(),
      status: 'pending_approval',
    })

    if (memberError) {
      // Roll back the auth user so the email isn't locked out of re-registration.
      await adminClient.auth.admin.deleteUser(userId)
      return json(500, { message: memberError.message, code: 'DB_ERROR' })
    }

    // Audit: account registered (pending verification)
    await logAudit(adminClient, {
      actor_id: userId,
      action: 'registered',
      resource: 'member',
      resource_id: userId,
    })

    // ── OTP verification code ──────────────────────────────────────────────
    const code = generateOtp()
    const otpHash = await hashOtp(userId, code)
    const nowIso = new Date().toISOString()
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString()

    const { error: otpError } = await adminClient
      .from('email_verifications')
      .upsert({
        user_id: userId,
        email: email.toLowerCase(),
        otp_hash: otpHash,
        expires_at: expiresAt,
        attempts: 0,
        hourly_count: 1,
        hourly_window_start: nowIso,
        verified_at: null,
        created_at: nowIso,
      }, { onConflict: 'user_id' })

    let emailSent = false
    if (otpError) {
      console.error('Failed to store verification code:', otpError.message)
    } else {
      const result = await sendEmail(
        email,
        'Luma Welfare Verification Code',
        buildOtpEmail(code, OTP_TTL_MINUTES),
      )
      if (result.success) {
        emailSent = true
        await logAudit(adminClient, {
          actor_id: userId,
          action: 'OTP_SENT',
          resource: 'email_verification',
          resource_id: userId,
        })
      } else {
        console.error('Verification email failed:', result.error)
        await logAudit(adminClient, {
          actor_id: userId,
          action: 'EMAIL_DELIVERY_FAILED',
          resource: 'email_verification',
          resource_id: userId,
          meta: { context: 'register', reason: result.error ?? 'unknown' },
        })
      }
    }

    // Create registration fee record (KSh 300 one-time)
    const { error: feeError } = await adminClient.from('registration_fees').insert({
      member_id: userId,
      fee_type: 'registration',
      amount: 300,
      currency: 'KES',
      status: 'unpaid',
    })
    if (feeError) {
      console.error('Failed to create registration fee record:', feeError.message)
    }

    return json(201, {
      message: emailSent
        ? 'Account created. We sent a 6-digit verification code to your email. It expires in 10 minutes.'
        : 'Account created. We could not send the verification email right now — use "Resend code" on the next screen.',
      userId,
      email: email.toLowerCase(),
      emailSent,
    })
  } catch (_err) {
    return json(500, { message: 'Internal server error', code: 'INTERNAL' })
  }
})
