import { darajaBaseUrl, type DarajaConfig } from './config.js'
import { getAccessToken } from './oauth.js'
import type { DarajaResult, StkPushRequest, StkPushResponse } from './types.js'

// ──────────────────────────────────────────────────────
// STK Push (Lipa Na M-Pesa Online)
// ──────────────────────────────────────────────────────

/** Generate the Daraja password from shortcode + passkey + timestamp. */
function generatePassword(
  shortcode: string,
  passkey: string,
  timestamp: string,
): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')
}

/** Format current time as Daraja timestamp: YYYYMMDDHHmmss */
function darajaTimestamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

/** Normalize Kenyan phone: 07XXXXXXXX → 2547XXXXXXXX */
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '')
  if (cleaned.startsWith('254')) return cleaned
  if (cleaned.startsWith('0')) return '254' + cleaned.slice(1)
  if (cleaned.startsWith('+254')) return cleaned.slice(1)
  return cleaned
}

export interface InitiateStkPushInput {
  phone: string
  amount: number
  accountReference: string
  transactionDesc: string
}

/**
 * Initiate an M-Pesa STK Push request.
 *
 * This does NOT mark any payment as completed. The caller must:
 * 1. Create a Pending payment record before calling this
 * 2. Handle the callback asynchronously to update status
 */
export async function initiateStkPush(
  config: DarajaConfig,
  input: InitiateStkPushInput,
): Promise<DarajaResult<StkPushResponse>> {
  // 1. Get OAuth token
  const tokenResult = await getAccessToken(config)
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error, errorCode: tokenResult.errorCode }
  }

  // 2. Build request
  const timestamp = darajaTimestamp()
  const password = generatePassword(config.shortcode, config.passkey, timestamp)
  const phone = normalizePhone(input.phone)

  const requestBody: StkPushRequest = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(input.amount),
    PartyA: phone,
    PartyB: config.shortcode,
    PhoneNumber: phone,
    CallBackURL: config.callbackUrl,
    AccountReference: input.accountReference,
    TransactionDesc: input.transactionDesc,
  }

  // 3. Send STK Push
  const base = darajaBaseUrl(config.env)
  try {
    const resp = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.data}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const data = (await resp.json()) as StkPushResponse

    if (resp.ok && data.ResponseCode === '0') {
      return { success: true, data }
    }

    return {
      success: false,
      error: data.ResponseDescription || 'STK Push failed',
      errorCode: data.ResponseCode,
    }
  } catch (err) {
    return {
      success: false,
      error: `STK Push request exception: ${err instanceof Error ? err.message : 'unknown'}`,
      errorCode: 'STK_EXCEPTION',
    }
  }
}
