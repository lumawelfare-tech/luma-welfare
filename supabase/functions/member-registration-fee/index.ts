import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const url = new URL(req.url)

    // GET — check registration fee status
    if (req.method === 'GET') {
      const { data: fee } = await adminClient
        .from('registration_fees')
        .select('*')
        .eq('member_id', user.id)
        .eq('fee_type', 'registration')
        .maybeSingle()

      return new Response(JSON.stringify({ registration_fee: fee ?? null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST — initiate registration fee payment
    // NOTE: Members cannot confirm their own fee. Confirmation is only via:
    // 1. M-Pesa callback handler (Phase 2)
    // 2. Admin verification endpoint
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))

      // Check existing fee record
      const { data: existing } = await adminClient
        .from('registration_fees')
        .select('*')
        .eq('member_id', user.id)
        .eq('fee_type', 'registration')
        .maybeSingle()

      // Default: initiate payment
      if (existing?.status === 'paid') {
        return new Response(JSON.stringify({ message: 'Registration fee already paid.', status: 'paid' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (existing?.status === 'pending') {
        return new Response(JSON.stringify({ message: 'Payment already in progress.', status: 'pending' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Mark as pending
      if (existing) {
        await adminClient
          .from('registration_fees')
          .update({ status: 'pending', payment_method: 'mpesa' })
          .eq('member_id', user.id)
          .eq('fee_type', 'registration')
      } else {
        await adminClient
          .from('registration_fees')
          .insert({
            member_id: user.id,
            fee_type: 'registration',
            amount: 300,
            currency: 'KES',
            status: 'pending',
            payment_method: 'mpesa',
          })
      }

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'registration_fee_initiated',
        resource: 'registration_fee',
        resource_id: user.id,
        meta: { amount: 300 },
      })

      return new Response(JSON.stringify({ message: 'Registration fee payment initiated.', status: 'pending' }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
