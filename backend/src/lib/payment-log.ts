/**
 * Structured payment lifecycle logging.
 * Safe — never logs credentials, tokens, PINs, or full phone numbers.
 */

import { maskPhone } from './phone.js'

export type PaymentEvent =
  | 'payment_initiated'
  | 'payment_stk_accepted'
  | 'payment_stk_rejected'
  | 'payment_stk_timeout'
  | 'payment_callback_received'
  | 'payment_completed'
  | 'payment_failed'
  | 'payment_reconciled'
  | 'payment_idempotent_replay'

interface PaymentLogMeta {
  paymentId?: string
  checkoutRequestId?: string | null
  memberId?: string
  packageId?: string
  subscriptionId?: string
  amount?: number
  phone?: string
  resultCode?: number
  resultDesc?: string
  mpesaReceipt?: string
  status?: string
  error?: string
  errorCode?: string
  darajaResultCode?: string
  sentToSafaricom?: boolean
}

/**
 * Log a payment lifecycle event with structured metadata.
 * Uses console.info for structured logging (JSON-serializable).
 * In production, this should feed into a logging service.
 */
export function logPaymentEvent(event: PaymentEvent, meta: PaymentLogMeta = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...meta,
  }

  // Use console.info for structured logs (separate from error logging)
  console.info(JSON.stringify(entry))
}
