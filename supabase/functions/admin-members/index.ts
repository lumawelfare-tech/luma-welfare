import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'

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
    const session = await loadAdminSession(adminClient, user.id)
    if (!session) {
      return new Response(JSON.stringify({ message: 'No admin access', code: 'FORBIDDEN' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const memberId = pathParts[pathParts.length - 1]

    // GET /admin-members — list members
    if (req.method === 'GET' && !memberId) {
      requirePermission(session, 'members', 'read')
      const status = url.searchParams.get('status')
      const q = url.searchParams.get('q')
      let query = adminClient
        .from('members')
        .select('id, membership_number, full_name, phone, email, status, joined_at, approved_at')
        .order('joined_at', { ascending: false })
      if (status) query = query.eq('status', status)
      if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,membership_number.ilike.%${q}%`)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ members: data ?? [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET /admin-members/:id — get member detail
    if (req.method === 'GET' && memberId) {
      requirePermission(session, 'members', 'read')
      const { data: member, error } = await adminClient
        .from('members')
        .select('*')
        .eq('id', memberId)
        .single()
      if (error) throw new Error('Member not found')

      const [subs, family, contribs] = await Promise.all([
        adminClient.from('subscriptions').select('id, status, started_at, next_due_date, package_id, packages(code, name), package_tiers(name, amount)').eq('member_id', memberId),
        adminClient.from('family_members').select('*').eq('member_id', memberId).eq('is_active', true),
        adminClient.from('contributions').select('id, period, amount, status, package_id, created_at').eq('member_id', memberId).order('period', { ascending: false }),
      ])

      return new Response(JSON.stringify({
        member,
        subscriptions: subs.data ?? [],
        family_members: family.data ?? [],
        contributions: contribs.data ?? [],
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PATCH /admin-members/:id/status — approve/suspend/close member
    if (req.method === 'PATCH' && memberId) {
      requirePermission(session, 'members', 'approve')
      const body = await req.json()
      const { status: memberStatus } = body
      if (!['active', 'suspended', 'closed'].includes(memberStatus)) {
        return new Response(JSON.stringify({ message: 'Invalid status', code: 'VALIDATION' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const now = new Date().toISOString()
      const { data, error } = await adminClient
        .from('members')
        .update({
          status: memberStatus,
          approved_at: memberStatus === 'active' ? now : undefined,
          approved_by: memberStatus === 'active' ? session.id : undefined,
        })
        .eq('id', memberId)
        .select()
        .single()
      if (error) throw new Error('Member not found')

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: `member_${memberStatus}`,
        resource: 'member',
        resource_id: memberId,
        meta: { by: session.display_name },
      })

      return new Response(JSON.stringify({ member: data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('FORBIDDEN') ? 403 : message.includes('not found') ? 404 : 500
    return new Response(JSON.stringify({ message, code: message.includes('FORBIDDEN') ? 'FORBIDDEN' : 'INTERNAL' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
