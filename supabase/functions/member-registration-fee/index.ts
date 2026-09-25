import { handleCors, corsHeaders } from '../shared/cors.ts'
import { getAuthenticatedUser, createAdminClient, logAudit, handleUnexpectedError } from '../shared/supabase.ts'
import {
  loadRegistrationFeeConfig,
  RegistrationFeeConfigError,
} from '../shared/registration-fee.ts'
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

/**
 * Member Registration Fee — Check status, Initiate M-Pesa STK Push, Check status
 *
 * GET  /member-registration-fee           — check registration fee status
 * POST /member-registration-fee           — initiate M-Pesa STK Push (amount from platform_settings)
 * POST /member-registration-fee?action=check-status — poll for payment confirmation
 *
 * Amount is always loaded from platform_settings.registration_fee (fail closed).
 * PAYMENTS_ENABLED must stay false in production until Daraja go-live.
 */

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

      const formattedPhone = formatMpesaPhone(phone)
      if (!formattedPhone.match(/^254[17]\d{8}$/)) {
        return new Response(JSON.stringify({ message: 'Please enter a valid Safaricom phone number (07XXXXXXXX or 2547XXXXXXXX).' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let feeConfig: { amount: number; currency: 'KES' }
      try {
        feeConfig = await loadRegistrationFeeConfig(adminClient)
      } catch (e) {
        const message = e instanceof RegistrationFeeConfigError
          ? 'Registration fee is not configured. Please contact support.'
          : 'Could not load registration fee configuration.'
        return new Response(JSON.stringify({ message, code: 'REGISTRATION_FEE_CONFIG' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Prefer amount already recorded on the member's fee row (historical accuracy)
      const chargeAmount = existing?.amount != null && Number(existing.amount) > 0
        ? Number(existing.amount)
        : feeConfig.amount

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
              amount: feeConfig.amount,
              currency: feeConfig.currency,
              status: 'pending',
              payment_method: 'mpesa',
            })
        }

        await logAudit(adminClient, {
          actor_id: user.id,
          action: 'registration_fee_initiated',
          resource: 'registration_fee',
          resource_id: user.id,
          meta: { amount: chargeAmount, phone: formattedPhone, payments_enabled: false },
        })

        return new Response(JSON.stringify({
          message: 'Payment request recorded. M-Pesa is not yet enabled — an admin will verify your payment.',
          status: 'pending',
          payments_enabled: false,
          registrationFee: { amount: chargeAmount, currency: feeConfig.currency },
        }), {
          status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const runtime = loadMpesaRuntime()
      if (!runtime.ok || !runtime.enabled) {
        return new Response(JSON.stringify({
          message: runtime.ok ? 'Payments are not currently enabled.' : runtime.message,
          code: runtime.ok ? 'PAYMENTS_DISABLED' : runtime.code,
        }), {
          status: runtime.ok ? 403 : 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Create/update fee record as pending
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
            amount: feeConfig.amount,
            currency: feeConfig.currency,
            status: 'pending',
            payment_method: 'mpesa',
          })
      }

      const accessToken = await getDarajaAccessToken(runtime)
      const timestamp = generateMpesaTimestamp()
      const password = generateMpesaPassword(runtime.shortcode, runtime.passkey, timestamp)

      let checkoutRequestId: string
      try {
        const stk = await sendStkPush(runtime, accessToken, {
          BusinessShortCode: runtime.shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: chargeAmount,
          PartyA: formattedPhone,
          PartyB: runtime.shortcode,
          PhoneNumber: formattedPhone,
          CallBackURL: runtime.callbackUrl,
          AccountReference: `LUMA-REG-${user.id.slice(0, 8)}`,
          TransactionDesc: `Luma Welfare - KSh ${chargeAmount} Activation Fee`,
        })
        checkoutRequestId = stk.checkoutRequestId
      } catch (stkErr) {
        const kind = stkErr instanceof DarajaRequestError ? stkErr.kind : 'stk'
        await adminClient
          .from('registration_fees')
          .update({ status: 'failed' })
          .eq('member_id', user.id)
          .eq('fee_type', 'registration')

        return new Response(JSON.stringify({
          message: darajaUserMessage(kind === 'stk' ? 'stk_rejected' : kind),
          code: 'STK_FAILED',
        }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await adminClient
        .from('registration_fees')
        .update({ transaction_reference: checkoutRequestId })
        .eq('member_id', user.id)
        .eq('fee_type', 'registration')

      await logAudit(adminClient, {
        actor_id: user.id,
        action: 'registration_fee_stk_sent',
        resource: 'registration_fee',
        resource_id: user.id,
        meta: { amount: chargeAmount, phone: formattedPhone, checkoutRequestId, mpesaEnv: runtime.env },
      })

      return new Response(JSON.stringify({
        message: 'STK Push sent. Check your phone for the M-Pesa prompt.',
        status: 'pending',
        checkout_request_id: checkoutRequestId,
      }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    if (err instanceof DarajaRequestError) {
      return new Response(JSON.stringify({
        message: darajaUserMessage(err.kind),
        code: 'STK_FAILED',
      }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (err instanceof RegistrationFeeConfigError) {
      return new Response(JSON.stringify({
        message: 'Registration fee is not configured. Please contact support.',
        code: 'REGISTRATION_FEE_CONFIG',
      }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return handleUnexpectedError(err, 'member-registration-fee')
  }
})
