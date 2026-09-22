import { handleCors, corsHeaders } from '../shared/cors.ts'
import { createAdminClient, logAudit } from '../shared/supabase.ts'
import { sendEmail, buildOtpEmail } from '../shared/email.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import { generateOtp, hashOtp, OTP_TTL_MINUTES, OtpConfigError } from '../shared/otp.ts'
import { parseRegisterBody, ValidationError } from '../shared/validate.ts'
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '../shared/legal-versions.ts'

/**
 * auth-register — creates the Supabase Auth user, a member application in
 * pending_approval, issues LUMA-APP-* application number, and emails OTP.
 *
 * Flow: register → /verify-email (OTP) → email confirmed, still pending_approval
 * → /application-status → admin payment verify + approve → membership number + active.
 */

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // Rate limit: 5 registration attempts per window per trusted subject
  const limit = await rateLimitAsync(req, 'register', { windowMs: 300_000, max: 5 })
  if (!limit.ok) return limit.response!

  if (req.method !== 'POST') {
    return json(405, { message: 'Method not allowed' })
  }

  try {
    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return json(400, { message: 'Invalid JSON body.', code: 'VALIDATION' })
    }

    const {
      email, password, fullName, phone, idNumber,
      dateOfBirth, gender, maritalStatus, county, location, residentialAddress,
      whatsappPhone, altPhone,
      emergencyContactName, emergencyContactRelationship, emergencyContactPhone, emergencyContactAltPhone,
      familyCoverage, applicationProgramCodes,
      privacyPolicyVersion, termsVersion,
    } = parseRegisterBody(raw)

    if (privacyPolicyVersion !== PRIVACY_POLICY_VERSION || termsVersion !== TERMS_VERSION) {
      return json(400, {
        message: 'Please refresh the page and accept the current Privacy Policy and Terms.',
        code: 'LEGAL_VERSION_MISMATCH',
      })
    }

    const adminClient = createAdminClient()
    const consentAt = new Date().toISOString()

    const { data: existingId } = await adminClient
      .from('members')
      .select('id')
      .eq('id_number', idNumber)
      .maybeSingle()
    if (existingId) {
      return json(409, {
        message: 'That ID number is already registered.',
        code: 'ID_NUMBER_TAKEN',
      })
    }

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { full_name: fullName },
    })

    if (authError) {
      const msg = (authError.message ?? '').toLowerCase()
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        return json(409, { message: 'That email is already registered. Sign in instead.', code: 'EMAIL_TAKEN' })
      }
      console.error('auth-register: createUser failed', authError.name ?? 'AuthError')
      return json(400, { message: 'Could not create account. Please try again.', code: 'AUTH' })
    }

    const userId = authData.user.id

    const { data: appNumRow, error: appNumErr } = await adminClient.rpc('generate_application_number')
    if (appNumErr || !appNumRow) {
      await adminClient.auth.admin.deleteUser(userId)
      console.error('auth-register: application number failed', appNumErr?.code ?? 'APP_NUM')
      return json(500, { message: 'Could not create membership. Please try again.', code: 'DB_ERROR' })
    }
    const applicationNumber = typeof appNumRow === 'string' ? appNumRow : String(appNumRow)

    const { error: memberError } = await adminClient.from('members').insert({
      id: userId,
      full_name: fullName,
      phone,
      id_number: idNumber,
      email,
      status: 'pending_approval',
      application_number: applicationNumber,
      application_submitted_at: consentAt,
      date_of_birth: dateOfBirth,
      gender,
      marital_status: maritalStatus,
      county,
      location,
      residential_address: residentialAddress,
      whatsapp_phone: whatsappPhone,
      alt_phone: altPhone,
      emergency_contact_name: emergencyContactName,
      emergency_contact_relationship: emergencyContactRelationship,
      emergency_contact_phone: emergencyContactPhone,
      emergency_contact_alt_phone: emergencyContactAltPhone,
      family_coverage: familyCoverage,
      application_program_codes: applicationProgramCodes,
      privacy_accepted_at: consentAt,
      terms_accepted_at: consentAt,
      constitution_accepted_at: consentAt,
      privacy_policy_version: privacyPolicyVersion,
      terms_version: termsVersion,
    })

    if (memberError) {
      await adminClient.auth.admin.deleteUser(userId)
      const code = (memberError as { code?: string }).code
      if (code === '23505') {
        return json(409, {
          message: 'That ID number or email is already registered.',
          code: 'DUPLICATE',
        })
      }
      console.error('auth-register: member insert failed', memberError.code ?? 'DB')
      return json(500, { message: 'Could not create membership. Please try again.', code: 'DB_ERROR' })
    }

    await adminClient.from('member_legal_acceptances').insert([
      {
        member_id: userId,
        document_type: 'privacy',
        document_version: privacyPolicyVersion,
        accepted_at: consentAt,
        source: 'registration',
      },
      {
        member_id: userId,
        document_type: 'terms',
        document_version: termsVersion,
        accepted_at: consentAt,
        source: 'registration',
      },
    ])

    await logAudit(adminClient, {
      actor_id: userId,
      action: 'registered',
      resource: 'member',
      resource_id: userId,
    })

    const code = generateOtp()
    const otpHash = await hashOtp(userId, code)
    const nowIso = new Date().toISOString()
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString()

    const { error: otpError } = await adminClient
      .from('email_verifications')
      .upsert({
        user_id: userId,
        email,
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
      console.error('Failed to store verification code:', otpError.code ?? 'OTP_STORE')
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
        console.error('Verification email failed: delivery_error')
        await logAudit(adminClient, {
          actor_id: userId,
          action: 'EMAIL_DELIVERY_FAILED',
          resource: 'email_verification',
          resource_id: userId,
          meta: { context: 'register', reason: 'delivery_failed' },
        })
      }
    }

    const { error: feeError } = await adminClient.from('registration_fees').insert({
      member_id: userId,
      fee_type: 'registration',
      amount: 300,
      currency: 'KES',
      status: 'unpaid',
    })
    if (feeError) {
      console.error('Failed to create registration fee record:', feeError.code ?? 'FEE')
    }

    return json(201, {
      message: emailSent
        ? 'Application received. We sent a 6-digit verification code to your email. It expires in 10 minutes.'
        : 'Application received. We could not send the verification email right now — use "Resend code" on the next screen.',
      userId,
      email,
      emailSent,
      applicationNumber,
      membershipStatus: 'pending_verification',
    })
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { message: err.message, code: 'VALIDATION' })
    }
    if (err instanceof OtpConfigError) {
      console.error('auth-register: OTP configuration error')
      return json(503, { message: 'Verification is temporarily unavailable.', code: 'OTP_CONFIG' })
    }
    console.error('auth-register: unexpected', err instanceof Error ? err.name : 'unknown')
    return json(500, { message: 'Internal server error', code: 'INTERNAL' })
  }
})
