/**
 * payments-callback
 *
 * Handles the M-Pesa Daraja API callback (C2B / STK Push result).
 * Safaricom sends the payment result to this endpoint after the user
 * completes or cancels the STK Push prompt on their phone.
 *
 * This function is called by the Daraja API — no user JWT required.
 * It uses the service-role key (via createAdminClient) to update
 * payment and contribution records.
 */
import { corsHeaders } from '../shared/cors.ts'
import { createAdminClient, logAudit } from '../shared/supabase.ts'

type MpesaCallback = {
  Body: {
    stkCallback: {
      MerchantRequestID: string
      CheckoutRequestID: string
      ResultCode: number
      ResultDesc: string
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value: string | number }>
      }
    }
  }
}

Deno.serve(async (req) => {
  // M-Pesa callback is always POST
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body: MpesaCallback = await req.json()
    const { stkCallback } = body.Body
    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = stkCallback

    console.log('M-Pesa callback received:', {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
    })

    const adminClient = createAdminClient()

    // Check if this is a registration fee payment (account reference starts with LUMA-REG-)
    const accountRef = stkCallback.AccountReference ?? ''
    const isRegistrationFee = accountRef.startsWith('LUMA-REG-')

    if (isRegistrationFee) {
      // Handle registration fee callback
      const memberIds = accountRef.replace('LUMA-REG-', '')
      let mpesaReceipt = ''
      let transactionDate = ''
      let phoneNumber = ''

      if (CallbackMetadata?.Item) {
        for (const item of CallbackMetadata.Item) {
          if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = String(item.Value)
          if (item.Name === 'TransactionDate') transactionDate = String(item.Value)
          if (item.Name === 'PhoneNumber') phoneNumber = String(item.Value)
        }
      }

      if (ResultCode === 0) {
        // Find the registration fee record by checkout_request_id
        const { data: regFee } = await adminClient
          .from('registration_fees')
          .select('id, member_id, status')
          .eq('transaction_reference', CheckoutRequestID)
          .eq('fee_type', 'registration')
          .maybeSingle()

        if (regFee && regFee.status !== 'paid') {
          await adminClient
            .from('registration_fees')
            .update({
              status: 'paid',
              mpesa_receipt: mpesaReceipt,
              paid_at: new Date().toISOString(),
            })
            .eq('id', regFee.id)

          // Notify member
          await adminClient.from('notifications').insert({
            member_id: regFee.member_id,
            channel: 'in_app',
            subject: 'Membership Activated',
            body: 'Your KSh 300 activation payment was successful. Your Luma Welfare membership is now active. You can explore and join welfare packages.',
            status: 'queued',
          })

          await logAudit(adminClient, {
            actor_id: regFee.member_id,
            action: 'registration_fee_paid',
            resource: 'registration_fee',
            resource_id: regFee.id,
            meta: { mpesaReceipt, resultDesc: ResultDesc },
          })

          console.log('Registration fee paid:', regFee.id, 'Receipt:', mpesaReceipt)
        }
      } else {
        console.log('Registration fee callback failed:', CheckoutRequestID, 'Code:', ResultCode)
      }

      return new Response(JSON.stringify({ message: 'Callback processed' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find the payment by checkout_request_id (regular package payment)
    const { data: payment, error: findError } = await adminClient
      .from('payments')
      .select('id, member_id, subscription_id, package_id, amount, status')
      .eq('checkout_request_id', CheckoutRequestID)
      .single()

    if (findError || !payment) {
      console.error('Payment not found for CheckoutRequestID:', CheckoutRequestID, findError?.message)
      // Return 200 to prevent M-Pesa from retrying
      return new Response(JSON.stringify({ message: 'Payment not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Extract metadata if available
    let mpesaReceipt = ''
    let transactionDate = ''
    let phoneNumber = ''

    if (CallbackMetadata?.Item) {
      for (const item of CallbackMetadata.Item) {
        if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = String(item.Value)
        if (item.Name === 'TransactionDate') transactionDate = String(item.Value)
        if (item.Name === 'PhoneNumber') phoneNumber = String(item.Value)
      }
    }

    if (ResultCode === 0) {
      // Payment successful
      const { error: updateError } = await adminClient
        .from('payments')
        .update({
          status: 'Completed',
          mpesa_receipt: mpesaReceipt,
          transaction_date: transactionDate || null,
          phone: phoneNumber || undefined,
        })
        .eq('id', payment.id)

      if (updateError) {
        console.error('Failed to update payment:', updateError.message)
        return new Response(JSON.stringify({ message: 'Update failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Auto-create a contribution record for this payment
      // Determine the current period (YYYY-MM)
      const now = new Date()
      const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

      // Check if contribution already exists for this subscription + period
      const { data: existingContrib } = await adminClient
        .from('contributions')
        .select('id')
        .eq('subscription_id', payment.subscription_id)
        .eq('period', currentPeriod)
        .maybeSingle()

      if (!existingContrib) {
        const { error: contribError } = await adminClient
          .from('contributions')
          .insert({
            subscription_id: payment.subscription_id,
            member_id: payment.member_id,
            package_id: payment.package_id,
            period: currentPeriod,
            amount: payment.amount,
            status: 'Paid',
            payment_id: payment.id,
            recorded_by: payment.member_id,
          })

        if (contribError) {
          console.error('Failed to create contribution:', contribError.message)
        }
      }

      await logAudit(adminClient, {
        actor_id: payment.member_id,
        action: 'payment_completed',
        resource: 'payment',
        resource_id: payment.id,
        meta: { mpesaReceipt, resultDesc: ResultDesc },
      })

      console.log('Payment completed:', payment.id, 'Receipt:', mpesaReceipt)
    } else {
      // Payment failed or cancelled
      const statusMap: Record<number, string> = {
        1032: 'Cancelled',    // Request cancelled by user
        1037: 'Timeout',      // User timed out
        2001: 'Failed',       // Invalid credentials
        2026: 'Failed',       // Debt amount exceeded
      }

      const newStatus = statusMap[ResultCode] ?? 'Failed'

      const { error: updateError } = await adminClient
        .from('payments')
        .update({
          status: newStatus,
          failure_reason: ResultDesc,
        })
        .eq('id', payment.id)

      if (updateError) {
        console.error('Failed to update failed payment:', updateError.message)
      }

      await logAudit(adminClient, {
        actor_id: payment.member_id,
        action: 'payment_failed',
        resource: 'payment',
        resource_id: payment.id,
        meta: { resultCode: ResultCode, resultDesc: ResultDesc },
      })

      console.log('Payment failed:', payment.id, 'Code:', ResultCode, 'Reason:', ResultDesc)
    }

    // Always return 200 to M-Pesa — it retries on non-200
    return new Response(JSON.stringify({ message: 'Callback processed' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Callback processing error:', err)
    // Return 200 to prevent M-Pesa retries on internal errors
    return new Response(JSON.stringify({ message: 'Callback received' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
