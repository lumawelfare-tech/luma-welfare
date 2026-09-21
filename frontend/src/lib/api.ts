import { supabase, edgeFunctionUrl } from './supabase'
import { pathToFunctionName, splitPath } from './api-routes'

export { pathToFunctionName } from './api-routes'

export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
}

const SESSION_KEY = 'luma_session'
const ADMIN_2FA_TOKEN_KEY = 'luma_admin_2fa_token'

export type Session = {
  access_token: string
  expires_at?: number
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (s.expires_at && s.expires_at * 1000 < Date.now()) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

export function setSession(token: string, expiresAt?: number): void {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: token, expires_at: expiresAt }),
  )
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
  clearAdmin2faStepUpToken()
}

export function setAdmin2faStepUpToken(token: string, expiresAt?: number): void {
  sessionStorage.setItem(
    ADMIN_2FA_TOKEN_KEY,
    JSON.stringify({ token, expires_at: expiresAt }),
  )
}

export function getAdmin2faStepUpToken(): string | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_2FA_TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { token?: string; expires_at?: number }
    if (parsed.expires_at && parsed.expires_at * 1000 < Date.now()) {
      sessionStorage.removeItem(ADMIN_2FA_TOKEN_KEY)
      return null
    }
    return parsed.token ?? null
  } catch {
    return null
  }
}

export function clearAdmin2faStepUpToken(): void {
  sessionStorage.removeItem(ADMIN_2FA_TOKEN_KEY)
}

type Options = {
  method?: string
  body?: unknown
  auth?: boolean
  retry?: boolean // enable retry for transient failures (default: true for GET, false for mutations)
}

const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504])
const MAX_RETRIES = 2
const BASE_DELAY_MS = 500

export class ApiError extends Error {
  status: number
  code: string
  retryAfter: number | null
  constructor(status: number, message: string, code = 'ERROR', retryAfter: number | null = null) {
    super(message)
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

/**
 * Make an API call to a Supabase Edge Function with optional retry for transient failures.
 */
export async function api<T = unknown>(
  path: string,
  options: Options = {},
): Promise<T> {
  const { method = 'GET', body, auth = false } = options
  const shouldRetry = options.retry ?? RETRYABLE_METHODS.has(method.toUpperCase())
  let lastError: ApiError | null = null

  for (let attempt = 0; attempt <= (shouldRetry ? MAX_RETRIES : 0); attempt++) {
    try {
      return await apiInternal<T>(path, { method, body, auth })
    } catch (e) {
      lastError = e instanceof ApiError ? e : new ApiError(0, String(e), 'NETWORK')
      const isTransient = RETRYABLE_STATUSES.has(lastError.status) || lastError.status === 0
      if (!shouldRetry || !isTransient || attempt >= MAX_RETRIES) {
        throw lastError
      }
      // Exponential backoff: 500ms, 1000ms
      await new Promise(r => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)))
    }
  }
  throw lastError!
}

/**
 * Internal API call implementation (no retry).
 */
async function apiInternal<T = unknown>(
  path: string,
  options: Options = {},
): Promise<T> {
  const { method = 'GET', body, auth = false } = options

  // Get access token from Supabase session or localStorage
  let accessToken: string | null = null
  if (auth) {
    const { data: { session } } = await supabase.auth.getSession()
    accessToken = session?.access_token ?? null
    if (!accessToken) {
      const localSession = getSession()
      accessToken = localSession?.access_token ?? null
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: config.publishableKey,
    'x-request-id':
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `req_${crypto.randomUUID()}`
        : `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  // Determine the Edge Function name from the path
  const { pathname, search } = splitPath(path)
  const functionName = pathToFunctionName(pathname)

  if (!functionName) {
    throw new ApiError(404, `Unknown API path: ${path}`, 'NOT_FOUND')
  }

  // Admin 2FA step-up token (required by admin Edge Functions when 2FA is enabled)
  if (auth && functionName.startsWith('admin-')) {
    const stepUp = getAdmin2faStepUpToken()
    if (stepUp) headers['x-admin-2fa-token'] = stepUp
  }

  // Extract sub-resource IDs from path segments and forward as query params
  // e.g. /member/family/{id} → ?resource_id={id}
  // e.g. /admin/members/{id}/status → ?resource_id={id}&action=status
  // e.g. /admin/audit-logs → ?resource_id=audit-logs
  const pathSegments = pathname.split('/')
  const baseSegments = functionName.replace(/-/g, '/').split('/')
  let extraParams: string[] = []

  // Find where path diverges from function name segments
  let divergeIndex = 0
  for (let i = 0; i < Math.min(pathSegments.length, baseSegments.length); i++) {
    if (pathSegments[i] !== baseSegments[i]) break
    divergeIndex = i + 1
  }

  const subSegments = pathSegments.slice(divergeIndex)
  if (subSegments.length > 0 && subSegments[0]) {
    extraParams.push(`resource_id=${encodeURIComponent(subSegments[0])}`)
  }
  if (subSegments.length > 1 && subSegments[1]) {
    extraParams.push(`action=${encodeURIComponent(subSegments[1])}`)
  }

  // Merge extra params with existing query string
  let finalSearch = search
  if (extraParams.length > 0) {
    const sep = finalSearch ? '&' : '?'
    finalSearch += `${sep}${extraParams.join('&')}`
  }

  // Call Edge Function, forwarding any query parameters
  const base = edgeFunctionUrl.replace(/\/+$/, '')
  const url = `${base}/${functionName}${finalSearch}`

  if (!config.supabaseUrl || !config.publishableKey) {
    console.error('[api] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
    throw new ApiError(
      0,
      'App configuration is incomplete. Please contact support.',
      'CONFIG',
    )
  }

  // Handle FormData (file uploads) vs JSON
  const isFormData = body instanceof FormData
  if (isFormData) {
    delete headers['Content-Type'] // browser sets multipart boundary automatically
  }

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    })
  } catch (err) {
    // Browser surfaces CORS / offline / DNS failures as TypeError: Failed to fetch
    console.error('[api] Network request failed', {
      functionName,
      method,
      supabaseHost: (() => {
        try { return new URL(config.supabaseUrl).host } catch { return 'invalid-url' }
      })(),
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    })
    throw new ApiError(
      0,
      'Unable to reach the server. Check your connection and try again.',
      'NETWORK',
    )
  }

  const data = (await res.json().catch(() => null)) as
    | ({ message?: string; code?: string; retry_after?: number } & T)
    | null

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.message ?? 'Something went wrong. Try again.',
      data?.code ?? 'ERROR',
      typeof data?.retry_after === 'number' ? data.retry_after : null,
    )
  }
  return data as T
}
