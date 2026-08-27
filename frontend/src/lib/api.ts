import { supabase, edgeFunctionUrl } from './supabase'

export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
}

const SESSION_KEY = 'luma_session'

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
}

type Options = {
  method?: string
  body?: unknown
  auth?: boolean
}

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, message: string, code = 'ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * Make an API call to a Supabase Edge Function.
 */
export async function api<T = unknown>(
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
  const url = `${edgeFunctionUrl}/${functionName}${finalSearch}`

  // Handle FormData (file uploads) vs JSON
  const isFormData = body instanceof FormData
  if (isFormData) {
    delete headers['Content-Type'] // browser sets multipart boundary automatically
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  })

  const data = (await res.json().catch(() => null)) as
    | ({ message?: string; code?: string } & T)
    | null

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.message ?? 'Something went wrong. Try again.',
      data?.code ?? 'ERROR',
    )
  }
  return data as T
}

/**
 * Split a path string into pathname and query string.
 * '/packages?resource=packages' → { pathname: 'packages', search: '?resource=packages' }
 */
function splitPath(path: string): { pathname: string; search: string } {
  const clean = path.replace(/^\/+/, '')
  const qi = clean.indexOf('?')
  if (qi === -1) return { pathname: clean, search: '' }
  return { pathname: clean.slice(0, qi), search: clean.slice(qi) }
}

/**
 * Map API paths to Edge Function names.
 */
function pathToFunctionName(path: string): string | null {
  const cleanPath = path

  // Auth routes
  if (cleanPath === 'auth/register') return 'auth-register'
  if (cleanPath === 'auth/login') return 'auth-login'
  if (cleanPath === 'auth/me') return 'auth-me'
  if (cleanPath === 'auth/oauth-provision') return 'auth-oauth-provision'
  if (cleanPath === 'auth/google-authorize') return 'auth-google-authorize'

  // Member routes
  if (cleanPath === 'member/dashboard') return 'member-dashboard'
  if (cleanPath === 'member/profile') return 'member-profile'
  if (cleanPath.startsWith('member/family')) return 'member-family'
  if (cleanPath.startsWith('member/subscriptions')) return 'member-subscriptions'
  if (cleanPath.startsWith('member/registration-fee')) return 'member-registration-fee'
  if (cleanPath === 'contributions') return 'member-contributions'

  // Admin routes
  if (cleanPath === 'admin/dashboard') return 'admin-dashboard'
  if (cleanPath.startsWith('admin/reports')) return 'admin-reports'
  if (cleanPath.startsWith('admin/members')) return 'admin-members'
  if (cleanPath.startsWith('admin/packages')) return 'admin-packages'
  if (cleanPath.startsWith('admin/contributions')) return 'admin-contributions'
  if (cleanPath.startsWith('admin/claims')) return 'admin-claims'
  if (cleanPath.startsWith('admin/subscriptions')) return 'admin-subscriptions'
  if (cleanPath.startsWith('admin/registration-fee')) return 'admin-registration-fee'
  if (cleanPath.startsWith('admin/2fa')) return 'admin-2fa'
  if (cleanPath.startsWith('admin/scheduled-reports')) return 'admin-scheduled-reports'
  if (cleanPath.startsWith('admin/notifications')) return 'admin-notifications'
  if (cleanPath.startsWith('admin/exports')) return 'admin-exports'
  if (cleanPath.startsWith('admin/reconciliation')) return 'admin-reconciliation'
  if (cleanPath.startsWith('admin/open-questions') || cleanPath.startsWith('admin/audit-logs') || cleanPath === 'admin/settings') return 'admin-settings'

  // Member routes (extended)
  if (cleanPath.startsWith('member/claims')) return 'member-claims'
  if (cleanPath.startsWith('member/receipts')) return 'member-receipts'
  if (cleanPath.startsWith('member/notification-prefs')) return 'member-notification-prefs'
  if (cleanPath.startsWith('member/notifications')) return 'member-notifications'

  // Payment routes
  if (cleanPath === 'payments/initiate') return 'payments-initiate'
  if (cleanPath.startsWith('payments') && !cleanPath.includes('callback')) return 'payments-list'

  // Content management routes
  if (cleanPath.startsWith('admin/gallery')) return 'admin-gallery'
  if (cleanPath.startsWith('admin/news')) return 'admin-news'

  // Public routes
  if (cleanPath === 'packages') return 'public-data'
  if (cleanPath === 'settings') return 'public-data'
  if (cleanPath === 'news') return 'public-data'
  if (cleanPath === 'gallery') return 'public-data'

  // Unknown path
  return null
}
