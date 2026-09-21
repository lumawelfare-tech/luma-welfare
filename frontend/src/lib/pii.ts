/**
 * PII masking helpers for admin UI lists. Keep in sync with supabase/functions/shared/pii.ts
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
