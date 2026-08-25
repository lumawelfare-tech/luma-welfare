import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit } from '../shared/supabase.ts'

/**
 * Member Registration Fee — Check status, Initiate M-Pesa STK Push, Check status
 *
 * GET  /member-registration-fee           — check registration fee status
 * POST /member-registration-fee           — initiate M-Pesa STK Push for KSh 300
 * POST /member-registration-fee?action=check-status — poll for payment confirmation
 */

const DARADA_BASE: Record<string, string> = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
}

async function getOAuthToken(): Promise<string> {
  const env = Deno.env.get('MPESA_ENV') ?? 'sandbox'
  const base = DARADA_BASE[env]
  const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY') ?? ''
  const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET') ?? ''
  if (!consumerKey || !consumerSecret) throw new Error('M-Pesa credentials not configured')
  const auth = btoa(`${consumerKey}:${consumerSecret}`)
  const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  })
  if (!res.ok) throw new Error(`OAuth token request failed: ${res.status}`)
  const data = await res.json()
  return data.access_token
}

function generatePassword(shortcode: string, passkey: string, timestamp: string): string {
  return btoa(`${shortcode}${passkey}${timestamp}`)
}

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '')
  if (cleaned.startsWith('254')) return cleaned
  if (cleaned.startsWith('0')) return `254${cleaned.slice(1)}`
  return cleaned
}

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

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Not authenticated', code: 'UNAUTHORIZED' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const url = new URL(req.url)

    // GET — check registration fee status
    if (req.method === 'GET') {
      const { data: fee } = await adminClient
        .from('registration_fees')
        .select('*')
        .eq('member_id', user.id)
        .eq('fee_type', 'registration')
        .maybeSingle()

      return new Response(JSON.stringify({ registration_fee: fee ?? null }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST
    if (req.method === 'POST') {
      const action = url.searchParams.get('action')
      const body = await req.json().catch(() => ({}))

      // Check existing fee record first
      const { data: existing } = await adminClient
        .from('registration_fees')
        .select('*')
        .eq('member_id', user.id)
        .eq('fee_type', 'registration')
        .maybeSingle()

      // POST?action=check-status — poll for payment confirmation
      if (action === 'check-status') {
        if (existing?.status === 'paid') {
          return new Response(JSON.stringify({ status: 'paid', message: 'Activation fee paid.' }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ status: existing?.status ?? 'unpaid', checkout_request_id: existing?.mpesa_receipt ?? null }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Default: initiate M-Pesa STK Push
      if (existing?.status === 'paid') {
        return new Response(JSON.stringify({ message: 'Registration fee already paid.', status: 'paid' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (existing?.status === 'pending' && existing?.checkout_request_id) {
        return new Response(JSON.stringify({ message: 'Payment already in progress.', status: 'pending', checkout_request_id: existing.checkout_request_id }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Get phone number
      const phone = body.phone
      if (!phone) {
        return new Response(JSON.stringify({ message: 'Phone number is required.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const formattedPhone = formatPhone(phone)
      if (!formattedPhone.match(/^254[17]\d{8}$/)) {
        return new Response(JSON.stringify({ message: 'Please enter a valid Safaricom phone number (07XXXXXXXX or 2547XXXXXXXX).' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Check if payments are enabled
      const paymentsEnabled = Deno.env.get('PAYMENTS_ENABLED') === 'true'

      if (!paymentsEnabled) {
        // Payments disabled — mark as pending for admin verification
        if (existing) {
          await adminClient
            .from('registration_fees')
            .update({ status: 'pending', payment_method: 'mpesa' })
            .eq('member_id', user.id)
            .eq('fee_type', 'registration')
        } else {
          await adminClient
            .from('registration_fees')
            .insert({
              member_id: user.id,
              fee_type: 'registration',
              amount: 300,
              currency: 'KES',
              status: 'pending',
              payment_method: 'mpesa',
            })
        }

        await logAudit(adminClient, {
          actor_id: user.id,
          action: 'registration_fee_initiated',
          resource: 'registration_fee',
          resource_id: user.id,
          meta: { amount: 300, phone: formattedPhone, payments_enabled: false },
        })

        return new Response(JSON.stringify({
          message: 'Payment request recorded. M-Pesa is not yet enabled — an admin will verify your payment.',
          status: 'pending',
          payments_enabled: false,
        }), {
          status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // ── M-Pesa STK Push ──────────────────────────────────────────
      const mpesaEnv = Deno.env.get('MPESA_ENV') ?? 'sandbox'
      const base = DARADA_BASE[mpesaEnv]
      const shortcode = Deno.env.get('MPESA_SHORTCODE') ?? ''
      const passkey = Deno.env.get('MPESA_PASSKEY') ?? ''
      const callbackUrl = Deno.env.get('MPESA_CALLBACK_URL') ?? ''

      if (!shortcode || !passkey || !callbackUrl) {
        throw new Error('M-Pesa configuration incomplete.')
      }

      // Create/update fee record as pending
      const idempotencyKey = `REG-${user.id}-${Date.now()}`
      if (existing) {
        await adminClient
          .from('registration_fees')
          .update({ status: 'pending', payment_method: 'mpesa' })
          .eq('member_id', user.id)
          .eq('fee_type', 'registration')
      } else {
        await adminClient
          .from('registration_fees')
          .insert({
            member_id: user.id,
            fee_type: 'registration',
            amount: 300,
            currency: 'KES',
            status: 'pending',
            payment_method: 'mpesa',
          })
      }

      const accessToken = await getOAuthToken()
      const timestamp = generateTimestamp()
      const password = generatePassword(shortcode, passkey, timestamp)

      const stkPayload = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: 300,
        PartyA: formattedPhone,
        PartyB: shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: callbackUrl,
        AccountReference: `LUMA-REG-${user.id.slice(0, 8)}`,
        TransactionDesc: 'Luma Welfare - KSh 300 Activation Fee',
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
        await adminClient
          .from('registration_fees')
          .update({ status: 'failed' })
          .eq('member_id', user.id)
          .eq('fee_type', 'registration')

        return new Response(JSON.stringify({
          message: stkData.ResponseDescription ?? 'Failed to initiate M-Pesa payment. Please try again.',
          code: 'STK_FAILED',
        }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Store checkout_request_id for callback matching
      await adminClient
        .from('registration_fees')
        .update({ transaction_reference: stkData.CheckoutRequestID })
        .eq('member_id', user.id)
        .eq('fee_type', 'registration')

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'registration_fee_stk_sent',
        resource: 'registration_fee',
        resource_id: user.id,
        meta: { amount: 300, phone: formattedPhone, checkoutRequestId: stkData.CheckoutRequestID },
      })

      return new Response(JSON.stringify({
        message: 'STK Push sent. Check your phone for the M-Pesa prompt.',
        status: 'pending',
        checkout_request_id: stkData.CheckoutRequestID,
      }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ message: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
