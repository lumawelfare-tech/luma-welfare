/**
 * payments-initiate
 *
 * Initiates an M-Pesa STK Push (Lipa Na M-Pesa Online) via the Daraja API.
 * Requires the following environment variables:
 *   - PAYMENTS_ENABLED: "true" to enable payment processing
 *   - MPESA_CONSUMER_KEY: Daraja API consumer key
 *   - MPESA_CONSUMER_SECRET: Daraja API consumer secret
 *   - MPESA_SHORTCODE: Business shortcode (e.g. 174379)
 *   - MPESA_PASSKEY: Daraja API passkey
 *   - MPESA_CALLBACK_URL: Public URL for M-Pesa callbacks (the payments-callback function)
 *   - MPESA_ENV: "sandbox" or "production"
 *
 * Flow:
 *   1. Authenticate user and verify subscription
 *   2. Get OAuth token from Daraja API
 *   3. Send STK Push to user's phone
 *   4. Store payment record with checkout_request_id
 *   5. Return success to frontend (user sees M-Pesa prompt on phone)
 */
import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit, handleUnexpectedError } from '../shared/supabase.ts'
import { assertMemberActive } from '../shared/member-status.ts'
import { rateLimitAsync } from '../shared/rate-limit.ts'
import {
  loadMpesaRuntime,
  getDarajaAccessToken,
  sendStkPush,
  generateMpesaPassword,
  generateMpesaTimestamp,
  formatMpesaPhone,
  DarajaRequestError,
  darajaUserMessage,
} from '../shared/mpesa-config.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (Deno.env.get('PAYMENTS_ENABLED') !== 'true') {
    return new Response(JSON.stringify({
      message: 'Payments are not currently enabled. M-Pesa integration will be activated in a future phase.',
      code: 'PAYMENTS_DISABLED',
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const runtime = loadMpesaRuntime()
  if (!runtime.ok) {
    return new Response(JSON.stringify({
      message: runtime.message,
      code: runtime.code,
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!runtime.enabled) {
    return new Response(JSON.stringify({
      message: 'Payments are not currently enabled. M-Pesa integration will be activated in a future phase.',
      code: 'PAYMENTS_DISABLED',
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rl = await rateLimitAsync(req, 'payments-initiate', { userId: user.id })
    if (!rl.ok) return rl.response!

    const adminClient = createAdminClient()
    const inactive = await assertMemberActive(adminClient, user.id)
    if (inactive) return inactive

    const body = await req.json()
    const { subscriptionId, phone, idempotencyKey } = body
    // Never trust client amount / package / status / transaction id.

    if (!subscriptionId || !idempotencyKey) {
      return new Response(JSON.stringify({ message: 'subscriptionId and idempotencyKey are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify subscription belongs to this member
    const { data: sub } = await adminClient
      .from('subscriptions')
      .select('id, member_id')
      .eq('id', subscriptionId)
      .eq('member_id', user.id)
      .single()
    if (!sub) {
      return new Response(JSON.stringify({ message: 'Subscription not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve phone from profile
    const { data: member } = await adminClient
      .from('members')
      .select('phone, alt_phone')
      .eq('id', user.id)
      .single()
    const resolvedPhone = phone ?? member?.phone ?? member?.alt_phone
    if (!resolvedPhone) {
      return new Response(JSON.stringify({ message: 'No valid phone number on file' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve amount from subscription
    const { data: subDetail } = await adminClient
      .from('subscriptions')
      .select('package_id, package_tier_id, packages(name)')
      .eq('id', subscriptionId)
      .single()
    const { data: tier } = await adminClient
      .from('package_tiers')
      .select('amount')
      .eq('id', subDetail?.package_tier_id)
      .single()
    const amount = tier?.amount ?? 0

    if (amount <= 0) {
      return new Response(JSON.stringify({ message: 'Could not determine payment amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Prevent duplicate in-flight STK for the same subscription (last 15 minutes)
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: inflight } = await adminClient
      .from('payments')
      .select('id, status, checkout_request_id, created_at')
      .eq('member_id', user.id)
      .eq('subscription_id', subscriptionId)
      .in('status', ['Pending', 'Processing'])
      .gte('created_at', fifteenMinAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (inflight) {
      return new Response(JSON.stringify({
        message: 'A payment is already in progress. Please wait for M-Pesa confirmation or try again shortly.',
        code: 'PAYMENT_IN_PROGRESS',
        paymentId: inflight.id,
        checkoutRequestId: inflight.checkout_request_id,
        status: inflight.status === 'Processing' ? 'processing' : 'pending',
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Idempotent insert — return existing if duplicate
    const { data: inserted, error: insertErr } = await adminClient
      .from('payments')
      .insert({
        member_id: user.id,
        subscription_id: subscriptionId,
        package_id: subDetail?.package_id,
        amount,
        phone: resolvedPhone,
        idempotency_key: idempotencyKey,
        status: 'Pending',
        channel: 'mpesa',
      })
      .select('id, checkout_request_id')
      .single()

    if (insertErr?.code === '23505') {
      const { data: existing } = await adminClient
        .from('payments')
        .select('id, checkout_request_id, status')
        .eq('member_id', user.id)
        .eq('idempotency_key', idempotencyKey)
        .single()
      return new Response(JSON.stringify({
        message: 'Payment already initiated.',
        paymentId: existing?.id,
        checkoutRequestId: existing?.checkout_request_id,
        status: existing?.checkout_request_id ? 'processing' : 'pending',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (insertErr) throw new Error(insertErr.message)

    const accessToken = await getDarajaAccessToken(runtime)
    const timestamp = generateMpesaTimestamp()
    const password = generateMpesaPassword(runtime.shortcode, runtime.passkey, timestamp)
    const formattedPhone = formatMpesaPhone(resolvedPhone)

    let checkoutRequestId: string
    try {
      const stk = await sendStkPush(runtime, accessToken, {
        BusinessShortCode: runtime.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(amount),
        PartyA: formattedPhone,
        PartyB: runtime.shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: runtime.callbackUrl,
        AccountReference: `LUMA-${subDetail?.package_id?.slice(0, 8) ?? 'PAY'}`,
        TransactionDesc: `Luma Welfare - ${subDetail?.packages?.[0]?.name ?? 'Payment'}`,
      })
      checkoutRequestId = stk.checkoutRequestId
    } catch (stkErr) {
      const kind = stkErr instanceof DarajaRequestError ? stkErr.kind : 'stk'
      await adminClient
        .from('payments')
        .update({ status: 'Failed', failure_reason: 'STK Push failed' })
        .eq('id', inserted.id)

      return new Response(JSON.stringify({
        message: darajaUserMessage(kind === 'stk' ? 'stk_rejected' : kind),
        code: 'STK_FAILED',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await adminClient
      .from('payments')
      .update({ checkout_request_id: checkoutRequestId })
      .eq('id', inserted.id)

    await adminClient.rpc('record_payment_initiation', {
      p_payment_id: inserted.id,
      p_checkout_request_id: checkoutRequestId,
      p_actor: 'member',
    })

    await logAudit(adminClient, {
      actor_id: user.id,
      action: 'payment_initiated',
      resource: 'payment',
      resource_id: inserted.id,
      meta: { idempotencyKey, checkoutRequestId, mpesaEnv: runtime.env },
    })

    return new Response(JSON.stringify({
      message: 'Payment initiated. Check your phone for the M-Pesa prompt.',
      paymentId: inserted.id,
      checkoutRequestId,
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    if (err instanceof DarajaRequestError) {
      return new Response(JSON.stringify({
        message: darajaUserMessage(err.kind),
        code: 'STK_FAILED',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return handleUnexpectedError(err, 'payments-initiate')
  }
})
