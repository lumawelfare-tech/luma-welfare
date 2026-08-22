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
 * Falls back to the Hono backend if configured.
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
  const functionName = pathToFunctionName(path)

  if (!functionName) {
    throw new ApiError(404, `Unknown API path: ${path}`, 'NOT_FOUND')
  }

  // Call Edge Function
  const res = await fetch(`${edgeFunctionUrl}/${functionName}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
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
 * Map API paths to Edge Function names.
 * Returns null if the path should fall back to the Hono backend.
 */
function pathToFunctionName(path: string): string | null {
  const cleanPath = path.replace(/^\/+/, '')

  // Auth routes
  if (cleanPath === 'auth/register') return 'auth-register'
  if (cleanPath === 'auth/login') return 'auth-login'
  if (cleanPath === 'auth/me') return 'auth-me'

  // Member routes
  if (cleanPath === 'member/dashboard') return 'member-dashboard'
  if (cleanPath === 'member/profile') return 'member-profile'
  if (cleanPath.startsWith('member/family')) return 'member-family'
  if (cleanPath === 'member/subscriptions') return 'member-subscriptions'
  if (cleanPath === 'contributions') return 'member-contributions'

  // Admin routes
  if (cleanPath === 'admin/dashboard') return 'admin-dashboard'
  if (cleanPath.startsWith('admin/members')) return 'admin-members'
  if (cleanPath.startsWith('admin/packages')) return 'admin-packages'
  if (cleanPath.startsWith('admin/contributions')) return 'admin-contributions'
  if (cleanPath.startsWith('admin/claims')) return 'admin-claims'
  if (cleanPath.startsWith('admin/subscriptions')) return 'admin-subscriptions'
  if (cleanPath.startsWith('admin/open-questions') || cleanPath.startsWith('admin/audit-logs') || cleanPath === 'admin/settings') return 'admin-settings'

  // Payment routes
  if (cleanPath === 'payments/initiate') return 'payments-initiate'
  if (cleanPath.startsWith('payments') && !cleanPath.includes('callback')) return 'payments-list'

  // Public routes
  if (cleanPath === 'packages') return 'public-data'
  if (cleanPath === 'settings') return 'public-data'
  if (cleanPath === 'news') return 'public-data'
  if (cleanPath === 'gallery') return 'public-data'

  // Fallback — return null to use Hono backend
  return null
}
