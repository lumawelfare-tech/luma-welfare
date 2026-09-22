/**
 * Best-effort session persistence for post-register Verify Email confirmation.
 * Application number must originate from the server response — never fabricate.
 */

export const PENDING_APPLICATION_STORAGE_KEY = 'luma.pendingApplication'

export type PendingApplication = {
  email: string
  applicationNumber: string
  registrationFee?: { amount: number; currency: string }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

export function parsePendingApplication(raw: unknown): PendingApplication | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (!isNonEmptyString(o.email) || !isNonEmptyString(o.applicationNumber)) return null
  const email = o.email.trim().toLowerCase()
  const applicationNumber = o.applicationNumber.trim()
  // Reject client-fabricated shapes that look unlike server LUMA-APP-* numbers
  if (!/^LUMA-APP-\d{8}-\d{5}$/i.test(applicationNumber)) return null

  let registrationFee: PendingApplication['registrationFee']
  if (o.registrationFee != null && typeof o.registrationFee === 'object' && !Array.isArray(o.registrationFee)) {
    const fee = o.registrationFee as Record<string, unknown>
    const amount = typeof fee.amount === 'number' ? fee.amount : Number(fee.amount)
    const currency = typeof fee.currency === 'string' ? fee.currency.trim().toUpperCase() : ''
    if (Number.isFinite(amount) && amount > 0 && currency === 'KES') {
      registrationFee = { amount: Math.trunc(amount), currency: 'KES' }
    }
  }

  return { email, applicationNumber, registrationFee }
}

export function readPendingApplication(): PendingApplication | null {
  try {
    const raw = sessionStorage.getItem(PENDING_APPLICATION_STORAGE_KEY)
    if (!raw) return null
    return parsePendingApplication(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function writePendingApplication(data: PendingApplication): void {
  const parsed = parsePendingApplication(data)
  if (!parsed) return
  try {
    sessionStorage.setItem(PENDING_APPLICATION_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // private mode / quota — ignore; Router state may still work
  }
}

export function clearPendingApplication(): void {
  try {
    sessionStorage.removeItem(PENDING_APPLICATION_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Prefer router state, then sessionStorage matching email (if known). */
export function resolvePendingApplication(opts: {
  stateEmail?: string | null
  stateApplicationNumber?: string | null
  stateRegistrationFee?: { amount: number; currency: string } | null
}): PendingApplication | null {
  const fromState = parsePendingApplication({
    email: opts.stateEmail,
    applicationNumber: opts.stateApplicationNumber,
    registrationFee: opts.stateRegistrationFee ?? undefined,
  })
  if (fromState) {
    writePendingApplication(fromState)
    return fromState
  }

  const stored = readPendingApplication()
  if (!stored) return null
  const stateEmail = opts.stateEmail?.trim().toLowerCase()
  if (stateEmail && stored.email !== stateEmail) return null
  return stored
}
