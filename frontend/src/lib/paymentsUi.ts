/**
 * Frontend-only payment UI helpers.
 * Server `PAYMENTS_ENABLED` remains the real gate — this never enables Daraja.
 */

export const PAYMENTS_DISABLED_COPY =
  'M-Pesa payments are not enabled yet. You can still use the portal; an admin can verify manual payments.'

export const PAYMENTS_MOCK_COPY =
  'Payment UI mock mode is on. STK is not sent and membership is not activated — preview states only.'

/** Honest activation fee wording while online M-Pesa is off. */
export const ACTIVATION_FEE_HONEST_COPY =
  'A one-time KSh 300 activation fee is required. Online M-Pesa is not live yet — an administrator can verify your fee, or you can try online payment if it has been enabled.'

/** CTA helper: prefer manual contribution path when not in mock preview. */
export const MANUAL_CONTRIBUTION_HINT =
  'Record your contribution in the portal for an administrator to verify. Online M-Pesa STK is not the default path yet.'

/** True when VITE_PAYMENTS_UI_MOCK=true (local/demo only). */
export function isPaymentsUiMock(): boolean {
  return String(import.meta.env.VITE_PAYMENTS_UI_MOCK ?? '').toLowerCase() === 'true'
}

/**
 * Whether the UI should lead with STK / M-Pesa PIN flows.
 * Only mock mode leads with STK; production defaults to honest disabled messaging
 * until the member explicitly tries online payment (server still gates Daraja).
 */
export function preferStkPaymentUi(): boolean {
  return isPaymentsUiMock()
}

export type PaymentFlowStep = 'phone' | 'waiting' | 'success' | 'failed' | 'expired' | 'disabled'
