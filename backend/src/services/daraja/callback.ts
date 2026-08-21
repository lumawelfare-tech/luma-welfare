import type { StkCallbackBody, QueueTimeoutBody, ParsedCallback } from './types.js'

// ──────────────────────────────────────────────────────
// Callback payload parsing and validation
// ──────────────────────────────────────────────────────

/** Extract the checkout request ID from any callback body. */
export function extractCheckoutId(body: unknown): string | null {
  const b = body as Record<string, unknown>
  if (b?.Body) {
    const inner = b.Body as Record<string, unknown>
    if (inner.stkCallback) {
      return (inner.stkCallback as Record<string, unknown>).CheckoutRequestID as string
    }
    if (inner.QueueTimeout) {
      return (inner.QueueTimeout as Record<string, unknown>).TransactionID as string
    }
  }
  return null
}

/** Determine if this is an STK callback vs queue timeout. */
export function isStkCallback(body: unknown): boolean {
  const b = body as Record<string, unknown>
  return !!(b?.Body && (b.Body as Record<string, unknown>).stkCallback)
}

/** Parse an STK Push callback into a clean structure. */
export function parseStkCallback(body: unknown): ParsedCallback | null {
  const b = body as StkCallbackBody
  const cb = b?.Body?.stkCallback
  if (!cb) return null

  const result: ParsedCallback = {
    checkoutRequestId: cb.CheckoutRequestID,
    merchantRequestId: cb.MerchantRequestID,
    resultCode: cb.ResultCode,
    resultDesc: cb.ResultDesc,
  }

  // Extract metadata items if present (successful payment)
  if (cb.CallbackMetadata?.Item) {
    for (const item of cb.CallbackMetadata.Item) {
      switch (item.Name) {
        case 'Amount':
          result.amount = item.Value as number
          break
        case 'MpesaReceiptNumber':
          result.mpesaReceiptNumber = item.Value as string
          break
        case 'TransactionDate':
          result.transactionDate = String(item.Value)
          break
        case 'PhoneNumber':
          result.phoneNumber = String(item.Value)
          break
      }
    }
  }

  return result
}

/** Parse a queue timeout callback. */
export function parseQueueTimeout(body: unknown): {
  transactionId: string
  reason: string
} | null {
  const b = body as QueueTimeoutBody
  const qt = b?.Body?.QueueTimeout
  if (!qt) return null
  return {
    transactionId: qt.TransactionID,
    reason: qt.Reason,
  }
}

/**
 * Validate callback structure.
 * Returns null if valid, error message if invalid.
 */
export function validateCallbackBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body is missing or not an object'
  }
  const b = body as Record<string, unknown>
  if (!b.Body || typeof b.Body !== 'object') {
    return 'Missing Body property'
  }
  const inner = b.Body as Record<string, unknown>
  if (!inner.stkCallback && !inner.QueueTimeout) {
    return 'Missing stkCallback or QueueTimeout in Body'
  }
  if (inner.stkCallback) {
    const cb = inner.stkCallback as Record<string, unknown>
    if (!cb.CheckoutRequestID || cb.ResultCode === undefined) {
      return 'Missing CheckoutRequestID or ResultCode in stkCallback'
    }
  }
  return null
}
