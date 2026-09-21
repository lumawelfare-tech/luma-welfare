import type { APIRequestContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import {
  BASE_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
} from './env'

export type Session = {
  accessToken: string
  userId: string
  email: string
}

/** Sign in via Supabase Auth password grant (no UI). */
export async function signInApi(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<Session> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    data: { email, password },
  })
  expect(res.ok(), `Auth failed for ${email}: ${res.status()} ${await res.text()}`).toBeTruthy()
  const body = await res.json() as {
    access_token?: string
    user?: { id?: string; email?: string }
  }
  expect(body.access_token).toBeTruthy()
  expect(body.user?.id).toBeTruthy()
  return {
    accessToken: body.access_token!,
    userId: body.user!.id!,
    email: body.user!.email ?? email,
  }
}

export function edgeHeaders(accessToken: string): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'x-request-id': `e2e_${Date.now().toString(36)}`,
  }
}

export async function edgeGet(
  request: APIRequestContext,
  fn: string,
  accessToken: string,
  query = '',
) {
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : ''
  return request.get(`${SUPABASE_URL}/functions/v1/${fn}${q}`, {
    headers: edgeHeaders(accessToken),
  })
}

export async function edgeJson<T>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  fn: string,
  accessToken: string,
  opts?: { query?: string; data?: unknown },
): Promise<{ status: number; body: T }> {
  const q = opts?.query ? (opts.query.startsWith('?') ? opts.query : `?${opts.query}`) : ''
  const res = await request.fetch(`${SUPABASE_URL}/functions/v1/${fn}${q}`, {
    method,
    headers: edgeHeaders(accessToken),
    data: opts?.data,
  })
  const text = await res.text()
  let body = {} as T
  try {
    body = text ? JSON.parse(text) as T : ({} as T)
  } catch {
    body = { raw: text } as T
  }
  return { status: res.status(), body }
}

export async function serviceHeaders(): Promise<Record<string, string>> {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
}

/** UI login using stable selectors. Leaves session in the browser. */
export async function loginUi(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 20_000 })
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.locator('[data-testid="login-submit"]').click()
  // Prefer URL change over arbitrary sleep
  await page.waitForURL(/\/(dashboard|admin|verify-email)/, { timeout: 30_000 })
}
