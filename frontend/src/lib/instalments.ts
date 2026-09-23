/**
 * Lipa Pole Pole helpers — monthly remaining-balance math.
 * Authoritative recording happens in Postgres (`record_contribution_instalment`).
 */

export function roundKes(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

/** Remaining that may still be recorded (verified + pending reserved). */
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

export function progressPercent(required: number, verifiedPaid: number): number {
  const need = roundKes(required)
  if (need <= 0) return 0
  return Math.min(100, Math.round((roundKes(verifiedPaid) / need) * 100))
}
