import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission } from '../shared/supabase.ts'

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
    const session = await loadAdminSession(adminClient, user.id)
    if (!session) {
      return new Response(JSON.stringify({ message: 'No admin access', code: 'FORBIDDEN' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    requirePermission(session, 'members', 'read')

    const [members, subs, pendingContribs, pendingClaims, approvedClaims, settings] = await Promise.all([
      adminClient.from('members').select('id', { count: 'exact', head: true }),
      adminClient.from('subscriptions').select('id', { count: 'exact', head: true }),
      adminClient.from('contributions').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
      adminClient.from('claims').select('id', { count: 'exact', head: true }).in('status', ['Submitted', 'Under Review', 'Additional Information Required']),
      adminClient.from('claims').select('id', { count: 'exact', head: true }).eq('status', 'Approved'),
      adminClient.from('platform_settings').select('key, value').eq('key', 'stats'),
    ])

    return new Response(JSON.stringify({
      members: members.count ?? 0,
      subscriptions: subs.count ?? 0,
      pending_contributions: pendingContribs.count ?? 0,
      pending_claims: pendingClaims.count ?? 0,
      approved_claims: approvedClaims.count ?? 0,
      confirmed_stats: settings.data?.[0]?.value ?? {},
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('FORBIDDEN') ? 403 : 500
    return new Response(JSON.stringify({ message, code: message.includes('FORBIDDEN') ? 'FORBIDDEN' : 'INTERNAL' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
