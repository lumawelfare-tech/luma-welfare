/**
 * payments-callback — M-Pesa Daraja API callback handler
 *
 * Handles STK Push results from Safaricom with full financial hardening:
 * - Atomic database functions prevent race conditions
 * - Amount validation against expected payment amount
 * - Webhook event deduplication
 * - Financial ledger entries
 * - Payment timeline recording
 * - Reconciliation exception creation for mismatches
 *
 * Security:
 * - Requires MPESA_CALLBACK_SECRET (query ?secret= or x-callback-secret header)
 * - Short-circuits when PAYMENTS_ENABLED !== 'true' (does not mutate financial state)
 * - Always returns 200 to M-Pesa after auth succeeds (it retries on non-200)
 * - Never trusts callback data without validation
 *
 * Idempotency:
 * - checkout_request_id is unique per payment
 * - process_payment_callback_v2() handles duplicate callbacks atomically
 * - webhook_events table tracks all received callbacks
 */

import { corsHeaders } from '../shared/cors.ts'
import { createAdminClient, logAudit } from '../shared/supabase.ts'
import { safeLog } from '../shared/observability.ts'
import { sendNotification } from '../shared/notifications.ts'

type MpesaCallback = {
  Body: {
    stkCallback: {
      MerchantRequestID: string
      CheckoutRequestID: string
      ResultCode: number
      ResultDesc: string
      AccountReference?: string
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value: string | number }>
      }
    }
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** Authenticate Daraja callback via shared secret. Fail closed if unset. */
function authorizeCallback(req: Request): Response | null {
  const expected = Deno.env.get('MPESA_CALLBACK_SECRET')?.trim()
  if (!expected) {
    safeLog('payments-callback', 'MPESA_CALLBACK_SECRET is not configured — rejecting callback')
    return new Response(JSON.stringify({
      message: 'Callback authentication is not configured',
      code: 'SERVICE_UNAVAILABLE',
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const presented =
    url.searchParams.get('secret')?.trim() ||
    req.headers.get('x-callback-secret')?.trim() ||
    ''

  if (!presented || !timingSafeEqual(presented, expected)) {
    return new Response(JSON.stringify({
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return null
}

/** Extract metadata items from M-Pesa callback */
function extractMetadata(items?: Array<{ Name: string; Value: string | number }>): {
  mpesaReceipt: string
  transactionDate: string
  phoneNumber: string
  amount: number | null
} {
  let mpesaReceipt = ''
  let transactionDate = ''
  let phoneNumber = ''
  let amount: number | null = null

  if (items) {
    for (const item of items) {
      if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = String(item.Value)
      if (item.Name === 'TransactionDate') transactionDate = String(item.Value)
      if (item.Name === 'PhoneNumber') phoneNumber = String(item.Value)
      if (item.Name === 'Amount') amount = Number(item.Value)
    }
  }

  return { mpesaReceipt, transactionDate, phoneNumber, amount }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authError = authorizeCallback(req)
  if (authError) return authError

  // Do not mutate financial state while payments are disabled.
  if (Deno.env.get('PAYMENTS_ENABLED') !== 'true') {
    safeLog('payments-callback', 'Payments disabled — acknowledging without processing')
    return new Response(JSON.stringify({ message: 'Payments disabled', code: 'PAYMENTS_DISABLED' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const adminClient = createAdminClient()

  try {
    const body: MpesaCallback = await req.json()
    const { stkCallback } = body.Body
    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      AccountReference,
      CallbackMetadata,
    } = stkCallback

    const meta = extractMetadata(CallbackMetadata?.Item)

    safeLog('payments-callback', 'M-Pesa callback received', {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      callbackAmount: meta.amount,
    })

    // ── Track webhook event for idempotency ──
    const eventId = `${MerchantRequestID}:${CheckoutRequestID}`

    // Check if this event was already processed
    const { data: existingEvent } = await adminClient
      .from('webhook_events')
      .select('id, status')
      .eq('provider', 'mpesa')
      .eq('event_id', eventId)
      .maybeSingle()

    if (existingEvent?.status === 'processed') {
      safeLog('payments-callback', 'Duplicate callback, already processed', { eventId })
      return new Response(JSON.stringify({ message: 'Already processed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Record webhook event (redact phone from stored payload)
    const redactedPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID,
          CheckoutRequestID,
          ResultCode,
          ResultDesc,
          AccountReference,
          CallbackMetadata: meta.amount != null || meta.mpesaReceipt
            ? {
                Item: [
                  ...(meta.mpesaReceipt ? [{ Name: 'MpesaReceiptNumber', Value: meta.mpesaReceipt }] : []),
                  ...(meta.amount != null ? [{ Name: 'Amount', Value: meta.amount }] : []),
                  ...(meta.transactionDate ? [{ Name: 'TransactionDate', Value: meta.transactionDate }] : []),
                ],
              }
            : undefined,
        },
      },
    }

    await adminClient.from('webhook_events').upsert({
      provider: 'mpesa',
      event_id: eventId,
      event_type: 'stk_callback',
      payload: redactedPayload as unknown as Record<string, unknown>,
      status: 'processing',
    }, { onConflict: 'provider,event_id' })

    // ── Determine if this is a registration fee or package payment ──
    const isRegistrationFee = (AccountReference ?? '').startsWith('LUMA-REG-')

    if (isRegistrationFee) {
      const { data: result } = await adminClient
        .rpc('process_registration_fee_callback', {
          p_checkout_request_id: CheckoutRequestID,
          p_mpesa_receipt: meta.mpesaReceipt,
          p_result_code: ResultCode,
          p_result_desc: ResultDesc,
        })

      const success = result?.[0]?.success ?? false
      const memberId = result?.[0]?.member_id

      if (success && memberId) {
        const { data: feeRow } = await adminClient
          .from('registration_fees')
          .select('amount, currency')
          .eq('member_id', memberId)
          .eq('fee_type', 'registration')
          .maybeSingle()
        const paidAmount = feeRow?.amount != null && Number(feeRow.amount) > 0
          ? Number(feeRow.amount)
          : null
        const paidCurrency = feeRow?.currency === 'KES' ? 'KES' : 'KES'

        await sendNotification(adminClient, {
          memberId,
          type: 'payment_confirmed',
          subject: 'Membership Activated',
          body: paidAmount != null
            ? `Your KSh ${paidAmount.toLocaleString('en-KE')} activation payment was successful. Your Luma Welfare membership is now active. You can explore and join welfare packages.`
            : 'Your activation payment was successful. Your Luma Welfare membership is now active. You can explore and join welfare packages.',
          meta: { kind: 'registration_fee', mpesaReceipt: meta.mpesaReceipt },
          emailButtonText: 'Explore Packages',
          emailButtonUrl: 'https://luma-welfare.vercel.app/join',
        })

        if (paidAmount != null) {
          await adminClient.from('financial_ledger').insert({
            transaction_type: 'registration_fee',
            member_id: memberId,
            entry_type: 'credit',
            amount: paidAmount,
            currency: paidCurrency,
            reference: meta.mpesaReceipt,
            description: 'Registration fee payment',
          })
        }

        await logAudit(adminClient, {
          actor_id: memberId,
          action: 'registration_fee_paid',
          resource: 'registration_fee',
          resource_id: memberId,
          meta: { mpesaReceipt: meta.mpesaReceipt, resultDesc: ResultDesc, amount: paidAmount },
        })
      }

      await adminClient
        .from('webhook_events')
        .update({ status: success ? 'processed' : 'failed', processed_at: new Date().toISOString() })
        .eq('provider', 'mpesa')
        .eq('event_id', eventId)
    } else {
      const { data: result } = await adminClient
        .rpc('process_payment_callback_v2', {
          p_checkout_request_id: CheckoutRequestID,
          p_mpesa_receipt: meta.mpesaReceipt,
          p_result_code: ResultCode,
          p_result_desc: ResultDesc,
          p_amount: meta.amount,
          p_transaction_date: meta.transactionDate || undefined,
          p_phone_number: meta.phoneNumber || undefined,
        })

      const paymentResult = result?.[0]
      const success = paymentResult?.success ?? false
      const amountMismatch = paymentResult?.amount_mismatch ?? false

      if (paymentResult?.payment_id) {
        const { data: paymentRow } = await adminClient
          .from('payments')
          .select('member_id')
          .eq('id', paymentResult.payment_id)
          .maybeSingle()

        const memberIdForNotify = paymentRow?.member_id as string | undefined
        if (memberIdForNotify) {
          if (success) {
            await sendNotification(adminClient, {
              memberId: memberIdForNotify,
              type: 'payment_confirmed',
              subject: 'Payment confirmed',
              body: meta.mpesaReceipt
                ? `Your contribution payment was confirmed. M-Pesa receipt: ${meta.mpesaReceipt}.`
                : 'Your contribution payment was confirmed.',
              meta: {
                paymentId: paymentResult.payment_id,
                mpesaReceipt: meta.mpesaReceipt,
              },
            })
          } else {
            await sendNotification(adminClient, {
              memberId: memberIdForNotify,
              type: 'payment_failed',
              subject: 'Payment failed',
              body: ResultDesc
                ? `Your M-Pesa payment could not be completed: ${ResultDesc}. You can try again from your dashboard.`
                : 'Your M-Pesa payment could not be completed. You can try again from your dashboard.',
              meta: {
                paymentId: paymentResult.payment_id,
                resultCode: ResultCode,
              },
            })
          }
        }

        await logAudit(adminClient, {
          actor_id: paymentResult.payment_id,
          action: success ? 'payment_completed' : (amountMismatch ? 'payment_amount_mismatch' : 'payment_failed'),
          resource: 'payment',
          resource_id: paymentResult.payment_id,
          meta: {
            mpesaReceipt: meta.mpesaReceipt,
            resultCode: ResultCode,
            resultDesc: ResultDesc,
            contributionCreated: paymentResult.contribution_created,
            amountMismatch,
            callbackAmount: meta.amount,
          },
        })
      }

      await adminClient
        .from('webhook_events')
        .update({ status: success ? 'processed' : 'failed', processed_at: new Date().toISOString() })
        .eq('provider', 'mpesa')
        .eq('event_id', eventId)
    }

    return new Response(JSON.stringify({ message: 'Callback processed' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    safeLog('payments-callback', 'Callback processing error', {
      error: err instanceof Error ? err.message : 'Unknown error',
    })

    return new Response(JSON.stringify({ message: 'Callback received' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
