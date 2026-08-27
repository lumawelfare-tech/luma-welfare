import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'
import { sendNotification } from '../shared/notifications.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const session = await loadAdminSession(adminClient, user.id)
    if (!session) return new Response(JSON.stringify({ message: 'No admin access' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const url = new URL(req.url)
    const resourceId = url.searchParams.get('resource_id')
    const claimId = resourceId

    // GET /admin-claims — list with search + pagination
    if (req.method === 'GET' && !claimId) {
      requirePermission(session, 'claims', 'read')
      const status = url.searchParams.get('status')
      const q = url.searchParams.get('q')
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
      return new Response(JSON.stringify({ claim, documents: documents ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /admin-claims?action=batch — batch reject claims
    const batchAction = url.searchParams.get('action')
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

      const statusMap: Record<string, string> = { approve: 'Approved', reject: 'Rejected', 'request-info': 'Additional Information Required' }
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
          if (decision === 'approve' || decision === 'reject') {
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

    // PATCH /admin-claims?resource_id=xxx — approve/reject/request-info
    if (req.method === 'PATCH' && claimId) {
      requirePermission(session, 'claims', 'approve')
      const body = await req.json()
      const { decision, adminNotes, amount } = body
      const statusMap: Record<string, string> = { approve: 'Approved', reject: 'Rejected', 'request-info': 'Additional Information Required' }
      if (!statusMap[decision]) return new Response(JSON.stringify({ message: 'Invalid decision' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      const updates: Record<string, unknown> = { status: statusMap[decision], admin_notes: adminNotes, reviewed_at: new Date().toISOString() }
      if (decision === 'approve' || decision === 'reject') { updates.decided_at = new Date().toISOString(); updates.decided_by = session.id }
      if (amount) updates.approved_amount = amount

      const { data, error } = await adminClient.from('claims').update(updates).eq('id', claimId).select('*, members(full_name)').single()
      if (error) throw new Error('Claim not found')
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: `claim_${decision}`, resource: 'claim', resource_id: claimId })

      // Send notification to member (respects channel preferences)
      const claimNum = data.claim_number ?? claimId
      const notifMessages: Record<string, { subject: string; body: string }> = {
        approve: { subject: 'Claim Approved', body: `Your claim ${claimNum} has been approved${amount ? ` for KSh ${Number(amount).toLocaleString('en-KE')}` : ''}. The payout will be processed shortly.` },
        reject: { subject: 'Claim Rejected', body: `Your claim ${claimNum} has been rejected.${adminNotes ? ` Reason: ${adminNotes}` : ''}` },
        'request-info': { subject: 'More Information Needed', body: `We need more information for your claim ${claimNum}.${adminNotes ? ` ${adminNotes}` : ''}` },
      }
      const msg = notifMessages[decision]
      if (msg && data.member_id) {
        await sendNotification(adminClient, {
          memberId: data.member_id,
          subject: msg.subject,
          body: msg.body,
          emailButtonText: 'View Dashboard',
          emailButtonUrl: 'https://luma-welfare.vercel.app/member',
        })
      }

      return new Response(JSON.stringify({ claim: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('admin-claims error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
    const status = message.includes('not found') || message.includes('Not found') ? 404 : 500
    return new Response(JSON.stringify({ message, code: 'INTERNAL' }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
