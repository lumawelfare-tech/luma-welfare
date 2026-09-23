import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  BASE_URL,
  E2E_ADMIN,
  hasAdminTotp,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
} from './env'
import { generateTotp } from './totp'

export type Session = {
  accessToken: string
  userId: string
  email: string
  stepUpToken?: string
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

export function edgeHeaders(accessToken: string, stepUpToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'x-request-id': `e2e_${Date.now().toString(36)}`,
  }
  if (stepUpToken) headers['x-admin-2fa-token'] = stepUpToken
  return headers
}

export async function edgeGet(
  request: APIRequestContext,
  fn: string,
  accessToken: string,
  query = '',
  stepUpToken?: string,
) {
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : ''
  return request.get(`${SUPABASE_URL}/functions/v1/${fn}${q}`, {
    headers: edgeHeaders(accessToken, stepUpToken),
  })
}

export async function edgeJson<T>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  fn: string,
  accessToken: string,
  opts?: { query?: string; data?: unknown; stepUpToken?: string },
): Promise<{ status: number; body: T }> {
  const q = opts?.query ? (opts.query.startsWith('?') ? opts.query : `?${opts.query}`) : ''
  const res = await request.fetch(`${SUPABASE_URL}/functions/v1/${fn}${q}`, {
    method,
    headers: edgeHeaders(accessToken, opts?.stepUpToken),
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
  await page.waitForFunction(() => {
    const path = window.location.pathname
    if (/\/(dashboard|admin|verify-email|application-status)/.test(path)) return true
    return Boolean(document.getElementById('login-totp') || document.getElementById('2fa-code'))
  }, null, { timeout: 30_000 })
}

/** Complete staff 2FA when the challenge or setup screen is shown. */
export async function completeStaff2fa(page: Page) {
  if (await page.locator('#2fa-secret').isVisible().catch(() => false)) {
    test.skip(true, 'E2E admin must finish 2FA enrollment, then set E2E_ADMIN_TOTP_SECRET')
  }

  const totpInput = page.locator('#login-totp, #2fa-code')
  if (!(await totpInput.first().isVisible().catch(() => false))) return

  if (!E2E_ADMIN.totpSecret) {
    test.skip(true, 'Set E2E_ADMIN_TOTP_SECRET — staff 2FA is required')
  }

  await totpInput.first().fill(generateTotp(E2E_ADMIN.totpSecret))
  await page.getByRole('button', { name: /verify/i }).first().click()
  await page.waitForURL(/\/admin/, { timeout: 30_000 })

  if (await page.locator('#2fa-code').isVisible().catch(() => false)) {
    await page.locator('#2fa-code').fill(generateTotp(E2E_ADMIN.totpSecret))
    await page.getByRole('button', { name: /verify/i }).first().click()
    await expect(page.locator('#2fa-code')).toBeHidden({ timeout: 20_000 })
  }
}

/** Admin UI login that completes required 2FA instead of skipping. */
export async function loginAdminUi(page: Page) {
  await loginUi(page, E2E_ADMIN.email, E2E_ADMIN.password)
  await completeStaff2fa(page)
}

/** Password grant + TOTP step-up so admin Edge Functions accept the session. */
export async function signInAdminApi(request: APIRequestContext): Promise<Session> {
  test.skip(!hasAdminTotp, 'Set E2E_ADMIN_TOTP_SECRET — staff 2FA is required for admin API E2E')
  const session = await signInApi(request, E2E_ADMIN.email, E2E_ADMIN.password)
  const code = generateTotp(E2E_ADMIN.totpSecret)
  const res = await request.post(`${SUPABASE_URL}/functions/v1/admin-2fa?action=verify`, {
    headers: edgeHeaders(session.accessToken),
    data: { code },
    failOnStatusCode: false,
  })
  const body = await res.json() as {
    code?: string
    step_up_token?: string
    message?: string
  }
  if (res.status() === 400 && body.code === 'ADMIN_2FA_SETUP_REQUIRED') {
    test.skip(true, 'E2E admin must finish 2FA enrollment, then set E2E_ADMIN_TOTP_SECRET')
  }
  expect(res.ok(), `Admin 2FA verify failed: ${res.status()} ${JSON.stringify(body)}`).toBeTruthy()
  expect(body.step_up_token).toBeTruthy()
  return { ...session, stepUpToken: body.step_up_token }
}
