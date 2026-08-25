import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'

/**
 * Member Claims — Submit & List
 *
 * GET  /member-claims          — list member's own claims
 * POST /member-claims          — submit a new claim (starts as Draft/Submitted)
 * GET  /member-claims?id=xxx   — get specific claim details
 */

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
    const url = new URL(req.url)
    const claimId = url.searchParams.get('id')

    // GET — list member's claims
    if (req.method === 'GET' && !claimId) {
      const { data, error } = await adminClient
        .from('claims')
        .select('id, claim_number, claim_type, amount_requested, status, description, created_at, submitted_at, decided_at, admin_notes, packages(code, name)')
        .eq('member_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ claims: data ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET — specific claim
    if (req.method === 'GET' && claimId) {
      const { data: claim, error } = await adminClient
        .from('claims')
        .select('*, packages(code, name)')
        .eq('id', claimId)
        .eq('member_id', user.id)
        .single()

      if (error) throw new Error('Claim not found')
      const { data: documents } = await adminClient
        .from('claim_documents')
        .select('*')
        .eq('claim_id', claim.id)

      return new Response(JSON.stringify({ claim, documents: documents ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST — submit new claim
    if (req.method === 'POST') {
      const body = await req.json()
      const { subscriptionId, claimType, description, amountRequested } = body

      if (!subscriptionId || !claimType || !description) {
        return new Response(JSON.stringify({ message: 'subscriptionId, claimType, and description are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Verify subscription belongs to this member and is active
      const { data: sub, error: subErr } = await adminClient
        .from('subscriptions')
        .select('id, package_id, status, member_id')
        .eq('id', subscriptionId)
        .eq('member_id', user.id)
        .single()

      if (subErr || !sub) {
        return new Response(JSON.stringify({ message: 'Subscription not found', code: 'NOT_FOUND' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (sub.status !== 'active') {
        return new Response(JSON.stringify({ message: 'Only active subscriptions can file claims', code: 'SUBSCRIPTION_INACTIVE' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Check qualification — member must be eligible
      const { data: qual } = await adminClient
        .from('qualifications')
        .select('status')
        .eq('subscription_id', subscriptionId)
        .eq('member_id', user.id)
        .maybeSingle()

      if (qual && qual.status !== 'eligible') {
        return new Response(JSON.stringify({ message: 'You are not yet eligible to file a claim for this package', code: 'NOT_ELIGIBLE' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Generate claim number
      const claimNumber = `CLM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

      const { data: claim, error: claimErr } = await adminClient
        .from('claims')
        .insert({
          claim_number: claimNumber,
          member_id: user.id,
          subscription_id: subscriptionId,
          package_id: sub.package_id,
          claim_type: claimType,
          description,
          amount_requested: amountRequested ?? null,
          status: 'Submitted',
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (claimErr) throw new Error(claimErr.message)

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'claim_submitted',
        resource: 'claim',
        resource_id: claim.id,
        meta: { claim_number: claimNumber, claim_type: claimType, package_id: sub.package_id },
      })

      return new Response(JSON.stringify({ claim }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
