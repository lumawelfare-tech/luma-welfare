import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, createUserClient, logAudit, handleUnexpectedError } from '../shared/supabase.ts'
import { sendEmail, buildEmailTemplate } from '../shared/email.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import { withLogging } from '../shared/logging.ts'
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '../shared/legal-versions.ts'
import { parseMemberProfilePatchBody, ValidationError } from '../shared/validate.ts'
import { maskIdNumberLast4 } from '../shared/pii.ts'
import { detectAllowedImage, looksLikeScriptableMarkup } from '../shared/file-upload.ts'

/**
 * Member Profile — Update profile, avatar, password, data export, deletion request
 *
 * PATCH /member-profile                     — update profile fields
 * POST  /member-profile?action=avatar       — upload avatar image
 * POST  /member-profile?action=password     — change password
 * GET   /member-profile?action=export       — download personal data JSON
 * POST  /member-profile?action=accept-legal — re-accept Privacy/Terms versions
 * POST  /member-profile?action=deletion-request — request account deletion
 * GET   /member-profile?action=deletion-request — latest deletion request status
 */

Deno.serve(withLogging('member-profile', async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // GET — personal data export
    if (req.method === 'GET' && action === 'export') {
      const rl = await rateLimitAsync(req, 'member-data-export', { userId: user.id, adminClient, windowMs: 300_000, max: 5 })
      if (!rl.ok) return rl.response!

      const [memberRes, familyRes, subsRes, contribRes, claimsRes, notifRes, deletionRes] =
        await Promise.all([
          adminClient.from('members').select('*').eq('id', user.id).single(),
          adminClient.from('family_members').select('*').eq('member_id', user.id),
          adminClient.from('subscriptions').select('id, status, started_at, next_due_date, cancelled_at, package_id, created_at').eq('member_id', user.id),
          adminClient.from('contributions').select('id, period, amount, status, package_id, created_at, notes').eq('member_id', user.id),
          adminClient.from('claims').select('id, claim_number, claim_type, status, description, amount_requested, submitted_at, created_at, updated_at').eq('member_id', user.id),
          adminClient.from('notifications').select('id, subject, body, status, created_at').eq('member_id', user.id).order('created_at', { ascending: false }).limit(200),
          adminClient.from('data_deletion_requests').select('id, status, reason, created_at, processed_at').eq('member_id', user.id),
        ])

      if (memberRes.error || !memberRes.data) {
        return new Response(JSON.stringify({ message: 'Profile not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const claimIds = (claimsRes.data ?? []).map((c: { id: string }) => c.id)
      let claimDocuments: unknown[] = []
      if (claimIds.length > 0) {
        const { data: docs } = await adminClient
          .from('claim_documents')
          .select('id, claim_id, document_type, file_name, file_type, size_bytes, created_at, uploaded_at')
          .in('claim_id', claimIds)
        claimDocuments = docs ?? []
      }

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'exported_personal_data',
        resource: 'member',
        resource_id: user.id,
      })

      const payload = {
        exported_at: new Date().toISOString(),
        notice: 'This export reflects data held in Luma Welfare application tables. Auth credentials are never included. Claim file contents are listed by metadata only — download evidence from Claims while signed in.',
        member: memberRes.data,
        family_members: familyRes.data ?? [],
        subscriptions: subsRes.data ?? [],
        contributions: contribRes.data ?? [],
        claims: claimsRes.data ?? [],
        claim_documents: claimDocuments,
        notifications: notifRes.data ?? [],
        deletion_requests: deletionRes.data ?? [],
      }

      return new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="luma-welfare-my-data.json"',
        },
      })
    }

    // GET — latest deletion request
    if (req.method === 'GET' && action === 'deletion-request') {
      const { data, error } = await adminClient
        .from('data_deletion_requests')
        .select('id, status, reason, created_at, processed_at, admin_notes')
        .eq('member_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ request: data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST — accept current Privacy/Terms versions (re-consent)
    if (req.method === 'POST' && action === 'accept-legal') {
      const rl = await rateLimitAsync(req, 'member-accept-legal', { userId: user.id, adminClient, windowMs: 300_000, max: 10 })
      if (!rl.ok) return rl.response!

      let body: Record<string, unknown>
      try {
        body = await req.json()
      } catch {
        return new Response(JSON.stringify({ message: 'Invalid JSON body.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (body.acceptedPrivacy !== true || body.acceptedTerms !== true) {
        return new Response(JSON.stringify({ message: 'You must accept both documents.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (body.privacyPolicyVersion !== PRIVACY_POLICY_VERSION || body.termsVersion !== TERMS_VERSION) {
        return new Response(JSON.stringify({
          message: 'Please refresh and accept the current Privacy Policy and Terms.',
          code: 'LEGAL_VERSION_MISMATCH',
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const consentAt = new Date().toISOString()
      const { error: updErr } = await adminClient.from('members').update({
        privacy_accepted_at: consentAt,
        terms_accepted_at: consentAt,
        privacy_policy_version: PRIVACY_POLICY_VERSION,
        terms_version: TERMS_VERSION,
      }).eq('id', user.id)

      if (updErr) {
        return new Response(JSON.stringify({ message: 'Could not save acceptance.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await adminClient.from('member_legal_acceptances').insert([
        {
          member_id: user.id,
          document_type: 'privacy',
          document_version: PRIVACY_POLICY_VERSION,
          accepted_at: consentAt,
          source: 'reconsent',
        },
        {
          member_id: user.id,
          document_type: 'terms',
          document_version: TERMS_VERSION,
          accepted_at: consentAt,
          source: 'reconsent',
        },
      ])

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'accepted_legal_documents',
        resource: 'member',
        resource_id: user.id,
        meta: { privacy: PRIVACY_POLICY_VERSION, terms: TERMS_VERSION },
      })

      return new Response(JSON.stringify({
        ok: true,
        privacy_policy_version: PRIVACY_POLICY_VERSION,
        terms_version: TERMS_VERSION,
        accepted_at: consentAt,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST — deletion request
    if (req.method === 'POST' && action === 'deletion-request') {
      const rl = await rateLimitAsync(req, 'member-deletion-request', { userId: user.id, adminClient, windowMs: 3_600_000, max: 3 })
      if (!rl.ok) return rl.response!

      let reason: string | null = null
      try {
        const body = await req.json()
        if (typeof body?.reason === 'string') reason = body.reason.trim().slice(0, 500) || null
      } catch {
        /* empty body is ok */
      }

      const { data: open } = await adminClient
        .from('data_deletion_requests')
        .select('id, status')
        .eq('member_id', user.id)
        .in('status', ['pending', 'in_progress'])
        .limit(1)
        .maybeSingle()

      if (open) {
        return new Response(JSON.stringify({
          message: 'You already have an open deletion request.',
          code: 'DELETION_PENDING',
          request: open,
        }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { data, error } = await adminClient
        .from('data_deletion_requests')
        .insert({ member_id: user.id, reason, status: 'pending' })
        .select('id, status, reason, created_at')
        .single()
      if (error) throw new Error(error.message)

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'requested_data_deletion',
        resource: 'data_deletion_request',
        resource_id: data.id,
      })

      return new Response(JSON.stringify({
        request: data,
        message: 'Deletion request submitted. An administrator will review it. Financial and legal records may be retained as required.',
      }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST — upload avatar
    if (req.method === 'POST' && action === 'avatar') {
      const body = await req.json()
      const { fileName, fileData } = body

      if (!fileName || !fileData) {
        return new Response(JSON.stringify({ message: 'fileName and fileData (base64) are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Validate file size (< 5MB)
      const decodedSize = Math.ceil((fileData.length * 3) / 4)
      if (decodedSize > 5 * 1024 * 1024) {
        return new Response(JSON.stringify({ message: 'File size must be under 5MB' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let bytes: Uint8Array
      try {
        const binaryStr = atob(fileData)
        bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }
      } catch {
        return new Response(JSON.stringify({ message: 'Invalid file data encoding' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (looksLikeScriptableMarkup(bytes)) {
        return new Response(JSON.stringify({ message: 'This file type is not allowed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const detected = detectAllowedImage(bytes)
      if (!detected) {
        return new Response(JSON.stringify({ message: 'Only JPG, PNG, and WebP images are allowed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const storagePath = `${user.id}/avatar.${detected.ext}`

      // Delete old avatar if exists
      try {
        const { data: existingFiles } = await adminClient.storage
          .from('avatars')
          .list(user.id)
        if (existingFiles && existingFiles.length > 0) {
          const paths = existingFiles.map((f: { name: string }) => `${user.id}/${f.name}`)
          await adminClient.storage.from('avatars').remove(paths)
        }
      } catch { /* best effort cleanup */ }

      // Upload to Supabase Storage
      const { error: uploadErr } = await adminClient.storage
        .from('avatars')
        .upload(storagePath, bytes, {
          contentType: detected.mime,
          upsert: true,
        })

      if (uploadErr) {
        throw new Error(`Storage upload failed: ${uploadErr.message}`)
      }

      // Get public URL
      const { data: urlData } = adminClient.storage
        .from('avatars')
        .getPublicUrl(storagePath)

      const avatarUrl = urlData.publicUrl

      // Update member profile with photo_url
      const { error: updateErr } = await adminClient
        .from('members')
        .update({ photo_url: avatarUrl })
        .eq('id', user.id)

      if (updateErr) throw new Error(updateErr.message)

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'avatar_updated',
        resource: 'member',
        resource_id: user.id,
        meta: { avatar_url: avatarUrl },
      })

      return new Response(JSON.stringify({ photo_url: avatarUrl }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST — change password
    if (req.method === 'POST' && action === 'password') {
      const body = await req.json()
      const { currentPassword, newPassword } = body

      if (!currentPassword || !newPassword) {
        return new Response(JSON.stringify({ message: 'Current password and new password are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (newPassword.length < 8) {
        return new Response(JSON.stringify({ message: 'New password must be at least 8 characters.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return new Response(JSON.stringify({ message: 'New password must contain at least one letter and one number.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (currentPassword === newPassword) {
        return new Response(JSON.stringify({ message: 'New password must be different from current password.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Verify current password by attempting sign-in
      const userClient = createUserClient(req)
      const { data: member } = await adminClient
        .from('members')
        .select('email')
        .eq('id', user.id)
        .single()

      if (!member?.email) {
        return new Response(JSON.stringify({ message: 'Account not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Verify current password
      const { error: verifyErr } = await userClient.auth.signInWithPassword({
        email: member.email,
        password: currentPassword,
      })

      if (verifyErr) {
        return new Response(JSON.stringify({ message: 'Current password is incorrect.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Update password
      const { error: updateErr } = await userClient.auth.updateUser({ password: newPassword })
      if (updateErr) {
        throw new Error(updateErr.message)
      }

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'password_changed',
        resource: 'member',
        resource_id: user.id,
      })

      // Send password change confirmation email (non-blocking)
      const confirmHtml = buildEmailTemplate(
        'Password Changed Successfully',
        `Hello,\n\nYour Luma Welfare account password has been changed successfully.\n\nIf you did NOT make this change, please contact support immediately at info@lumawelfare.or.ke or call 0798 635 024.\n\nFor your security:\n• Do not share your password with anyone\n• Use a unique password for your Luma Welfare account\n• Enable two-factor authentication if available\n\nBest regards,\nLuma Welfare Team`,
        'Contact Support',
        'https://luma-welfare.vercel.app/contact',
      )
      sendEmail(member.email, 'Password Changed — Luma Welfare', confirmHtml).catch((e) => {
        console.error('Password change email failed:', e instanceof Error ? e.message : e)
      })

      return new Response(JSON.stringify({ message: 'Password changed successfully.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH — update profile fields
    if (req.method === 'PATCH') {
      let raw: unknown
      try {
        raw = await req.json()
      } catch {
        return new Response(JSON.stringify({ message: 'Invalid JSON body.', code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let patch
      try {
        patch = parseMemberProfilePatchBody(raw)
      } catch (e) {
        const message = e instanceof ValidationError ? e.message : 'Invalid profile data.'
        return new Response(JSON.stringify({ message, code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: taken } = await adminClient
        .from('members')
        .select('id')
        .eq('id_number', patch.idNumber)
        .neq('id', user.id)
        .maybeSingle()
      if (taken) {
        return new Response(JSON.stringify({
          message: 'That ID number is already registered to another member.',
          code: 'ID_NUMBER_TAKEN',
        }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await adminClient
        .from('members').update({
          full_name: patch.fullName,
          id_number: patch.idNumber,
          phone: patch.phone,
          alt_phone: patch.altPhone,
          date_of_birth: patch.dateOfBirth,
          county: patch.county,
          location: patch.location,
          occupation: patch.occupation,
          photo_url: patch.photoUrl || undefined,
          kra_pin: patch.kraPin === undefined ? undefined : patch.kraPin,
        }).eq('id', user.id).select().single()
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return new Response(JSON.stringify({
            message: 'That ID number is already registered to another member.',
            code: 'ID_NUMBER_TAKEN',
          }), {
            status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        throw new Error(error.message)
      }

      await logAudit(adminClient, { actor_id: user.id, action: 'updated_profile', resource: 'member', resource_id: user.id })
      const { kra_pin: kraRaw, ...memberRest } = (data ?? {}) as Record<string, unknown>
      return new Response(JSON.stringify({
        member: {
          ...memberRest,
          kra_pin_masked: maskIdNumberLast4(typeof kraRaw === 'string' ? kraRaw : null),
        },
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    if (err instanceof ValidationError) {
      return new Response(JSON.stringify({ message: err.message, code: 'VALIDATION' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return handleUnexpectedError(err, 'member-profile')
  }
}))
