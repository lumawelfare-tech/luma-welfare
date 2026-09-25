import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, loadAdminSession, adminSessionDeniedResponse, requirePermission, handleAdminError, logAudit } from '../shared/supabase.ts'
import { sendNotification } from '../shared/notifications.ts'

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
    const loaded = await loadAdminSession(adminClient, user.id, { req })
    if (loaded.status !== 'ok') {
      return adminSessionDeniedResponse(loaded)
    }
    const session = loaded.session

    const url = new URL(req.url)
    const resourceId = url.searchParams.get('resource_id')

    // GET /admin-registration-fee — list pending registration fees
    if (req.method === 'GET' && !resourceId) {
      requirePermission(session, 'members', 'read')
      const { data, error } = await adminClient
        .from('registration_fees')
        .select('id, member_id, amount, currency, status, payment_method, mpesa_receipt, paid_at, created_at, members(full_name, phone, email)')
        .eq('fee_type', 'registration')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ pending_fees: data ?? [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET /admin-registration-fee?resource_id=xxx — get specific registration fee
    if (req.method === 'GET' && resourceId) {
      requirePermission(session, 'members', 'read')
      const { data, error } = await adminClient
        .from('registration_fees')
        .select('*, members(full_name, phone, email)')
        .eq('id', resourceId)
        .eq('fee_type', 'registration')
        .single()

      if (error) throw new Error('Registration fee not found')
      return new Response(JSON.stringify({ registration_fee: data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST /admin-registration-fee — confirm a registration fee
    if (req.method === 'POST') {
      requirePermission(session, 'members', 'approve')
      const body = await req.json()
      const { memberId, mpesaReceipt, transactionReference, notes } = body

      if (!memberId) {
        return new Response(JSON.stringify({ message: 'memberId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Check existing record
      const { data: existing } = await adminClient
        .from('registration_fees')
        .select('status, amount')
        .eq('member_id', memberId)
        .eq('fee_type', 'registration')
        .maybeSingle()

      if (!existing) {
        return new Response(JSON.stringify({ message: 'Registration fee record not found', code: 'NOT_FOUND' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (existing.status === 'paid') {
        return new Response(JSON.stringify({ message: 'Already confirmed', status: 'paid' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const feeAmount = existing.amount != null && Number(existing.amount) > 0
        ? Number(existing.amount)
        : null

      // Update to paid
      await adminClient
        .from('registration_fees')
        .update({
          status: 'paid',
          mpesa_receipt: mpesaReceipt ?? null,
          transaction_reference: transactionReference ?? null,
          paid_at: new Date().toISOString(),
        })
        .eq('member_id', memberId)
        .eq('fee_type', 'registration')

      await logAudit(adminClient, {
        actor_id: session.id,
        actor_role: session.role_name,
        action: 'registration_fee_confirmed',
        resource: 'registration_fee',
        resource_id: memberId,
        meta: { mpesa_receipt: mpesaReceipt, by: session.display_name, notes, amount: feeAmount },
      })

      // Notify member that registration fee is confirmed (respects channel preferences)
      await sendNotification(adminClient, {
        memberId,
        subject: 'Membership Activated',
        body: feeAmount != null
          ? `Your KSh ${feeAmount.toLocaleString('en-KE')} registration fee has been confirmed. You can now explore and join welfare packages.`
          : 'Your registration fee has been confirmed. You can now explore and join welfare packages.',
        emailButtonText: 'Explore Packages',
        emailButtonUrl: 'https://luma-welfare.vercel.app/join',
      })

      return new Response(JSON.stringify({ message: 'Registration fee confirmed', status: 'paid' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return handleAdminError(err, 'admin-registration-fee')
  }
})
