/**
 * Daraja Transaction Status Query
 *
 * Used for reconciliation when a callback is lost or delayed.
 * Queries Safaricom's system for the actual status of an STK Push transaction.
 *
 * Uses the same Daraja OAuth mechanism — never exposes credentials.
 * Server-side only.
 */

import { darajaBaseUrl, type DarajaConfig } from './config.js'
import { getAccessToken } from './oauth.js'
import type { DarajaResult } from './types.js'

// ──────────────────────────────────────────────────────
// Transaction Status Query
// ──────────────────────────────────────────────────────

export interface TransactionStatusResult {
  ResponseCode: string
  ResponseDescription: string
  MerchantRequestID: string
  CheckoutRequestID: string
  ResultCode: string
  ResultDescription: string
}

/**
 * Query the status of an STK Push transaction from Daraja.
 *
 * @param config - Daraja configuration
 * @param checkoutRequestId - The CheckoutRequestID from the original STK Push
 * @returns Daraja transaction status
 */
export async function queryTransactionStatus(
  config: DarajaConfig,
  checkoutRequestId: string,
): Promise<DarajaResult<TransactionStatusResult>> {
  // 1. Get OAuth token
  const tokenResult = await getAccessToken(config)
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error, errorCode: tokenResult.errorCode }
  }

  // 2. Build request
  const requestBody = {
    BusinessShortCode: config.shortcode,
    CheckoutRequestID: checkoutRequestId,
    ResultCode: '',
    ResultDesc: '',
  }

  // 3. Send request
  const base = darajaBaseUrl(config.env)
  try {
    const resp = await fetch(`${base}/mpesa/transactionstatus/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.data}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const data = (await resp.json()) as TransactionStatusResult

    if (resp.ok && data.ResponseCode === '0') {
      return { success: true, data }
    }

    return {
      success: false,
      error: data.ResponseDescription || 'Transaction status query failed',
      errorCode: data.ResponseCode,
    }
  } catch (err) {
    return {
      success: false,
      error: `Transaction status query exception: ${err instanceof Error ? err.message : 'unknown'}`,
      errorCode: 'STATUS_QUERY_EXCEPTION',
    }
  }
}
