/**
 * Frontend-only payment UI helpers.
 * Server `PAYMENTS_ENABLED` remains the real gate — this never enables Daraja.
 */

export const PAYMENTS_DISABLED_COPY =
  'M-Pesa payments are not enabled yet. You can still use the portal; an admin can verify manual payments.'

export const PAYMENTS_MOCK_COPY =
  'Payment UI mock mode is on. STK is not sent and membership is not activated — preview states only.'

/** True when VITE_PAYMENTS_UI_MOCK=true (local/demo only). */
export function isPaymentsUiMock(): boolean {
  return String(import.meta.env.VITE_PAYMENTS_UI_MOCK ?? '').toLowerCase() === 'true'
}

export type PaymentFlowStep = 'phone' | 'waiting' | 'success' | 'failed' | 'expired' | 'disabled'
