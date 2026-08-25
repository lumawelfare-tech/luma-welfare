import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, requirePermission, logAudit } from '../shared/supabase.ts'
import { sendEmail, buildEmailTemplate } from '../shared/email.ts'

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
    const resourceId = url.searchParams.get("resource_id")
    const contribId = resourceId

    if (req.method === 'GET' && !contribId) {
      requirePermission(session, 'contributions', 'read')
      const status = url.searchParams.get('status') ?? 'Pending'
      const { data, error } = await adminClient
        .from('contributions').select('id, period, amount, status, notes, created_at, member_id, members(full_name, phone, membership_number), packages(code, name), payments(mpesa_receipt)')
        .eq('status', status).order('created_at', { ascending: true }).limit(100)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ contributions: data ?? [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

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

      // Send notification to member
      if (data.member_id) {
        const pkgName = (data.packages as unknown as { name: string | null })?.name ?? 'your package'
        const amount = Number(data.amount ?? 0)
        const period = data.period ?? ''
        const notifMsg = action === 'verify'
          ? { subject: 'Contribution Verified', body: `Your KSh ${amount.toLocaleString('en-KE')} contribution for ${pkgName} (${period}) has been verified. Thank you!` }
          : { subject: 'Contribution Rejected', body: `Your KSh ${amount.toLocaleString('en-KE')} contribution for ${pkgName} (${period}) was not verified.${notes ? ` Reason: ${notes}` : ''}` }
        await adminClient.from('notifications').insert({
          member_id: data.member_id,
          channel: 'in_app',
          subject: notifMsg.subject,
          body: notifMsg.body,
          status: 'queued',
        })

        // Send email notification
        const { data: member } = await adminClient.from('members').select('email').eq('id', data.member_id).single()
        if (member?.email) {
          const emailHtml = buildEmailTemplate(notifMsg.subject, notifMsg.body, 'View Dashboard', 'https://luma-welfare.vercel.app/member')
          await sendEmail(member.email, notifMsg.subject, emailHtml)
        }
      }

      return new Response(JSON.stringify({ contribution: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(JSON.stringify({ message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
