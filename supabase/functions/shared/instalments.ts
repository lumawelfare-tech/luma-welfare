/**
 * Deno copy of frontend/src/lib/instalments.ts — keep in sync.
 */

export function roundKes(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

export function remainingToRecord(required: number, reserved: number): number {
  return Math.max(0, roundKes(required) - roundKes(reserved))
}

export function isPeriodFullyPaid(required: number, verifiedPaid: number): boolean {
  const need = roundKes(required)
  if (need <= 0) return false
  return roundKes(verifiedPaid) >= need
}

export function assertInstalmentAmount(
  amount: number,
  remaining: number,
): { ok: true } | { ok: false; code: 'AMOUNT_INVALID' | 'OVERPAYMENT'; message: string } {
  const amt = roundKes(amount)
  const rem = roundKes(remaining)
  if (!(amt > 0)) {
    return { ok: false, code: 'AMOUNT_INVALID', message: 'Amount must be greater than zero.' }
  }
  if (amt > rem) {
    return {
      ok: false,
      code: 'OVERPAYMENT',
      message: `Amount exceeds remaining balance of KSh ${rem.toLocaleString('en-KE')}.`,
    }
  }
  return { ok: true }
}

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function isValidContributionPeriod(period: unknown): period is string {
  return typeof period === 'string' && PERIOD_RE.test(period)
}

export function mapInstalmentRpcError(err: unknown): { status: number; code: string; message: string } {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const code = raw.replace(/^.*ERROR:\s*/i, '').split(/\s/)[0] ?? raw
  switch (code) {
    case 'REGISTRATION_FEE_REQUIRED':
      return { status: 403, code, message: 'You must pay the registration activation fee before recording package contributions.' }
    case 'SUBSCRIPTION_INACTIVE':
      return { status: 409, code, message: 'Package not active yet.' }
    case 'SUBSCRIPTION_NOT_FOUND':
      return { status: 404, code, message: 'Subscription not found.' }
    case 'OVERPAYMENT':
      return { status: 400, code, message: 'Amount exceeds the remaining balance for this period.' }
    case 'AMOUNT_INVALID':
      return { status: 400, code, message: 'Amount must be greater than zero and within the remaining balance.' }
    case 'PERIOD_INVALID':
      return { status: 400, code, message: 'Period must be YYYY-MM.' }
    default:
      return { status: 500, code: 'INTERNAL', message: 'Could not record instalment.' }
  }
}
