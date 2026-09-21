/**
 * Safe PostgREST search helpers.
 *
 * User input must never become PostgREST filter syntax. Values are
 * length-bounded and encoded for PostgREST (double-quoted) and LIKE
 * (backslash-escaped wildcards). Column names are server-controlled only.
 */

export const DEFAULT_SEARCH_MAX_LEN = 64

/** Control chars / null bytes — never useful in search. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g

/**
 * Normalize untrusted search text for RPC params or filter values.
 * Preserves ordinary tokens: emails, phones, hyphens, dots, @, +.
 * Does NOT strip punctuation that appears in legitimate identifiers.
 */
export function sanitizeSearch(
  input: unknown,
  maxLen: number = DEFAULT_SEARCH_MAX_LEN,
): string {
  if (input == null) return ''
  if (typeof input !== 'string' && typeof input !== 'number' && typeof input !== 'boolean') {
    return ''
  }
  let s = String(input).trim()
  if (!s) return ''
  s = s.replace(CONTROL_CHARS, '')
  if (s.length > maxLen) s = s.slice(0, maxLen)
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/**
 * Escape a string so it is treated as a literal in PostgreSQL ILIKE.
 * Default escape character is backslash.
 */
export function escapeLikeLiterals(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Encode a filter value for PostgREST so commas/parens/colons/dots
 * cannot alter expression structure. Double-quote and escape quotes.
 */
export function encodePostgrestFilterValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * Build a PostgREST `.or()` argument for multi-column ilike search.
 * Column names MUST be server-controlled literals — never from user input.
 *
 * Returns null when there is nothing to search (caller should skip the filter).
 */
export function buildIlikeOrFilter(
  columns: readonly string[],
  rawQuery: unknown,
  maxLen: number = DEFAULT_SEARCH_MAX_LEN,
): string | null {
  const q = sanitizeSearch(rawQuery, maxLen)
  if (!q || columns.length === 0) return null

  for (const col of columns) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(col)) {
      throw new Error('Invalid search column name')
    }
  }

  const pattern = encodePostgrestFilterValue(`%${escapeLikeLiterals(q)}%`)
  return columns.map((col) => `${col}.ilike.${pattern}`).join(',')
}
