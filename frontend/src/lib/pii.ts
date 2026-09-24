/**
 * PII masking helpers for admin UI lists. Keep in sync with supabase/functions/shared/pii.ts
 */

export function maskPhone(value: string | null | undefined): string {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')
  if (digits.length < 4) return '••••'
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}

/** List-style national ID mask: bullets + last 4 digits only. */
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

export function maskKraPin(value: string | null | undefined): string {
  return maskIdNumberLast4(value)
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

/** Display empty email safely (never "null"/"undefined"). */
export function displayEmail(value: string | null | undefined): string {
  if (value == null) return '—'
  const trimmed = String(value).trim()
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '—'
  return trimmed
}

/**
 * Format Kenyan mobile for display: +254 7XX XXX XXX
 */
export function formatKenyanPhone(value: string | null | undefined): string {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')
  let local = digits
  if (digits.startsWith('254') && digits.length >= 12) {
    local = `0${digits.slice(3)}`
  }
  if (local.length === 10 && /^0[17]\d{8}$/.test(local)) {
    return `+254 ${local.slice(1, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
  }
  return value.trim() || '—'
}

/** Build a tel: href from a Kenyan-style phone, or null if unusable. */
export function toTelHref(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('254') && digits.length >= 12) return `tel:+${digits.slice(0, 12)}`
  if (/^0[17]\d{8}$/.test(digits)) return `tel:+254${digits.slice(1)}`
  if (digits.length >= 9) return `tel:+${digits}`
  return null
}
