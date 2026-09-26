/**
 * Frontend-only payment UI helpers.
 * Server `PAYMENTS_ENABLED` remains the real gate — this never enables Daraja.
 */

export const PAYMENTS_DISABLED_COPY =
  'M-Pesa payments are not enabled yet. You can still use the portal; an admin can verify manual payments.'

export const PAYMENTS_ENABLED_COPY =
  'M-Pesa payments are on. Pay your activation fee or contribution online with an STK push, or keep recording manually for admin verification.'

export const PAYMENTS_MOCK_COPY =
  'Payment UI mock mode is on. STK is not sent and membership is not activated — preview states only.'

/** Label for the sandbox/test-mode chip shown when live payments run against Daraja sandbox. */
export const PAYMENTS_SANDBOX_BADGE = 'Sandbox test mode'

function feeLabelFor(amountKes?: number | null): string {
  const amount = amountKes != null && Number.isFinite(amountKes) && amountKes > 0
    ? Math.trunc(amountKes)
    : null
  return amount != null
    ? `one-time KSh ${amount.toLocaleString('en-KE')} activation fee`
    : 'one-time activation fee'
}

/** Honest activation fee wording while online M-Pesa is off. Prefer amount from the member's fee record when known. */
export function activationFeeHonestCopy(amountKes?: number | null): string {
  return `A ${feeLabelFor(amountKes)} is required. Online M-Pesa is not live yet — an administrator can verify your fee, or you can try online payment if it has been enabled.`
}

/** Activation fee wording that follows the real server gate instead of assuming payments are off. */
export function activationFeeCopy(serverPaymentsEnabled: boolean, amountKes?: number | null): string {
  if (serverPaymentsEnabled) {
    return `A ${feeLabelFor(amountKes)} is required. Pay online with M-Pesa STK push, or ask an administrator to verify a manual payment.`
  }
  return activationFeeHonestCopy(amountKes)
}

/**
 * The three states the payments banner can reflect.
 * - `mock`: local preview flag only; no real STK is sent.
 * - `enabled`: server reported `payments_enabled === true`.
 * - `disabled`: server reported otherwise (or has not reported yet).
 */
export type PaymentsMode = 'mock' | 'enabled' | 'disabled'

/**
 * Resolve the banner state. The server flag is the source of truth; the local
 * mock flag only ever wins because it is a preview affordance.
 */
export function resolvePaymentsMode(serverPaymentsEnabled?: boolean): PaymentsMode {
  if (isPaymentsUiMock()) return 'mock'
  return serverPaymentsEnabled === true ? 'enabled' : 'disabled'
}

/** True only when payments are genuinely on and running against the Daraja sandbox. */
export function isSandboxPayments(serverPaymentsEnabled?: boolean, mpesaEnvironment?: string | null): boolean {
  return serverPaymentsEnabled === true && mpesaEnvironment === 'sandbox'
}

/** @deprecated Prefer activationFeeHonestCopy(amount) with the stored/configured fee when available. */
export const ACTIVATION_FEE_HONEST_COPY = activationFeeHonestCopy(300)

/** CTA helper: prefer manual contribution path when not in mock preview. */
export const MANUAL_CONTRIBUTION_HINT =
  'Record your contribution in the portal for an administrator to verify. Online M-Pesa STK is not the default path yet.'

/** True when VITE_PAYMENTS_UI_MOCK=true (local/demo only). */
export function isPaymentsUiMock(): boolean {
  return String(import.meta.env.VITE_PAYMENTS_UI_MOCK ?? '').toLowerCase() === 'true'
}

/**
 * Whether the UI should lead with STK / M-Pesa PIN flows.
 * Leads with STK when the local mock preview is on, or when the server reports
 * payments enabled; otherwise the UI defaults to honest disabled messaging
 * (the server still gates Daraja either way).
 */
export function preferStkPaymentUi(serverPaymentsEnabled = false): boolean {
  return isPaymentsUiMock() || serverPaymentsEnabled === true
}

export type PaymentFlowStep = 'phone' | 'waiting' | 'success' | 'failed' | 'expired' | 'disabled'
