/**
 * PII masking / redaction helpers for Edge responses and logs.
 * Keep in sync with frontend/src/lib/pii.ts
 */

export function maskPhone(value: string | null | undefined): string {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')
  if (digits.length < 4) return '••••'
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}

export function maskIdNumber(value: string | null | undefined): string {
  if (!value) return '—'
  const trimmed = value.trim()
  if (trimmed.length <= 2) return '••'
  if (trimmed.length <= 4) return `${trimmed[0]}${'•'.repeat(trimmed.length - 2)}${trimmed.slice(-1)}`
  return `${trimmed.slice(0, 2)}${'•'.repeat(trimmed.length - 4)}${trimmed.slice(-2)}`
}

export function maskEmail(value: string | null | undefined): string {
  if (!value) return '—'
  const at = value.indexOf('@')
  if (at <= 1) return '•••@•••'
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'•'.repeat(Math.max(1, local.length - visible.length))}@${domain}`
}

/** Mask phone/id on nested member objects used in admin list payloads. */
export function maskMemberListFields<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  if ('phone' in next && typeof next.phone === 'string') {
    next.phone = maskPhone(next.phone)
  }
  if ('id_number' in next && typeof next.id_number === 'string') {
    next.id_number = maskIdNumber(next.id_number)
  }
  if ('alt_phone' in next && typeof next.alt_phone === 'string') {
    next.alt_phone = maskPhone(next.alt_phone)
  }
  if ('members' in next && next.members && typeof next.members === 'object') {
    next.members = maskMemberListFields(next.members as Record<string, unknown>)
  }
  return next
}
