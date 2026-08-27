import * as Sentry from '@sentry/react'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const isProduction = import.meta.env.PROD
const isDev = import.meta.env.DEV

/**
 * Initialize Sentry for production error monitoring.
 * Only activates in production when a DSN is configured.
 * In development, errors are logged to console only.
 */
export function initSentry() {
  if (!SENTRY_DSN || !isProduction) {
    if (isDev) {
      console.info('[Sentry] Disabled in development mode. Set VITE_SENTRY_DSN to enable.')
    }
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE || 'production',

    // Performance monitoring
    tracesSampleRate: 0.1, // 10% of transactions
    replaysSessionSampleRate: 0.01, // 1% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of error sessions

    // Integrations
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Release tracking
    release: import.meta.env.VITE_APP_VERSION || 'unknown',

    // Don't send PII
    sendDefaultPii: false,

    // Ignore common non-actionable errors
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      'NetworkError',
      'AbortError',
      'ChunkLoadError',
      'Loading chunk.* failed',
      'Loading CSS chunk.* failed',
      // Browser extensions
      'Non-Error Captured',
    ],

    // Before send hook to filter out noise
    beforeSend(event) {
      // Don't send events for development errors
      if (event.exception?.values?.[0]?.type === 'ChunkLoadError') {
        return null // User needs to refresh
      }

      // Don't send events for network errors (user offline)
      if (event.exception?.values?.[0]?.value?.includes('Failed to fetch')) {
        return null // Network issue, not a bug
      }

      return event
    },

    // Transport options
    transport: Sentry.makeBrowserOfflineTransport(Sentry.makeFetchTransport),
  })
}

/**
 * Capture an exception with additional context.
 */
export function captureError(error: Error, context?: Record<string, unknown>) {
  if (isProduction && SENTRY_DSN) {
    Sentry.withScope(scope => {
      if (context) {
        scope.setExtras(context)
      }
      Sentry.captureException(error)
    })
  } else {
    console.error('[Error]', error, context)
  }
}

/**
 * Capture a message for debugging.
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (isProduction && SENTRY_DSN) {
    Sentry.captureMessage(message, level)
  } else if (isDev) {
    console[level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'info'](`[${level}]`, message)
  }
}

/**
 * Set user context for error tracking (without PII).
 */
export function setSentryUser(user: { id: string; role?: string }) {
  if (isProduction && SENTRY_DSN) {
    Sentry.setUser({ id: user.id })
    if (user.role) {
      Sentry.setTag('user_role', user.role)
    }
  }
}

/**
 * Clear user context on logout.
 */
export function clearSentryUser() {
  if (isProduction && SENTRY_DSN) {
    Sentry.setUser(null)
  }
}
