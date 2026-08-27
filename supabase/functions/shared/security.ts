/**
 * LUMA WELFARE — PHASE 13: SECURITY UTILITIES
 *
 * Input sanitization, security headers, and payment validation.
 * No external dependencies.
 */

// ============================================================================
// INPUT SANITIZATION — XSS PROTECTION
// ============================================================================

/**
 * Characters that are dangerous in HTML context.
 * React escapes by default, but server-side string building needs this.
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#96;',
}

/**
 * Escape HTML special characters to prevent XSS.
 * Use when building HTML strings server-side.
 */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"'`/]/g, (char) => HTML_ESCAPE_MAP[char] ?? char)
}

/**
 * Sanitize a string for safe use in SQL parameters.
 * Note: Supabase client uses parameterized queries, so this is a defense-in-depth measure.
 */
export function sanitizeString(input: string, maxLength = 1000): string {
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/\0/g, '') // Remove null bytes
}

/**
 * Validate that a string matches expected patterns.
 */
export function validatePattern(value: string, pattern: RegExp, fieldName: string): string | null {
  if (!pattern.test(value)) {
    return `${fieldName} has invalid format`
  }
  return null
}

// ============================================================================
// COMMON VALIDATION PATTERNS
// ============================================================================

export const PATTERNS = {
  /** Kenyan phone: 07XXXXXXXX or 254XXXXXXXXX */
  phone: /^(?:07|\+?2547)\d{8,9}$/,
  /** Simple email */
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  /** UUID */
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /** YYYY-MM period */
  period: /^\d{4}-\d{2}$/,
  /** YYYY-MM-DD date */
  date: /^\d{4}-\d{2}-\d{2}$/,
  /** Non-empty trimmed text */
  nonEmpty: /^.+$/,
  /** Membership number: LW-XXXXXX */
  membershipNumber: /^LW-\d{6,}$/,
} as const

// ============================================================================
// SECURITY HEADERS
// ============================================================================

/**
 * Standard security headers for Edge Function responses.
 * These protect against common web vulnerabilities.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0', // Modern browsers; rely on CSP instead
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
}

/**
 * Content Security Policy for the frontend.
 * Restricts resource loading to prevent XSS and data injection.
 */
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ')

// ============================================================================
// PAYMENT SECURITY
// ============================================================================

/**
 * Maximum payment amount to prevent absurd values.
 * KSh 1,000,000 is a reasonable upper bound for welfare contributions.
 */
export const MAX_PAYMENT_AMOUNT = 1_000_000

/**
 * Minimum payment amount.
 */
export const MIN_PAYMENT_AMOUNT = 1

/**
 * Validate a payment amount server-side.
 * Returns null if valid, error message if invalid.
 */
export function validatePaymentAmount(
  amount: number | string | null | undefined,
  expectedAmount?: number,
): string | null {
  if (amount === null || amount === undefined) {
    return 'Payment amount is required'
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount

  if (isNaN(numAmount)) {
    return 'Payment amount must be a number'
  }

  if (numAmount < MIN_PAYMENT_AMOUNT) {
    return `Payment amount must be at least KSh ${MIN_PAYMENT_AMOUNT}`
  }

  if (numAmount > MAX_PAYMENT_AMOUNT) {
    return `Payment amount exceeds maximum allowed (KSh ${MAX_PAYMENT_AMOUNT.toLocaleString()})`
  }

  // Check for floating point precision issues
  const decimalPlaces = (numAmount.toString().split('.')[1] ?? '').length
  if (decimalPlaces > 2) {
    return 'Payment amount cannot have more than 2 decimal places'
  }

  // If expected amount is provided, verify it matches
  if (expectedAmount !== undefined && Math.abs(numAmount - expectedAmount) > 0.01) {
    return `Payment amount (KSh ${numAmount}) does not match expected amount (KSh ${expectedAmount})`
  }

  return null
}

/**
 * Validate a phone number format.
 */
export function validatePhone(phone: string | null | undefined): string | null {
  if (!phone) return 'Phone number is required'
  if (!PATTERNS.phone.test(phone)) return 'Invalid Kenyan phone number format'
  return null
}

// ============================================================================
// CSV INJECTION PROTECTION
// ============================================================================

/**
 * Characters that indicate a potential CSV injection / formula injection.
 */
const CSV_INJECTION_CHARS = ['=', '+', '-', '@', '\t', '\r']

/**
 * Sanitize a value for safe CSV export.
 * Prevents formula injection in spreadsheet applications.
 */
export function sanitizeCsvValue(value: unknown): string {
  const str = String(value ?? '')
  if (CSV_INJECTION_CHARS.includes(str.charAt(0))) {
    return `'${str}` // Prefix with single quote to neutralize formula
  }
  return str
}

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

/**
 * Maximum request body size (1 MB).
 */
export const MAX_BODY_SIZE = 1_024 * 1_024

/**
 * Validate request content type.
 */
export function validateContentType(req: Request, expected: string = 'application/json'): boolean {
  const contentType = req.headers.get('content-type') ?? ''
  return contentType.includes(expected)
}

/**
 * Safe JSON parse with size limit.
 */
export async function safeJsonParse(req: Request, maxSize = MAX_BODY_SIZE): Promise<unknown> {
  const contentLength = parseInt(req.headers.get('content-length') ?? '0')
  if (contentLength > maxSize) {
    throw new Error('Request body too large')
  }

  const text = await req.text()
  if (text.length > maxSize) {
    throw new Error('Request body too large')
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON')
  }
}
