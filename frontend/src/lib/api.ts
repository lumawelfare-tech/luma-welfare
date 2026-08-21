export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  apiUrl: (import.meta.env.VITE_API_URL as string) ?? '/api',
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

export async function api<T = unknown>(
  path: string,
  options: Options = {},
): Promise<T> {
  const { method = 'GET', body, auth = false } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: config.publishableKey,
  }

  const session = getSession()
  if (auth && session) {
    headers.Authorization = `Bearer ${session.access_token}`
  }

  const res = await fetch(`${config.apiUrl}${path}`, {
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