import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, adminSessionDeniedResponse, requirePermission, handleAdminError, logAudit } from '../shared/supabase.ts'
import { sendNotification } from '../shared/notifications.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import { sanitizeSearch } from '../shared/search.ts'
import { withSignedClaimDocumentUrls } from '../shared/storage-signed.ts'
import { parseOptionalMoneyAmount, parseRequiredMoneyAmount, ValidationError } from '../shared/validate.ts'

/** Claim review checklist complete when all three ops stages are true and named officers recorded. */
function checklistComplete(c: {
  checklist_docs_ok?: boolean | null
  checklist_membership_ok?: boolean | null
  checklist_contributions_ok?: boolean | null
  eligibility_verified_by?: string | null
  contributions_verified_by?: string | null
}): boolean {
  return Boolean(
    c.checklist_docs_ok &&
      c.checklist_membership_ok &&
      c.checklist_contributions_ok &&
      typeof c.eligibility_verified_by === 'string' &&
      c.eligibility_verified_by.trim() &&
      typeof c.contributions_verified_by === 'string' &&
      c.contributions_verified_by.trim(),
  )
}

function sanitizeOfficerName(raw: unknown, fallback: string): string {
  const fromBody = typeof raw === 'string' ? raw.trim() : ''
  const name = (fromBody || fallback).trim().slice(0, 120)
  return name
}

function sanitizeText(input: unknown, max: number): string {
  if (typeof input !== 'string') return ''
  return input.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const loaded = await loadAdminSession(adminClient, user.id, { req })
    if (loaded.status !== 'ok') {
      return adminSessionDeniedResponse(loaded)
    }
    const session = loaded.session

    if (req.method !== 'GET') {
      const rl = await rateLimitAsync(req, 'admin-claims-mutation', { userId: session.id, adminClient })
      if (!rl.ok) return rl.response!
    }

    const url = new URL(req.url)
    const resourceId = url.searchParams.get('resource_id')
    const claimId = resourceId
    const batchAction = url.searchParams.get('action')

    // GET /admin-claims — list with search + pagination
    if (req.method === 'GET' && !claimId) {
      requirePermission(session, 'claims', 'read')
      const status = url.searchParams.get('status')
      const q = sanitizeSearch(url.searchParams.get('q')) || null
      const page = parseInt(url.searchParams.get('page') || '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '50'), 200)

      const { data, error } = await adminClient.rpc('admin_search_claims', {
        p_q: q || null,
        p_status: status || null,
        p_page: page,
        p_per_page: perPage,
      })

      if (error) throw new Error(error.message)

      const result = data?.[0] ?? { claims: [], total: 0, page, per_page: perPage, pages: 1 }
      return new Response(JSON.stringify({
        claims: result.claims ?? [],
        total: Number(result.total) ?? 0,
        page: result.page ?? page,
        per_page: result.per_page ?? perPage,
        pages: result.pages ?? 1,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // GET /admin-claims?resource_id=xxx — claim detail
    if (req.method === 'GET' && claimId) {
      requirePermission(session, 'claims', 'read')
      const { data: claim, error } = await adminClient.from('claims').select('*').eq('id', claimId).single()
      if (error) throw new Error('Claim not found')
      const { data: documents } = await adminClient.from('claim_documents').select('*').eq('claim_id', claim.id)
      const signedDocs = await withSignedClaimDocumentUrls(adminClient, documents ?? [])
      const { data: payouts } = await adminClient
        .from('payouts')
        .select('id, amount, method, status, reference, processed_at, notes, created_at')
        .eq('claim_id', claim.id)
        .order('created_at', { ascending: false })
      return new Response(JSON.stringify({ claim, documents: signedDocs, payouts: payouts ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST /admin-claims?action=batch — batch reject claims
    if (req.method === 'POST' && (batchAction === 'batch' || resourceId === 'batch')) {
      requirePermission(session, 'claims', 'approve')
      const body = await req.json()
      const { ids, decision, adminNotes } = body

      if (!Array.isArray(ids) || ids.length === 0) {
        return new Response(JSON.stringify({ message: 'No claim IDs provided.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (ids.length > 100) {
        return new Response(JSON.stringify({ message: 'Maximum 100 claims per batch.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Batch approve requires per-claim checklist — only allow reject / request-info in batch
      if (decision === 'approve') {
        return new Response(JSON.stringify({
          message: 'Batch approve is disabled. Complete the review checklist and approve each claim individually.',
          code: 'BATCH_APPROVE_DISABLED',
        }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const statusMap: Record<string, string> = { reject: 'Rejected', 'request-info': 'Additional Information Required' }
      if (!statusMap[decision]) {
        return new Response(JSON.stringify({ message: 'Invalid decision' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const uniqueIds = [...new Set(ids)]
      const results: { id: string; success: boolean; error?: string }[] = []

      for (const id of uniqueIds) {
        try {
          const updates: Record<string, unknown> = {
            status: statusMap[decision],
            admin_notes: adminNotes || null,
            reviewed_at: new Date().toISOString(),
          }
          if (decision === 'reject') {
            updates.decided_at = new Date().toISOString()
            updates.decided_by = session.id
          }
          const { error } = await adminClient.from('claims').update(updates).eq('id', id)
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
        action: `claims_batch_${decision}`,
        resource: 'claim',
        meta: { total: uniqueIds.length, success: successCount, errors: errorCount, decision },
      })

      return new Response(JSON.stringify({ results, summary: { total: uniqueIds.length, success: successCount, errors: errorCount } }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST /admin-claims?action=export — server-side export all matching claims
    if (req.method === 'POST' && (batchAction === 'export' || resourceId === 'export')) {
      requirePermission(session, 'claims', 'read')
      const body = await req.json().catch(() => ({}))
      const { status: exportStatus, q: exportQuery } = body

      const { data, error } = await adminClient.rpc('admin_search_claims', {
        p_q: exportQuery || null,
        p_status: exportStatus || null,
        p_page: 1,
        p_per_page: 5000,
      })
      if (error) throw new Error(error.message)

      const result = data?.[0] ?? { claims: [] }
      const claims = result.claims ?? []

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'claims_export',
        resource: 'claim',
        meta: { count: claims.length },
      })

      return new Response(JSON.stringify({ claims, total: claims.length }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH /admin-claims?resource_id=xxx — checklist | record-payout | approve/reject/request-info
    if (req.method === 'PATCH' && claimId) {
      const body = await req.json()
      const action = typeof body.action === 'string' ? body.action : null

      // --- Checklist update ---
      if (action === 'checklist') {
        requirePermission(session, 'claims', 'approve')
        const { data: existing, error: loadErr } = await adminClient
          .from('claims')
          .select('id, status, checklist_docs_ok, checklist_membership_ok, checklist_contributions_ok, eligibility_verified_by, contributions_verified_by')
          .eq('id', claimId)
          .maybeSingle()
        if (loadErr) throw new Error(loadErr.message)
        if (!existing) {
          return new Response(JSON.stringify({ message: 'Claim not found', code: 'NOT_FOUND' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (!['Submitted', 'Under Review', 'Additional Information Required'].includes(existing.status)) {
          return new Response(JSON.stringify({
            message: 'Checklist can only be updated while the claim is under review.',
            code: 'VALIDATION',
          }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const docsOk = typeof body.checklistDocsOk === 'boolean' ? body.checklistDocsOk : existing.checklist_docs_ok
        const membershipOk = typeof body.checklistMembershipOk === 'boolean' ? body.checklistMembershipOk : existing.checklist_membership_ok
        const contributionsOk = typeof body.checklistContributionsOk === 'boolean' ? body.checklistContributionsOk : existing.checklist_contributions_ok

        const eligibilityVerifiedBy = membershipOk
          ? sanitizeOfficerName(
            body.eligibilityVerifiedBy ?? existing.eligibility_verified_by,
            session.display_name,
          )
          : null
        const contributionsVerifiedBy = contributionsOk
          ? sanitizeOfficerName(
            body.contributionsVerifiedBy ?? existing.contributions_verified_by,
            session.display_name,
          )
          : null

        if (membershipOk && !eligibilityVerifiedBy) {
          return new Response(JSON.stringify({
            message: 'Eligibility verified by (officer name) is required when membership is checked.',
            code: 'VALIDATION',
          }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (contributionsOk && !contributionsVerifiedBy) {
          return new Response(JSON.stringify({
            message: 'Contribution status verified by (officer name) is required when contributions are checked.',
            code: 'VALIDATION',
          }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const complete = checklistComplete({
          checklist_docs_ok: docsOk,
          checklist_membership_ok: membershipOk,
          checklist_contributions_ok: contributionsOk,
          eligibility_verified_by: eligibilityVerifiedBy,
          contributions_verified_by: contributionsVerifiedBy,
        })
        const now = new Date().toISOString()
        const updates: Record<string, unknown> = {
          checklist_docs_ok: docsOk,
          checklist_membership_ok: membershipOk,
          checklist_contributions_ok: contributionsOk,
          eligibility_verified_by: eligibilityVerifiedBy,
          contributions_verified_by: contributionsVerifiedBy,
          checklist_updated_by: session.id,
          checklist_completed_at: complete ? now : null,
          reviewed_at: now,
        }
        // Move Submitted → Under Review when review starts
        if (existing.status === 'Submitted' && (docsOk || membershipOk || contributionsOk)) {
          updates.status = 'Under Review'
        }

        const { data, error } = await adminClient
          .from('claims')
          .update(updates)
          .eq('id', claimId)
          .select('*')
          .single()
        if (error) throw new Error(error.message)

        await logAudit(adminClient, {
          actor_id: session.id,
          actor_role: session.role_name,
          action: 'claim_checklist_updated',
          resource: 'claim',
          resource_id: claimId,
          meta: {
            docsOk,
            membershipOk,
            contributionsOk,
            complete,
            eligibilityVerifiedBy,
            contributionsVerifiedBy,
          },
        })

        return new Response(JSON.stringify({ claim: data }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // --- Record manual payout (no M-Pesa) ---
      if (action === 'record-payout') {
        // Completing claim payout is part of claims approve workflow (manual only; no M-Pesa).
        requirePermission(session, 'claims', 'approve')
        const { data: existing, error: loadErr } = await adminClient
          .from('claims')
          .select('id, status, claim_number, member_id, package_id, approved_amount, amount_requested')
          .eq('id', claimId)
          .maybeSingle()
        if (loadErr) throw new Error(loadErr.message)
        if (!existing) {
          return new Response(JSON.stringify({ message: 'Claim not found', code: 'NOT_FOUND' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (existing.status !== 'Approved') {
          return new Response(JSON.stringify({
            message: 'Only approved claims can record a payout.',
            code: 'VALIDATION',
          }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const { data: existingPayout } = await adminClient
          .from('payouts')
          .select('id')
          .eq('claim_id', claimId)
          .in('status', ['Pending', 'Processing', 'Completed'])
          .maybeSingle()
        if (existingPayout) {
          return new Response(JSON.stringify({
            message: 'A payout already exists for this claim.',
            code: 'CONFLICT',
          }), {
            status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const amountRaw = body.amount != null && body.amount !== ''
          ? parseRequiredMoneyAmount(body.amount, 'payout amount')
          : parseRequiredMoneyAmount(existing.approved_amount ?? existing.amount_requested, 'payout amount')
        const reference = sanitizeText(body.reference, 120) || null
        const notes = sanitizeText(body.notes, 2000) || null
        const method = sanitizeText(body.method, 40) || 'manual'
        // Never allow mpesa/stk as method while payments are gated
        const safeMethod = method.toLowerCase() === 'mpesa' ? 'manual' : method
        const now = new Date().toISOString()

        const { data: payout, error: payoutErr } = await adminClient
          .from('payouts')
          .insert({
            claim_id: claimId,
            member_id: existing.member_id,
            package_id: existing.package_id,
            amount: amountRaw,
            method: safeMethod,
            status: 'Completed',
            reference,
            notes,
            processed_at: now,
            processed_by: session.id,
          })
          .select('id, amount, method, status, reference, processed_at')
          .single()
        if (payoutErr) throw new Error(payoutErr.message)

        const { data: claim, error: claimErr } = await adminClient
          .from('claims')
          .update({ status: 'Paid', paid_at: now, reviewed_at: now })
          .eq('id', claimId)
          .select('*')
          .single()
        if (claimErr) throw new Error(claimErr.message)

        await logAudit(adminClient, {
          actor_id: session.id,
          actor_role: session.role_name,
          action: 'claim_payout_recorded',
          resource: 'claim',
          resource_id: claimId,
          meta: { payout_id: payout.id, amount: amountRaw, method: safeMethod },
        })

        await sendNotification(adminClient, {
          memberId: existing.member_id,
          subject: 'Claim payout recorded',
          body: `Your claim ${existing.claim_number ?? claimId} payout of KSh ${amountRaw.toLocaleString('en-KE')} has been recorded${reference ? ` (ref: ${reference})` : ''}.`,
          type: 'system',
          meta: { claim_id: claimId, payout_id: payout.id },
          emailButtonText: 'View claims',
          emailButtonUrl: 'https://luma-welfare.vercel.app/claims',
        })

        return new Response(JSON.stringify({ claim, payout }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // --- Decision: approve / reject / request-info ---
      requirePermission(session, 'claims', 'approve')
      const { decision, adminNotes, amount: amountRaw } = body
      const amount = parseOptionalMoneyAmount(amountRaw, 'approved amount')
      const statusMap: Record<string, string> = { approve: 'Approved', reject: 'Rejected', 'request-info': 'Additional Information Required' }
      if (!statusMap[decision]) {
        return new Response(JSON.stringify({ message: 'Invalid decision' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: current, error: curErr } = await adminClient
        .from('claims')
        .select('id, status, checklist_docs_ok, checklist_membership_ok, checklist_contributions_ok, eligibility_verified_by, contributions_verified_by, claim_number, member_id')
        .eq('id', claimId)
        .maybeSingle()
      if (curErr) throw new Error(curErr.message)
      if (!current) {
        return new Response(JSON.stringify({ message: 'Claim not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (decision === 'approve' && current.member_id === session.id) {
        return new Response(JSON.stringify({
          message: 'You cannot approve or reject your own claim.',
          code: 'SELF_APPROVE_FORBIDDEN',
        }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (decision === 'approve' && !checklistComplete(current)) {
        return new Response(JSON.stringify({
          message: 'Complete the review checklist (documents, membership, contributions) and record officer names before approving.',
          code: 'CHECKLIST_INCOMPLETE',
        }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!['Submitted', 'Under Review', 'Additional Information Required'].includes(current.status) && decision !== 'request-info') {
        // Allow reject/approve only from reviewable states
        if (decision === 'approve' || decision === 'reject') {
          if (!['Submitted', 'Under Review', 'Additional Information Required'].includes(current.status)) {
            return new Response(JSON.stringify({
              message: `Cannot ${decision} a claim in status ${current.status}.`,
              code: 'VALIDATION',
            }), {
              status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        }
      }

      const updates: Record<string, unknown> = {
        status: statusMap[decision],
        admin_notes: adminNotes ?? null,
        reviewed_at: new Date().toISOString(),
      }
      if (decision === 'approve' || decision === 'reject') {
        updates.decided_at = new Date().toISOString()
        updates.decided_by = session.id
      }
      if (amount != null) updates.approved_amount = amount

      const { data, error } = await adminClient.from('claims').update(updates).eq('id', claimId).select('*, members(full_name)').single()
      if (error) throw new Error('Claim not found')
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: `claim_${decision}`, resource: 'claim', resource_id: claimId })

      const claimNum = data.claim_number ?? claimId
      const notifMessages: Record<string, { subject: string; body: string }> = {
        approve: {
          subject: 'Claim Approved',
          body: `Your claim ${claimNum} has been approved${amount ? ` for KSh ${Number(amount).toLocaleString('en-KE')}` : ''}. Payout will be recorded manually by Luma Welfare — you will be notified when it is completed.`,
        },
        reject: { subject: 'Claim Rejected', body: `Your claim ${claimNum} has been rejected.${adminNotes ? ` Reason: ${adminNotes}` : ''}` },
        'request-info': { subject: 'More Information Needed', body: `We need more information for your claim ${claimNum}.${adminNotes ? ` ${adminNotes}` : ''}` },
      }
      const msg = notifMessages[decision]
      if (msg && data.member_id) {
        await sendNotification(adminClient, {
          memberId: data.member_id,
          subject: msg.subject,
          body: msg.body,
          type: 'system',
          meta: { claim_id: claimId, decision },
          emailButtonText: 'View claims',
          emailButtonUrl: 'https://luma-welfare.vercel.app/claims',
        })
      }

      return new Response(JSON.stringify({ claim: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    if (err instanceof ValidationError) {
      return new Response(JSON.stringify({ message: err.message, code: 'VALIDATION' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return handleAdminError(err, 'admin-claims')
  }
})
