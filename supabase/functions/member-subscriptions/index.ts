import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createAdminClient()
    const body = await req.json()
    const { packageId, packageTierId } = body

    if (!packageId) return new Response(JSON.stringify({ message: 'packageId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Verify member exists and is not suspended/closed
    const { data: member } = await adminClient.from('members').select('status').eq('id', user.id).single()
    if (!member) {
      return new Response(JSON.stringify({ message: 'Member account not found.', code: 'NOT_FOUND' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (member.status === 'suspended' || member.status === 'closed') {
      return new Response(JSON.stringify({ message: 'Your account has been ' + member.status + '.', code: 'ACCOUNT_' + member.status.toUpperCase() }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Check registration fee has been paid
    const { data: regFee } = await adminClient
      .from('registration_fees')
      .select('status')
      .eq('member_id', user.id)
      .eq('fee_type', 'registration')
      .maybeSingle()
    if (!regFee || regFee.status !== 'paid') {
      return new Response(JSON.stringify({ message: 'You must pay the KSh 300 registration fee before subscribing to packages.', code: 'REGISTRATION_FEE_REQUIRED' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Check for existing subscription
    const { data: existing } = await adminClient
      .from('subscriptions').select('id').eq('member_id', user.id).eq('package_id', packageId).maybeSingle()
    if (existing) return new Response(JSON.stringify({ message: 'You are already in this package.', code: 'ALREADY_SUBSCRIBED' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data, error } = await adminClient
      .from('subscriptions').insert({ member_id: user.id, package_id: packageId, package_tier_id: packageTierId ?? null, status: 'pending' }).select().single()
    if (error) throw new Error(error.message)

    await logAudit(adminClient, { actor_id: user.id, action: 'requested_subscription', resource: 'subscription', resource_id: data.id })
    return new Response(JSON.stringify({ subscription: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
