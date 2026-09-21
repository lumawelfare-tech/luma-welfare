/**
 * Webhook URL SSRF protection.
 *
 * Primary boundary: exact hostname allowlist (Slack, Discord, plus
 * WEBHOOK_URL_ALLOWLIST). Private/link-local/loopback and metadata hosts
 * are always rejected even if somehow listed.
 *
 * Pure TypeScript — safe to import from Edge Functions and Vercel cron.
 */

export class UnsafeWebhookUrlError extends Error {
  readonly code = 'UNSAFE_WEBHOOK_URL'
  constructor(message = 'Webhook URL is not allowed.') {
    super(message)
    this.name = 'UnsafeWebhookUrlError'
  }
}

/** Built-in hosts from the Luma WebhookSettings UI placeholders. */
export const BUILTIN_WEBHOOK_HOSTS = [
  'hooks.slack.com',
  'discord.com',
  'discordapp.com',
] as const

const METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.google.com',
  'kubernetes.default',
  'kubernetes.default.svc',
])

export type AssertSafeWebhookUrlOptions = {
  /** Extra exact hostnames (normally from WEBHOOK_URL_ALLOWLIST). */
  extraAllowlist?: string[]
}

function parseAllowlistEnv(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

/** Read WEBHOOK_URL_ALLOWLIST from Deno or Node without coupling callers. */
export function readWebhookAllowlistFromEnv(): string[] {
  let raw: string | undefined
  try {
    // Deno Edge
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deno = (globalThis as any).Deno
    if (deno?.env?.get) raw = deno.env.get('WEBHOOK_URL_ALLOWLIST') ?? undefined
  } catch {
    /* ignore */
  }
  if (raw == null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proc = (globalThis as any).process
      raw = proc?.env?.WEBHOOK_URL_ALLOWLIST
    } catch {
      /* ignore */
    }
  }
  return parseAllowlistEnv(raw)
}

function isIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return false
  return m.slice(1).every((o) => {
    const n = Number(o)
    return n >= 0 && n <= 255 && String(n) === o.replace(/^0+(?=\d)/, o === '0' ? '0' : '')
  })
}

/** Accept dotted decimal only (reject octal-looking leading zeros as suspicious). */
function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split('.')
  if (parts.length !== 4) return null
  const nums: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    // Reject leading zeros (e.g. 0177.0.0.1) used to confuse parsers
    if (p.length > 1 && p.startsWith('0')) return null
    const n = Number(p)
    if (!Number.isInteger(n) || n < 0 || n > 255) return null
    nums.push(n)
  }
  return nums as [number, number, number, number]
}

function isPrivateOrReservedIpv4(host: string): boolean {
  const ip = parseIpv4(host)
  if (!ip) return isIpv4(host) // malformed/suspicious dotted form → reject via caller
  const [a, b] = ip
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast / reserved
  return false
}

function isIpv6Literal(host: string): boolean {
  return host.includes(':')
}

function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === '::1' || h === '::') return true
  // Unique local fc00::/7, link-local fe80::/10, loopback, unspecified
  if (h.startsWith('fc') || h.startsWith('fd')) return true
  if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) return true
  if (h.startsWith('::ffff:')) {
    // IPv4-mapped — check embedded IPv4
    const mapped = h.slice('::ffff:'.length)
    if (parseIpv4(mapped) || isIpv4(mapped)) return isPrivateOrReservedIpv4(mapped) || true
    return true
  }
  return false
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '')
}

function isHostAllowed(hostname: string, extra: string[]): boolean {
  const host = normalizeHost(hostname)
  const allow = new Set<string>([
    ...BUILTIN_WEBHOOK_HOSTS.map((h) => h.toLowerCase()),
    ...extra.map((h) => normalizeHost(h)),
  ])
  return allow.has(host)
}

/**
 * Validate a webhook destination URL.
 * Returns the parsed URL on success; throws UnsafeWebhookUrlError otherwise.
 */
export function assertSafeWebhookUrl(
  raw: unknown,
  options: AssertSafeWebhookUrlOptions = {},
): URL {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new UnsafeWebhookUrlError('Webhook URL is required.')
  }

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new UnsafeWebhookUrlError('Webhook URL is malformed.')
  }

  if (url.protocol !== 'https:') {
    throw new UnsafeWebhookUrlError('Webhook URL must use HTTPS.')
  }

  if (url.username || url.password) {
    throw new UnsafeWebhookUrlError('Webhook URL must not contain credentials.')
  }

  const host = normalizeHost(url.hostname)
  if (!host) {
    throw new UnsafeWebhookUrlError('Webhook URL is malformed.')
  }

  if (METADATA_HOSTS.has(host) || host.endsWith('.metadata.google.internal')) {
    throw new UnsafeWebhookUrlError('Webhook URL host is not allowed.')
  }

  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') {
    throw new UnsafeWebhookUrlError('Webhook URL host is not allowed.')
  }

  if (isIpv6Literal(host)) {
    if (isBlockedIpv6(host)) {
      throw new UnsafeWebhookUrlError('Webhook URL host is not allowed.')
    }
    // Bare public IPv6 is not on the allowlist — reject (allowlist is hostname-based)
    throw new UnsafeWebhookUrlError('Webhook URL host is not allowed.')
  }

  const ipv4 = parseIpv4(host)
  if (ipv4) {
    if (isPrivateOrReservedIpv4(host)) {
      throw new UnsafeWebhookUrlError('Webhook URL host is not allowed.')
    }
    // Public IPv4 literals are not allowlisted by hostname — reject
    throw new UnsafeWebhookUrlError('Webhook URL host is not allowed.')
  }

  // Reject dotted forms with leading zeros that parseIpv4 refused
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    throw new UnsafeWebhookUrlError('Webhook URL host is not allowed.')
  }

  const extra = [
    ...(options.extraAllowlist ?? []),
    ...readWebhookAllowlistFromEnv(),
  ]

  if (!isHostAllowed(host, extra)) {
    throw new UnsafeWebhookUrlError('Webhook URL host is not allowed.')
  }

  return url
}

/**
 * Validate then fetch. Disables redirects to prevent redirect-based SSRF.
 */
export async function safeWebhookFetch(
  rawUrl: unknown,
  init: RequestInit = {},
  options?: AssertSafeWebhookUrlOptions,
): Promise<Response> {
  const url = assertSafeWebhookUrl(rawUrl, options)
  return fetch(url.toString(), {
    ...init,
    redirect: 'error',
  })
}
