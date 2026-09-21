/**
 * Optional Sentry capture for Edge Functions.
 * No-op when SENTRY_DSN is unset. Never throws into the request path.
 * Scrubs phones, ID-like strings, and secret-bearing keys before send.
 */

const PII_VALUE =
  /\b(?:0[17]\d{8}|\+?254[17]\d{8}|\d{6,10})\b/g
const SENSITIVE_KEY = /token|secret|password|authorization|cookie|otp|phone|id_number|national.?id|service.?role|cron|mpesa/i

function scrubString(value: string): string {
  return value
    .replace(PII_VALUE, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
}

function scrubUnknown(value: unknown): unknown {
  if (typeof value === 'string') return scrubString(value)
  if (Array.isArray(value)) return value.map(scrubUnknown)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : scrubUnknown(v)
    }
    return out
  }
  return value
}

function parseDsn(dsn: string): { ingestHost: string; publicKey: string; projectId: string } | null {
  try {
    const url = new URL(dsn)
    const publicKey = url.username
    const projectId = url.pathname.replace(/^\//, '').split('/')[0]
    if (!publicKey || !projectId) return null
    return { ingestHost: url.host, publicKey, projectId }
  } catch {
    return null
  }
}

export async function captureEdgeException(
  error: unknown,
  context?: {
    functionName?: string
    requestId?: string
    extra?: Record<string, unknown>
  },
): Promise<void> {
  const dsn = Deno.env.get('SENTRY_DSN')
  if (!dsn) return

  const parsed = parseDsn(dsn)
  if (!parsed) return

  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: 'error',
    server_name: 'supabase-edge',
    environment: Deno.env.get('ENVIRONMENT') ?? Deno.env.get('DENO_ENV') ?? 'production',
    message: scrubString(message),
    exception: {
      values: [
        {
          type: error instanceof Error ? error.name : 'Error',
          value: scrubString(message),
          stacktrace: stack
            ? { frames: [{ filename: 'edge', function: context?.functionName ?? 'unknown', context_line: scrubString(stack).slice(0, 500) }] }
            : undefined,
        },
      ],
    },
    tags: {
      runtime: 'deno-edge',
      ...(context?.functionName ? { function: context.functionName } : {}),
      ...(context?.requestId ? { request_id: context.requestId } : {}),
    },
    extra: scrubUnknown(context?.extra ?? {}) as Record<string, unknown>,
  }

  const endpoint = `https://${parsed.ingestHost}/api/${parsed.projectId}/store/`
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=luma-edge/1.0`,
      },
      body: JSON.stringify(event),
    })
  } catch {
    // never break the request
  }
}

export function isEdgeSentryEnabled(): boolean {
  return Boolean(Deno.env.get('SENTRY_DSN'))
}
