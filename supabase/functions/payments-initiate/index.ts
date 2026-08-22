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
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'

const DARADA_BASE: Record<string, string> = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
}

/** Get M-Pesa OAuth token from Daraja API */
async function getOAuthToken(): Promise<string> {
  const env = Deno.env.get('MPESA_ENV') ?? 'sandbox'
  const base = DARADA_BASE[env]
  const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY') ?? ''
  const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET') ?? ''

  if (!consumerKey || !consumerSecret) {
    throw new Error('M-Pesa credentials not configured')
  }

  const auth = btoa(`${consumerKey}:${consumerSecret}`)
  const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OAuth token request failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  return data.access_token
}

/** Generate M-Pesa password from shortcode, passkey, and timestamp */
function generatePassword(shortcode: string, passkey: string, timestamp: string): string {
  const dataToEncode = `${shortcode}${passkey}${timestamp}`
  return btoa(dataToEncode)
}

/** Format phone number to 254XXXXXXXXX */
function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '')
  if (cleaned.startsWith('254')) return cleaned
  if (cleaned.startsWith('0')) return `254${cleaned.slice(1)}`
  return cleaned
}

/** Generate timestamp in YYYYMMDDHHmmss format */
function generateTimestamp(): string {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Payments are disabled
  if (Deno.env.get('PAYMENTS_ENABLED') !== 'true') {
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

    const adminClient = createAdminClient()
    const body = await req.json()
    const { subscriptionId, phone, idempotencyKey } = body

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

    // ── M-Pesa STK Push ──────────────────────────────────────────
    const mpesaEnv = Deno.env.get('MPESA_ENV') ?? 'sandbox'
    const base = DARADA_BASE[mpesaEnv]
    const shortcode = Deno.env.get('MPESA_SHORTCODE') ?? ''
    const passkey = Deno.env.get('MPESA_PASSKEY') ?? ''
    const callbackUrl = Deno.env.get('MPESA_CALLBACK_URL') ?? ''

    if (!shortcode || !passkey || !callbackUrl) {
      throw new Error('M-Pesa configuration incomplete. Check MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL.')
    }

    const accessToken = await getOAuthToken()
    const timestamp = generateTimestamp()
    const password = generatePassword(shortcode, passkey, timestamp)
    const formattedPhone = formatPhone(resolvedPhone)

    const stkPayload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: `LUMA-${subDetail?.package_id?.slice(0, 8) ?? 'PAY'}`,
      TransactionDesc: `Luma Welfare - ${subDetail?.packages?.[0]?.name ?? 'Payment'}`,
    }

    const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stkPayload),
    })

    const stkData = await stkRes.json()

    if (stkData.ResponseCode !== '0') {
      console.error('STK Push failed:', stkData)
      // Update payment status to failed
      await adminClient
        .from('payments')
        .update({ status: 'Failed', failure_reason: stkData.ResponseDescription ?? 'STK Push failed' })
        .eq('id', inserted.id)

      return new Response(JSON.stringify({
        message: stkData.ResponseDescription ?? 'Failed to initiate M-Pesa payment. Please try again.',
        code: 'STK_FAILED',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update payment with checkout_request_id
    await adminClient
      .from('payments')
      .update({ checkout_request_id: stkData.CheckoutRequestID })
      .eq('id', inserted.id)

    await logAudit(adminClient, {
      actor_id: user.id,
      action: 'payment_initiated',
      resource: 'payment',
      resource_id: inserted.id,
      meta: { idempotencyKey, checkoutRequestId: stkData.CheckoutRequestID },
    })

    return new Response(JSON.stringify({
      message: 'Payment initiated. Check your phone for the M-Pesa prompt.',
      paymentId: inserted.id,
      checkoutRequestId: stkData.CheckoutRequestID,
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Payment initiation error:', err)
    return new Response(JSON.stringify({
      message: err instanceof Error ? err.message : 'Internal error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
