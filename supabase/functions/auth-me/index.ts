import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient } from '../shared/supabase.ts'
import { stripMemberKraPin } from '../shared/pii.ts'

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
    const { data: member } = await adminClient
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

    // Check registration fee status
    const { data: regFee } = await adminClient
      .from('registration_fees')
      .select('status')
      .eq('member_id', userId)
      .eq('fee_type', 'registration')
      .maybeSingle()

    const registrationFeePaid = regFee?.status === 'paid'

    // Check admin status — server queries the admins table
    let isAdmin = false
    let adminRole: string | null = null
    let adminPermissions: string[] = []
    const { data: adminRecord } = await adminClient
      .from('admins')
      .select('id, is_active, is_superadmin, role_id, roles(name)')
      .eq('id', userId)
      .eq('is_active', true)
      .maybeSingle()

    if (adminRecord) {
      isAdmin = true
      adminRole = (adminRecord.roles as unknown as { name: string } | null)?.name ?? null
      if (adminRecord.role_id) {
        const { data: perms } = await adminClient
          .from('permissions')
          .select('resource, action')
          .eq('role_id', adminRecord.role_id)
        adminPermissions = (perms ?? []).map(
          (p: { resource: string; action: string }) => `${p.resource}:${p.action}`,
        )
      }
    }

    const { data: authUserData } = await adminClient.auth.admin.getUserById(userId)
    const emailConfirmed = Boolean(authUserData?.user?.email_confirmed_at)

    return new Response(JSON.stringify({
      member: stripMemberKraPin(member as Record<string, unknown> | null),
      subscriptions: subscriptions ?? [],
      isAdmin,
      adminRole,
      isSuperadmin: adminRecord?.is_superadmin === true,
      adminPermissions,
      registrationFeePaid,
      emailConfirmed,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('auth-me: unexpected', err instanceof Error ? err.name : 'unknown')
    return new Response(JSON.stringify({ message: 'Internal server error', code: 'INTERNAL' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
