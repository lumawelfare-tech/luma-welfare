/**
 * Shared XSS / open-redirect / export sanitizers for the SPA.
 */

/** Escape text for HTML contexts. */
export function escapeHtml(str: string | null | undefined): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape text for XML / SpreadsheetML cell content. */
export function escapeXml(str: string | null | undefined): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Neutralize CSV/Excel formula injection, then quote if needed.
 * Does NOT XML-escape — use escapeXml for SpreadsheetML.
 */
export function sanitizeExportCell(val: string | number | null | undefined): string {
  const str = String(val ?? '')
  if (/^[=+\-@\t\r]/.test(str)) return `'${str}`
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** SpreadsheetML string cell: formula neutralize + XML escape. */
export function sanitizeSpreadsheetCell(val: string | number | null | undefined): string {
  const neutralized = sanitizeExportCell(val)
  // If quoted for CSV, strip outer quotes for XML cell (XML handles raw content)
  const raw = neutralized.startsWith('"') && neutralized.endsWith('"')
    ? neutralized.slice(1, -1).replace(/""/g, '"')
    : neutralized
  return escapeXml(raw)
}

/**
 * Allow only same-origin relative paths (blocks //evil.com and absolute URLs).
 */
export function safeInternalPath(raw: unknown, fallback = '/dashboard'): string {
  if (typeof raw !== 'string' || !raw) return fallback
  const path = raw.trim()
  if (!/^\/(?!\/)/.test(path)) return fallback
  if (path.includes('\\') || path.includes('\0')) return fallback
  return path
}

/**
 * Allowlist contact/CMS hrefs: tel:, mailto:, https: (and http: for local only rejected).
 * Returns null when unsafe.
 */
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const href = raw.trim()
  if (/^tel:[+\d\s()-]+$/i.test(href)) return href
  if (/^mailto:[^\s<>"]+$/i.test(href)) return href
  try {
    const u = new URL(href)
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      if (u.username || u.password) return null
      return u.toString()
    }
  } catch {
    return null
  }
  return null
}
