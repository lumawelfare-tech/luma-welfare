// ──────────────────────────────────────────────────────
// Daraja API request/response types
// ──────────────────────────────────────────────────────

// OAuth
export interface DarajaTokenResponse {
  access_token: string
  expires_in: string
}

// STK Push request (Lipa Na M-Pesa Online)
export interface StkPushRequest {
  BusinessShortCode: string
  Password: string
  Timestamp: string
  TransactionType: string
  Amount: number
  PartyA: string
  PartyB: string
  PhoneNumber: string
  CallBackURL: string
  AccountReference: string
  TransactionDesc: string
}

export interface StkPushResponse {
  MerchantRequestID: string
  CheckoutRequestID: string
  ResponseCode: string
  ResponseDescription: string
  CustomerMessage: string
}

// STK Push callback
export interface StkCallback {
  MerchantRequestID: string
  CheckoutRequestID: string
  ResultCode: number
  ResultDesc: string
}

export interface StkCallbackMetadata {
  Item: Array<{ Name: string; Value: string | number }>
}

export interface StkCallbackBody {
  Body: {
    stkCallback: StkCallback & {
      CallbackMetadata?: StkCallbackMetadata
    }
  }
}

// Queue Timeout callback
export interface QueueTimeoutBody {
  Body: {
    QueueTimeout: {
      TransactionID: string
      TransactionType: string
      OriginationTime: string
      Reason: string
      DialogueSet: string
    }
  }
}

// Result types
export interface DarajaResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
}

// Parsed callback result
export interface ParsedCallback {
  checkoutRequestId: string
  merchantRequestId: string
  resultCode: number
  resultDesc: string
  amount?: number
  mpesaReceiptNumber?: string
  transactionDate?: string
  phoneNumber?: string
}
