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

/** List-style national ID mask: bullets + last 4 only (never full ID in list payloads). */
export function maskIdNumberLast4(value: string | null | undefined): string {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')
  if (!digits) return '—'
  if (digits.length < 4) return '••••'
  return `••••${digits.slice(-4)}`
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

/**
 * Nested member blobs on contributions/subscriptions lists: mask phone + id.
 * Admin members list uses prepareMemberListRow instead (full phone, masked id only).
 * Uses Record (not a generic T) so Deno/tsc allow property writes after `in` checks.
 */
export function maskMemberListFields(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...row }
  if ('phone' in next && typeof next.phone === 'string') {
    next.phone = maskPhone(next.phone)
  }
  if ('id_number' in next && typeof next.id_number === 'string') {
    next.id_number = maskIdNumberLast4(next.id_number)
  }
  if ('alt_phone' in next && typeof next.alt_phone === 'string') {
    next.alt_phone = maskPhone(next.alt_phone)
  }
  if ('members' in next && next.members && typeof next.members === 'object') {
    next.members = maskMemberListFields(next.members as Record<string, unknown>)
  }
  return next
}

/**
 * Admin members list row: keep full phone for admin ops; never send full id_number.
 * Anonymized shells are flagged explicitly (not as "incomplete profile").
 */
export function prepareMemberListRow(row: Record<string, unknown>): Record<string, unknown> {
  const idRaw = typeof row.id_number === 'string' ? row.id_number.trim() : ''
  const anonymizedAt = row.anonymized_at ?? null
  const isAnonymized = anonymizedAt != null && anonymizedAt !== ''
  const kraRaw = typeof row.kra_pin === 'string' ? row.kra_pin.trim() : ''
  const {
    id_number: _omitId,
    alt_phone: _omitAlt,
    kra_pin: _omitKra,
    ...rest
  } = row
  return {
    ...rest,
    anonymized_at: anonymizedAt,
    id_number_masked: isAnonymized ? '—' : maskIdNumberLast4(idRaw || null),
    kra_pin_masked: isAnonymized ? '—' : maskIdNumberLast4(kraRaw || null),
    profile_incomplete: isAnonymized ? false : !idRaw,
    is_anonymized: isAnonymized,
  }
}

export function maskKraPin(value: string | null | undefined): string {
  return maskIdNumberLast4(value)
}

/** Drop raw kra_pin from an Edge member payload. Own-data export may still include it. */
export function stripMemberKraPin(
  member: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!member) return null
  const { kra_pin: kraRaw, ...rest } = member
  return {
    ...rest,
    kra_pin_masked: maskIdNumberLast4(typeof kraRaw === 'string' ? kraRaw : null),
  }
}
