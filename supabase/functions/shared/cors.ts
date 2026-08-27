/**
 * CORS headers for Edge Functions.
 * Supports environment-based origin configuration.
 */

function getAllowedOrigin(): string {
  // Support multiple origins via comma-separated CORS_ALLOWED_ORIGIN
  // Primary origin for Cloudflare-proxied domain or direct Vercel URL
  return Deno.env.get('CORS_ALLOWED_ORIGIN') ?? 'https://luma-welfare.vercel.app'
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false
  const allowed = getAllowedOrigin().split(',').map(o => o.trim())
  return allowed.includes(origin)
}

export function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  }
}

// Backward-compatible export
export const corsHeaders = getCorsHeaders()

import { CSP_DIRECTIVES } from './security.ts'

// Security headers for all responses
export const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': CSP_DIRECTIVES,
}

/**
 * Add security headers to a response.
 */
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
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}
