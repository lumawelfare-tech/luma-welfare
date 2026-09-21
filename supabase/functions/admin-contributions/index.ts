import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, adminSessionDeniedResponse, requirePermission, handleAdminError, logAudit } from '../shared/supabase.ts'
import { sendNotification } from '../shared/notifications.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import { sanitizeSearch } from '../shared/search.ts'
import { maskMemberListFields } from '../shared/pii.ts'

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
      const rl = await rateLimitAsync(req, 'admin-contributions-mutation', { userId: session.id, adminClient })
      if (!rl.ok) return rl.response!
    }

    const url = new URL(req.url)
    const resourceId = url.searchParams.get('resource_id')
    const contribId = resourceId

    // GET /admin-contributions — list with search + pagination
    if (req.method === 'GET' && !contribId) {
      requirePermission(session, 'contributions', 'read')
      const status = url.searchParams.get('status')
      const q = sanitizeSearch(url.searchParams.get('q')) || null
      const dateFrom = url.searchParams.get('date_from')
      const dateTo = url.searchParams.get('date_to')
      const packageId = url.searchParams.get('package_id')
      const page = parseInt(url.searchParams.get('page') || '1')
      const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '50'), 200)

      const { data, error } = await adminClient.rpc('admin_search_contributions', {
        p_q: q || null,
        p_status: status || null,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_package_id: packageId || null,
        p_page: page,
        p_per_page: perPage,
      })

      if (error) throw new Error(error.message)

      const result = data?.[0] ?? { contributions: [], total: 0, page, per_page: perPage, pages: 1 }
      const masked = ((result.contributions ?? []) as Record<string, unknown>[]).map((row) =>
        maskMemberListFields(row),
      )
      return new Response(JSON.stringify({
        contributions: masked,
        total: Number(result.total) ?? 0,
        page: result.page ?? page,
        per_page: result.per_page ?? perPage,
        pages: result.pages ?? 1,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PATCH /admin-contributions?resource_id=xxx — verify/reject
    if (req.method === 'PATCH' && contribId) {
      requirePermission(session, 'contributions', 'verify')
      const body = await req.json()
      const { action, paymentId, notes } = body
      if (!['verify', 'reject'].includes(action)) {
        return new Response(JSON.stringify({ message: 'Action must be verify or reject' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data, error } = await adminClient
        .from('contributions').update({ status: action === 'verify' ? 'Verified' : 'Failed', payment_id: paymentId ?? null, notes })
        .eq('id', contribId).select('*, members(full_name), packages(name)').single()
      if (error) throw new Error('Contribution not found')
      await logAudit(adminClient, { actor_id: session.id, actor_role: session.role_name, action: action === 'verify' ? 'verified_contribution' : 'rejected_contribution', resource: 'contribution', resource_id: contribId })

      // Send notification to member (respects channel preferences)
      if (data.member_id) {
        const pkgName = (data.packages as unknown as { name: string | null })?.name ?? 'your package'
        const amount = Number(data.amount ?? 0)
        const period = data.period ?? ''
        const notifMsg = action === 'verify'
          ? { subject: 'Contribution Verified', body: `Your KSh ${amount.toLocaleString('en-KE')} contribution for ${pkgName} (${period}) has been verified. Thank you!` }
          : { subject: 'Contribution Rejected', body: `Your KSh ${amount.toLocaleString('en-KE')} contribution for ${pkgName} (${period}) was not verified.${notes ? ` Reason: ${notes}` : ''}` }
        await sendNotification(adminClient, {
          memberId: data.member_id,
          subject: notifMsg.subject,
          body: notifMsg.body,
          emailButtonText: 'View Dashboard',
          emailButtonUrl: 'https://luma-welfare.vercel.app/member',
        })
      }

      return new Response(JSON.stringify({ contribution: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return handleAdminError(err, 'admin-contributions')
  }
})
