/**
 * CORS headers for Edge Functions.
 * Reflects a single allowlisted Origin (never a comma-separated ACAO value).
 *
 * Exact origin matching only. Preview hosts must be listed explicitly in
 * CORS_ALLOWED_ORIGIN — no Vercel preview hostname wildcards.
 */

import { CSP_DIRECTIVES } from './security.ts'

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get('CORS_ALLOWED_ORIGIN')
    ?? 'https://luma-welfare.vercel.app,http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173'
  return raw.split(',').map((o) => o.trim()).filter(Boolean)
}

function resolveAllowOrigin(reqOrigin: string | null): string {
  const allowed = getAllowedOrigins()
  if (reqOrigin && allowed.includes(reqOrigin)) return reqOrigin
  // Fall back to primary configured origin for non-browser / same-origin tooling
  return allowed[0] ?? 'https://luma-welfare.vercel.app'
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false
  return getAllowedOrigins().includes(origin)
}

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = resolveAllowOrigin(req?.headers.get('Origin') ?? null)
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-request-id, x-admin-2fa-token, x-callback-secret, x-cron-secret',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    ...getSecurityHeaders(),
  }
}

/** Static default for modules that import corsHeaders at load time. Prefer getCorsHeaders(req). */
export const corsHeaders = getCorsHeaders()

function getCspNonce(): string {
  return Deno.env.get('CSP_NONCE') ?? ''
}

function buildCsp(): string {
  const nonce = getCspNonce()
  if (!nonce) return CSP_DIRECTIVES
  return CSP_DIRECTIVES
    .replace(/'unsafe-inline'/g, `'nonce-${nonce}'`)
    .replace(/'strict-dynamic'/g, `'nonce-${nonce}' 'strict-dynamic'`)
}

export function getSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '0',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': buildCsp(),
  }
}

export const securityHeaders = getSecurityHeaders()

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(securityHeaders)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.get('Origin')
    if (origin && !isOriginAllowed(origin)) {
      return new Response(JSON.stringify({ message: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...getSecurityHeaders() },
      })
    }
    return new Response('ok', { headers: getCorsHeaders(req) })
  }
  return null
}
