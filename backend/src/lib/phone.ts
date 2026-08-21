/**
 * Phone validation and normalization for Kenyan M-Pesa numbers.
 *
 * Rules:
 * - Must be a valid Kenyan mobile number
 * - Normalized to 2547XXXXXXXX format for Daraja
 * - Never logs the full phone number
 */

/** Valid Kenyan mobile prefixes after the leading 0. */
const VALID_PREFIXES = ['1', '7', '10', '11']

/**
 * Validate a Kenyan phone number.
 * Returns normalized form (2547XXXXXXXX) or null if invalid.
 */
export function validateAndNormalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()+]/g, '')

  // Must be all digits
  if (!/^\d+$/.test(cleaned)) return null

  let local: string

  if (cleaned.startsWith('254')) {
    local = cleaned.slice(3)
  } else if (cleaned.startsWith('0')) {
    local = cleaned.slice(1)
  } else {
    return null
  }

  // Local part must be 9 digits
  if (local.length !== 9) return null

  // Must start with valid prefix
  const prefix = local.slice(0, local[1] === '0' || local[1] === '1' ? 2 : 1)
  if (!VALID_PREFIXES.some(p => local.startsWith(p))) return null

  return '254' + local
}

/**
 * Validate a phone number, throwing if invalid.
 */
export function requireValidPhone(raw: string): string {
  const normalized = validateAndNormalizePhone(raw)
  if (!normalized) {
    throw new Error('Enter a valid Kenyan M-Pesa phone number (e.g. 0712345678).')
  }
  return normalized
}

/**
 * Mask a phone number for logging: show last 4 digits only.
 * 0712345678 → ******5678
 */
export function maskPhone(phone: string): string {
  if (phone.length < 4) return '****'
  return '*'.repeat(phone.length - 4) + phone.slice(-4)
}
