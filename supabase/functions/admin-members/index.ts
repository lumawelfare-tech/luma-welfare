import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, adminSessionDeniedResponse, requirePermission, handleAdminError, logAudit } from '../shared/supabase.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import { sanitizeSearch } from '../shared/search.ts'
import { prepareMemberListRow, maskIdNumberLast4 } from '../shared/pii.ts'
import { parseImportMemberRow, parseUuid, ValidationError } from '../shared/validate.ts'
import { sendNotification } from '../shared/notifications.ts'
import { MEMBER_DOC_BUCKET, signPrivateStorageUrl, PRIVATE_SIGNED_URL_TTL_SECONDS } from '../shared/storage-signed.ts'
import {
  loadRegistrationFeeConfig,
  RegistrationFeeConfigError,
} from '../shared/registration-fee.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const loaded = await loadAdminSession(adminClient, user.id, { req })
    if (loaded.status !== 'ok') {
      return adminSessionDeniedResponse(loaded)
    }
    const session = loaded.session

    if (req.method !== 'GET') {
      const rl = await rateLimitAsync(req, 'admin-members-mutation', { userId: session.id, adminClient })
      if (!rl.ok) return rl.response!
    }

    const url = new URL(req.url)
    const resourceId = url.searchParams.get('resource_id')
    const action = url.searchParams.get('action')

    // GET /admin-members — list members with optimized search
    if (req.method === 'GET' && !resourceId) {
      requirePermission(session, 'members', 'read')
      const status = url.searchParams.get('status')
      const q = sanitizeSearch(url.searchParams.get('q')) || null
      const page = parseInt(url.searchParams.get('page') || '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '50'), 200)

      // Use RPC for server-side indexed search with pagination
      const { data, error } = await adminClient.rpc('admin_search_members', {
        p_q: q || null,
        p_status: status || null,
        p_page: page,
        p_per_page: perPage,
      })

      if (error) throw new Error(error.message)

      const result = data?.[0] ?? { members: [], total: 0, page, per_page: perPage, pages: 1 }
      const maskedMembers = ((result.members ?? []) as Record<string, unknown>[]).map((m) =>
        prepareMemberListRow(m),
      )
      return new Response(JSON.stringify({
        members: maskedMembers,
        total: Number(result.total) ?? 0,
        page: result.page ?? page,
        per_page: result.per_page ?? perPage,
        pages: result.pages ?? 1,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET /admin-members?resource_id=xxx — get member detail
    if (req.method === 'GET' && resourceId) {
      requirePermission(session, 'members', 'read')
      const { data: member, error } = await adminClient
        .from('members')
        .select('*')
        .eq('id', resourceId)
        .single()
      if (error) throw new Error('Member not found')

      const [subs, family, contribs, fees, docs] = await Promise.all([
        adminClient.from('subscriptions').select('id, status, started_at, next_due_date, package_id, packages(code, name), package_tiers(name, amount)').eq('member_id', resourceId),
        adminClient.from('family_members').select('*').eq('member_id', resourceId).eq('is_active', true),
        adminClient.from('contributions').select('id, period, amount, amount_paid, status, package_id, created_at').eq('member_id', resourceId).order('period', { ascending: false }),
        adminClient.from('registration_fees').select('id, amount, status, paid_at, payment_reference, created_at').eq('member_id', resourceId).order('created_at', { ascending: false }).limit(5),
        adminClient.from('member_documents').select('id, document_type, family_member_id, original_filename, verification_status, rejection_reason, is_current, created_at, expires_at, size_bytes').eq('member_id', resourceId).eq('is_current', true).order('created_at', { ascending: false }),
      ])

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'viewed_member_detail',
        resource: 'member',
        resource_id: resourceId,
      })

      const { kra_pin: kraRaw, id_number: idRaw, ...memberRest } = member as Record<string, unknown>
      const familySafe = (family.data ?? []).map((row: Record<string, unknown>) => {
        const famId = typeof row.id_number === 'string' ? row.id_number : null
        const { id_number: _omit, ...rest } = row
        return { ...rest, id_number_masked: maskIdNumberLast4(famId) }
      })
      return new Response(JSON.stringify({
        member: {
          ...memberRest,
          id_number_masked: maskIdNumberLast4(typeof idRaw === 'string' ? idRaw : null),
          kra_pin_masked: maskIdNumberLast4(typeof kraRaw === 'string' ? kraRaw : null),
        },
        subscriptions: subs.data ?? [],
        family_members: familySafe,
        contributions: contribs.data ?? [],
        registration_fees: fees.data ?? [],
        identity_documents: docs.data ?? [],
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST' && action === 'view-identity-document') {
      requirePermission(session, 'documents', 'read')
      const body = await req.json()
      const docId = parseUuid(body.documentId ?? body.document_id, 'document')
      const { data: doc, error } = await adminClient
        .from('member_documents')
        .select('id, storage_path, member_id, document_type')
        .eq('id', docId)
        .maybeSingle()
      if (error || !doc) {
        return new Response(JSON.stringify({ message: 'Document not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const signed = await signPrivateStorageUrl(adminClient, MEMBER_DOC_BUCKET, doc.storage_path)
      if (!signed) {
        return new Response(JSON.stringify({ message: 'Could not create a download link.', code: 'INTERNAL' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'view_member_document',
        resource: 'member_document',
        resource_id: doc.id,
        meta: { member_id: doc.member_id, document_type: doc.document_type },
      })
      return new Response(JSON.stringify({
        file_url: signed,
        signed_url_expires_in: PRIVATE_SIGNED_URL_TTL_SECONDS,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST' && (action === 'verify-identity-document' || action === 'reject-identity-document')) {
      requirePermission(session, 'documents', 'verify')
      const body = await req.json()
      const docId = parseUuid(body.documentId ?? body.document_id, 'document')
      const reject = action === 'reject-identity-document'
      const reason = reject && typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
      if (reject && !reason) {
        return new Response(JSON.stringify({ message: 'A rejection reason is required.', code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: doc, error } = await adminClient
        .from('member_documents')
        .select('id, member_id, document_type, verification_status')
        .eq('id', docId)
        .maybeSingle()
      if (error || !doc) {
        return new Response(JSON.stringify({ message: 'Document not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: updated, error: updErr } = await adminClient
        .from('member_documents')
        .update({
          verification_status: reject ? 'rejected' : 'verified',
          verified_by: session.id,
          verified_at: new Date().toISOString(),
          rejection_reason: reject ? reason : null,
        })
        .eq('id', docId)
        .select('id, verification_status, rejection_reason')
        .single()
      if (updErr) throw new Error(updErr.message)
      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: reject ? 'member_document_rejected' : 'member_document_verified',
        resource: 'member_document',
        resource_id: doc.id,
        meta: { member_id: doc.member_id, document_type: doc.document_type },
      })
      await sendNotification(adminClient, {
        memberId: doc.member_id,
        subject: reject ? 'Document needs correction' : 'Document verified',
        body: reject
          ? `Your ${doc.document_type.replace(/_/g, ' ')} was rejected. Reason: ${reason}`
          : `Your ${doc.document_type.replace(/_/g, ' ')} has been verified.`,
        type: 'system',
        meta: { document_id: doc.id },
      })
      return new Response(JSON.stringify({ document: updated }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH /admin-members?resource_id=xxx — approve/suspend/close member
    if (req.method === 'PATCH' && resourceId) {
      requirePermission(session, 'members', 'approve')
      const body = await req.json()
      const { status: memberStatus } = body
      if (!['active', 'suspended', 'closed'].includes(memberStatus)) {
        return new Response(JSON.stringify({ message: 'Invalid status', code: 'VALIDATION' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: targetAdmin } = await adminClient
        .from('admins')
        .select('id')
        .eq('id', resourceId)
        .maybeSingle()
      if (targetAdmin) {
        return new Response(JSON.stringify({
          message: 'Cannot modify administrator accounts through member management',
          code: 'ADMIN_STATUS_BLOCKED',
        }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: existing, error: loadErr } = await adminClient
        .from('members')
        .select('id, anonymized_at')
        .eq('id', resourceId)
        .maybeSingle()
      if (loadErr || !existing) {
        return new Response(JSON.stringify({ message: 'Member not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (existing.anonymized_at) {
        return new Response(JSON.stringify({
          message: 'Anonymized members cannot be approved, suspended, or closed.',
          code: 'ANONYMIZED_IMMUTABLE',
        }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const now = new Date().toISOString()
      const updates: Record<string, unknown> = {
        status: memberStatus,
      }
      if (memberStatus === 'active') {
        updates.approved_at = now
        updates.approved_by = session.id
        updates.joined_at = now
        if (typeof body.adminRemarks === 'string') {
          updates.admin_remarks = body.adminRemarks.trim().slice(0, 2000) || null
        }
        const { data: current } = await adminClient
          .from('members')
          .select('membership_number, payment_verified_at')
          .eq('id', resourceId)
          .maybeSingle()
        const { data: fee } = await adminClient
          .from('registration_fees')
          .select('status')
          .eq('member_id', resourceId)
          .eq('fee_type', 'registration')
          .maybeSingle()
        const feePaid = fee?.status === 'paid' || Boolean(current?.payment_verified_at)
        if (!feePaid) {
          return new Response(JSON.stringify({
            message: 'Registration fee must be paid before the member can be activated.',
            code: 'FEE_REQUIRED',
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        if (fee?.status === 'paid' && !current?.payment_verified_at) {
          updates.payment_verified_at = now
        }
        if (!current?.membership_number) {
          const { data: memNum, error: memErr } = await adminClient.rpc('generate_membership_number')
          if (memErr || !memNum) {
            return new Response(JSON.stringify({
              message: 'Could not assign membership number.',
              code: 'MEMBERSHIP_NUMBER',
            }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
          }
          updates.membership_number = typeof memNum === 'string' ? memNum : String(memNum)
        }
      }
      if (memberStatus === 'closed' && body.rejectApplication === true) {
        updates.rejected_at = now
        if (typeof body.adminRemarks === 'string') {
          updates.admin_remarks = body.adminRemarks.trim().slice(0, 2000) || null
        }
      }

      const { data, error } = await adminClient
        .from('members')
        .update(updates)
        .eq('id', resourceId)
        .select()
        .single()
      if (error) throw new Error('Member not found')

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: memberStatus === 'active'
          ? 'application_approved'
          : memberStatus === 'closed' && body.rejectApplication
            ? 'application_rejected'
            : `member_${memberStatus}`,
        resource: 'member',
        resource_id: resourceId,
        meta: {
          by: session.display_name,
          membership_number: data.membership_number ?? null,
          application_number: data.application_number ?? null,
        },
      })

      return new Response(JSON.stringify({ member: data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DELETE /admin-members?resource_id=xxx — soft-delete (deactivate) member
    if (req.method === 'DELETE' && resourceId) {
      requirePermission(session, 'members', 'delete')

      if (resourceId === user.id) {
        return new Response(JSON.stringify({ message: 'Administrators cannot delete their own account', code: 'SELF_DELETE_BLOCKED' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: targetAdmin } = await adminClient
        .from('admins')
        .select('id, display_name')
        .eq('id', resourceId)
        .maybeSingle()
      if (targetAdmin) {
        return new Response(JSON.stringify({ message: 'Cannot delete an administrator account through member management', code: 'ADMIN_DELETE_BLOCKED' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: member, error } = await adminClient
        .from('members')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('id', resourceId)
        .select('id, full_name, email')
        .maybeSingle()
      if (error) {
        throw new Error('Update failed: ' + error.message);
      }
      if (!member) {
        throw new Error('Member not found: Record does not exist or is already closed.');
      }

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'member.deleted',
        resource: 'member',
        resource_id: resourceId,
        meta: { member_name: member.full_name, by: session.display_name },
      })

      return new Response(JSON.stringify({ message: 'Member deactivated', member }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST /admin-members?action=batch — batch status update for multiple members
    if (req.method === 'POST' && (action === 'batch' || resourceId === 'batch')) {
      requirePermission(session, 'members', 'approve')
      const body = await req.json()
      const { ids, status: memberStatus } = body

      if (!Array.isArray(ids) || ids.length === 0) {
        return new Response(JSON.stringify({ message: 'No member IDs provided.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (ids.length > 100) {
        return new Response(JSON.stringify({ message: 'Maximum 100 members per batch.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!['active', 'suspended', 'closed'].includes(memberStatus)) {
        return new Response(JSON.stringify({ message: 'Invalid status' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Deduplicate IDs
      const uniqueIds = [...new Set(ids)]
      const results: { id: string; success: boolean; error?: string }[] = []
      const now = new Date().toISOString()

      for (const id of uniqueIds) {
        // Prevent self-deletion
        if (id === user.id) {
          results.push({ id, success: false, error: 'Cannot modify your own account.' })
          continue
        }

        // Prevent modifying other admins
        const { data: targetAdmin } = await adminClient
          .from('admins').select('id').eq('id', id).maybeSingle()
        if (targetAdmin) {
          results.push({ id, success: false, error: 'Cannot modify administrator accounts.' })
          continue
        }

        const { data: targetMember } = await adminClient
          .from('members')
          .select('anonymized_at')
          .eq('id', id)
          .maybeSingle()
        if (targetMember?.anonymized_at) {
          results.push({ id, success: false, error: 'Anonymized member cannot be updated.' })
          continue
        }

        try {
          const { error } = await adminClient
            .from('members')
            .update({
              status: memberStatus,
              approved_at: memberStatus === 'active' ? now : undefined,
              approved_by: memberStatus === 'active' ? session.id : undefined,
              updated_at: now,
            })
            .eq('id', id)
          if (error) throw error
          results.push({ id, success: true })
        } catch {
          results.push({ id, success: false, error: 'Update failed.' })
        }
      }

      const successCount = results.filter(r => r.success).length
      const errorCount = results.filter(r => !r.success).length

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: `members_batch_${memberStatus}`,
        resource: 'member',
        meta: { total: uniqueIds.length, success: successCount, errors: errorCount, status: memberStatus },
      })

      return new Response(JSON.stringify({ results, summary: { total: uniqueIds.length, success: successCount, errors: errorCount } }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST /admin-members?action=export — server-side export all matching members
    if (req.method === 'POST' && (action === 'export' || resourceId === 'export')) {
      requirePermission(session, 'members', 'read')
      const body = await req.json()
      const { status: exportStatus, q: exportQuery } = body

      // Use the same RPC search but get ALL results (up to 5000)
      const { data, error } = await adminClient.rpc('admin_search_members', {
        p_q: exportQuery || null,
        p_status: exportStatus || null,
        p_page: 1,
        p_per_page: 5000,
      })
      if (error) throw new Error(error.message)

      const result = data?.[0] ?? { members: [] }
      const members = ((result.members ?? []) as Record<string, unknown>[]).map((m) =>
        prepareMemberListRow(m),
      )

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'members_export',
        resource: 'member',
        meta: { count: members.length, filters: { status: exportStatus, q: exportQuery } },
      })

      return new Response(JSON.stringify({ members, total: members.length }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST /admin-members?action=import — bulk import members from CSV
    if (req.method === 'POST' && (action === 'import' || resourceId === 'import')) {
      requirePermission(session, 'members', 'create')
      const body = await req.json()
      const { members: importMembers } = body

      if (!Array.isArray(importMembers) || importMembers.length === 0) {
        return new Response(JSON.stringify({ message: 'No members to import.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (importMembers.length > 100) {
        return new Response(JSON.stringify({ message: 'Maximum 100 members per import.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let importRegistrationFee: { amount: number; currency: 'KES' }
      try {
        importRegistrationFee = await loadRegistrationFeeConfig(adminClient)
      } catch (e) {
        const message = e instanceof RegistrationFeeConfigError
          ? 'Registration fee is not configured. Cannot import members.'
          : 'Could not load registration fee configuration.'
        return new Response(JSON.stringify({ message, code: 'REGISTRATION_FEE_CONFIG' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const results: Array<{ row: number; email: string; status: 'success' | 'error'; message: string; member_id?: string }> = []

      for (let i = 0; i < importMembers.length; i++) {
        const rowNum = i + 2
        let email = ''
        let fullName = ''
        let phone = ''
        let idNumber: string | null = null

        try {
          const parsed = parseImportMemberRow(importMembers[i], `Row ${rowNum}`)
          email = parsed.email
          fullName = parsed.fullName
          phone = parsed.phone
          idNumber = parsed.idNumber
        } catch (e) {
          const msg = e instanceof ValidationError ? e.message : 'Invalid row.'
          results.push({ row: rowNum, email, status: 'error', message: msg })
          continue
        }

        const { data: existing } = await adminClient
          .from('members')
          .select('id, email')
          .eq('email', email)
          .maybeSingle()

        if (existing) {
          results.push({ row: rowNum, email, status: 'error', message: 'Member with this email already exists.' })
          continue
        }

        const { data: phoneClash } = await adminClient
          .from('members')
          .select('id')
          .eq('phone', phone)
          .maybeSingle()

        if (phoneClash) {
          results.push({ row: rowNum, email, status: 'error', message: 'Phone number is already registered.' })
          continue
        }

        const tempPassword = `Luma${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}!Aa1`

        try {
          const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: false,
            user_metadata: { full_name: fullName },
          })

          if (authErr || !authUser?.user) {
            results.push({
              row: rowNum,
              email,
              status: 'error',
              message: 'Could not create login account for this email.',
            })
            continue
          }

          const { error: memberErr } = await adminClient
            .from('members')
            .insert({
              id: authUser.user.id,
              email,
              full_name: fullName,
              phone,
              id_number: idNumber,
              status: 'pending_approval',
              joined_at: new Date().toISOString(),
            })

          if (memberErr) {
            await adminClient.auth.admin.deleteUser(authUser.user.id)
            const dbCode = (memberErr as { code?: string }).code
            if (dbCode === '23505') {
              results.push({
                row: rowNum,
                email,
                status: 'error',
                message: 'That ID number, phone, or email is already registered.',
              })
            } else {
              results.push({ row: rowNum, email, status: 'error', message: 'Could not create membership.' })
            }
            continue
          }

          await adminClient
            .from('registration_fees')
            .insert({
              member_id: authUser.user.id,
              fee_type: 'registration',
              amount: importRegistrationFee.amount,
              currency: importRegistrationFee.currency,
              status: 'unpaid',
            })

          results.push({
            row: rowNum,
            email,
            status: 'success',
            message: 'Member created as pending (email verification required).',
            member_id: authUser.user.id,
          })
        } catch {
          results.push({ row: rowNum, email, status: 'error', message: 'Could not import this row.' })
        }
      }

      const successCount = results.filter(r => r.status === 'success').length
      const errorCount = results.filter(r => r.status === 'error').length

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'members_bulk_import',
        resource: 'member',
        meta: { total: importMembers.length, success: successCount, errors: errorCount },
      })

      return new Response(JSON.stringify({
        message: `Import complete: ${successCount} created, ${errorCount} failed.`,
        results,
        summary: { total: importMembers.length, success: successCount, errors: errorCount },
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return handleAdminError(err, 'admin-members')
  }
})
