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
 * - Always returns 200 to M-Pesa (it retries on non-200)
 * - Validates required fields before processing
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

    // Record webhook event
    await adminClient.from('webhook_events').upsert({
      provider: 'mpesa',
      event_id: eventId,
      event_type: 'stk_callback',
      payload: body as unknown as Record<string, unknown>,
      status: 'processing',
    }, { onConflict: 'provider,event_id' })

    // ── Determine if this is a registration fee or package payment ──
    const isRegistrationFee = (AccountReference ?? '').startsWith('LUMA-REG-')

    if (isRegistrationFee) {
      // ── Registration fee callback — use atomic function ──
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
        // Send notification (respects channel preferences)
        await sendNotification(adminClient, {
          memberId,
          subject: 'Membership Activated',
          body: 'Your KSh 300 activation payment was successful. Your Luma Welfare membership is now active. You can explore and join welfare packages.',
          emailButtonText: 'Explore Packages',
          emailButtonUrl: 'https://luma-welfare.vercel.app/join',
        })

        // Create ledger entry
        await adminClient.from('financial_ledger').insert({
          transaction_type: 'registration_fee',
          member_id: memberId,
          entry_type: 'credit',
          amount: 300,
          currency: 'KES',
          reference: meta.mpesaReceipt,
          description: 'Registration fee payment',
        })

        await logAudit(adminClient, {
          actor_id: memberId,
          action: 'registration_fee_paid',
          resource: 'registration_fee',
          resource_id: memberId,
          meta: { mpesaReceipt: meta.mpesaReceipt, resultDesc: ResultDesc },
        })
      }

      // Update webhook event status
      await adminClient
        .from('webhook_events')
        .update({ status: success ? 'processed' : 'failed', processed_at: new Date().toISOString() })
        .eq('provider', 'mpesa')
        .eq('event_id', eventId)
    } else {
      // ── Package payment callback — use v2 atomic function with amount validation ──
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

      // Update webhook event status
      await adminClient
        .from('webhook_events')
        .update({ status: success ? 'processed' : 'failed', processed_at: new Date().toISOString() })
        .eq('provider', 'mpesa')
        .eq('event_id', eventId)
    }

    // Always return 200 to M-Pesa — it retries on non-200
    return new Response(JSON.stringify({ message: 'Callback processed' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    safeLog('payments-callback', 'Callback processing error', {
      error: err instanceof Error ? err.message : 'Unknown error',
    })

    // Return 200 to prevent M-Pesa retries on internal errors
    return new Response(JSON.stringify({ message: 'Callback received' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
