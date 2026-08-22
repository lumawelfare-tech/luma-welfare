import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

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
    const pathParts = url.pathname.split('/').filter(Boolean)
    const claimId = pathParts[pathParts.length - 1]

    if (req.method === 'GET' && !claimId) {
      requirePermission(session, 'claims', 'read')
      const { data, error } = await adminClient
        .from('claims').select('id, claim_number, claim_type, amount_requested, status, created_at, member_id, members(full_name, phone), packages(code, name)')
        .order('created_at', { ascending: false }).limit(100)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ claims: data ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (req.method === 'GET' && claimId) {
      requirePermission(session, 'claims', 'read')
      const { data: claim, error } = await adminClient.from('claims').select('*').eq('id', claimId).single()
      if (error) throw new Error('Claim not found')
      const { data: documents } = await adminClient.from('claim_documents').select('*').eq('claim_id', claim.id)
      return new Response(JSON.stringify({ claim, documents: documents ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (req.method === 'PATCH' && claimId) {
      requirePermission(session, 'claims', 'approve')
      const body = await req.json()
      const { decision, adminNotes, amount } = body
      const statusMap: Record<string, string> = { approve: 'Approved', reject: 'Rejected', 'request-info': 'Additional Information Required' }
      if (!statusMap[decision]) return new Response(JSON.stringify({ message: 'Invalid decision' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      const updates: Record<string, unknown> = { status: statusMap[decision], admin_notes: adminNotes, reviewed_at: new Date().toISOString() }
      if (decision === 'approve' || decision === 'reject') { updates.decided_at = new Date().toISOString(); updates.decided_by = session.id }
      if (amount) updates.amount_requested = amount

      const { data, error } = await adminClient.from('claims').update(updates).eq('id', claimId).select().single()
      if (error) throw new Error('Claim not found')
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: `claim_${decision}`, resource: 'claim', resource_id: claimId })
      return new Response(JSON.stringify({ claim: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(JSON.stringify({ message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
