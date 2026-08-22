import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient } from '../shared/supabase.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const userId = user.id

    // Get member profile
    const { data: member, error: memberError } = await adminClient
      .from('members')
      .select('*')
      .eq('id', userId)
      .single()

    // Get subscriptions
    const { data: subscriptions } = await adminClient
      .from('subscriptions')
      .select('id, status, started_at, next_due_date, package_id, package_tier_id, packages(code, name), package_tiers(name, amount)')
      .eq('member_id', userId)
      .order('created_at')

    // Check admin status — server queries the admins table
    let isAdmin = false
    let adminRole: string | null = null
    const { data: adminRecord } = await adminClient
      .from('admins')
      .select('id, is_active, is_superadmin, roles(name)')
      .eq('id', userId)
      .eq('is_active', true)
      .maybeSingle()

    if (adminRecord) {
      isAdmin = true
      adminRole = (adminRecord.roles as unknown as { name: string } | null)?.name ?? null
    }

    return new Response(JSON.stringify({
      member: member ?? null,
      error: memberError ? memberError.message : null,
      subscriptions: subscriptions ?? [],
      isAdmin,
      adminRole,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ message: 'Internal server error', code: 'INTERNAL' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
