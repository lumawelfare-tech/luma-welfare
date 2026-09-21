import * as Sentry from '@sentry/react'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const isProduction = import.meta.env.PROD
const isDev = import.meta.env.DEV

const PII_VALUE =
  /\b(?:0[17]\d{8}|\+?254[17]\d{8}|\b\d{7,10}\b)\b/g
const SENSITIVE_KEY = /token|secret|password|authorization|cookie|mpesa|service.?role|cron|phone|id_number|otp/i

/** Exported for unit tests — scrub phone-like and secret-bearing text. */
export function scrubPiiText(value: string): string {
  return value
    .replace(PII_VALUE, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
}

function scrubEventValue(value: unknown): unknown {
  if (typeof value === 'string') return scrubPiiText(value)
  if (Array.isArray(value)) return value.map(scrubEventValue)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : scrubEventValue(v)
    }
    return out
  }
  return value
}

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

    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    release: import.meta.env.VITE_APP_VERSION || 'unknown',
    sendDefaultPii: false,

    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      'NetworkError',
      'AbortError',
      'ChunkLoadError',
      'Loading chunk.* failed',
      'Loading CSS chunk.* failed',
      'Non-Error Captured',
    ],

    beforeSend(event) {
      if (event.exception?.values?.[0]?.type === 'ChunkLoadError') {
        return null
      }

      if (event.exception?.values?.[0]?.value?.includes('Failed to fetch')) {
        return null
      }

      if (event.extra) {
        event.extra = scrubEventValue(event.extra) as Record<string, unknown>
      }
      if (event.contexts) {
        event.contexts = scrubEventValue(event.contexts) as typeof event.contexts
      }
      if (event.request?.headers) {
        for (const key of Object.keys(event.request.headers)) {
          if (SENSITIVE_KEY.test(key)) {
            event.request.headers[key] = '[REDACTED]'
          }
        }
      }
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) ex.value = scrubPiiText(ex.value)
        }
      }
      if (event.message) {
        event.message = scrubPiiText(event.message)
      }

      return event
    },

    transport: Sentry.makeBrowserOfflineTransport(Sentry.makeFetchTransport),
  })
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  if (isProduction && SENTRY_DSN) {
    Sentry.withScope(scope => {
      if (context) {
        scope.setExtras(scrubEventValue(context) as Record<string, unknown>)
      }
      Sentry.captureException(error)
    })
  } else {
    console.error('[Error]', error, context)
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (isProduction && SENTRY_DSN) {
    Sentry.captureMessage(scrubPiiText(message), level)
  } else if (isDev) {
    console[level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'info'](`[${level}]`, message)
  }
}

/** Set user context for error tracking (id + role only — no email/phone). */
export function setSentryUser(user: { id: string; role?: string }) {
  if (isProduction && SENTRY_DSN) {
    Sentry.setUser({ id: user.id })
    if (user.role) {
      Sentry.setTag('user_role', user.role)
    }
  }
}

export function clearSentryUser() {
  if (isProduction && SENTRY_DSN) {
    Sentry.setUser(null)
  }
}
