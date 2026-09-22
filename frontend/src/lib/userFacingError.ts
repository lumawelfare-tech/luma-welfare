import { ApiError } from './api'
import { captureError, scrubPiiText } from './sentry'

const DEFAULT_FALLBACK = 'Something went wrong. Please try again.'

/** Messages that look like infrastructure leaks — never show to users. */
const UNSAFE_MESSAGE =
  /\b(?:at\s+\w+|SELECT\s|INSERT\s|UPDATE\s|DELETE\s|postgres|supabase|stack trace|ECONNREFUSED|ENOTFOUND|internal server)\b/i

/**
 * Map any thrown value to a short, user-safe string.
 * Never surfaces stack traces, SQL, or raw infrastructure errors.
 */
export function userFacingMessage(
  err: unknown,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (err instanceof ApiError) {
    if (err.status === 0 || err.code === 'NETWORK') {
      return 'Unable to reach the server. Check your connection and try again.'
    }
    if (err.status >= 500) {
      return fallback
    }
    const msg = scrubPiiText(err.message || '').trim()
    if (!msg || UNSAFE_MESSAGE.test(msg)) return fallback
    return msg
  }

  if (err instanceof Error) {
    const raw = err.message || ''
    if (/Failed to fetch|NetworkError|Unable to reach|Load failed|network/i.test(raw)) {
      return 'Unable to reach the server. Check your connection and try again.'
    }
    // Unknown Error.message may leak internals — use fallback only
    return fallback
  }

  return fallback
}

/**
 * User-safe load/mutation message + Sentry for unexpected failures.
 * Expected 4xx ApiErrors are not reported (validation, auth, not found).
 */
export function reportLoadError(
  err: unknown,
  context?: Record<string, unknown>,
  fallback: string = DEFAULT_FALLBACK,
): string {
  const message = userFacingMessage(err, fallback)

  const unexpected =
    !(err instanceof ApiError) || err.status === 0 || err.status >= 500

  if (unexpected) {
    const asError = err instanceof Error ? err : new Error(String(err))
    captureError(asError, context)
  }

  return message
}
