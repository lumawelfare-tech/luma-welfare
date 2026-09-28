/**
 * Live Edge Function input-validation and hostile-input tests.
 *
 * Expected + unexpected inputs against the deployed API:
 *   missing input, invalid input, malformed JSON, wrong HTTP method,
 *   SQL-injection shaped strings, oversized payloads, open redirects,
 *   unknown endpoints, CORS origin enforcement, concurrent requests.
 *
 * Read-only / non-destructive: nothing is written to the database and no
 * account is created. Requires only SUPABASE_URL + the publishable key.
 *
 * Run: npx vitest run --config frontend/vitest.workspace-rls.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadConfig(): { url: string; anon: string } {
  const envPath = resolve(import.meta.dirname, '../../.env.local')
  let file: Record<string, string> = {}
  try {
    for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) file[m[1]] = m[2].trim()
    }
  } catch { /* ignore */ }

  const url = (process.env.SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || file.SUPABASE_URL
    || file.VITE_SUPABASE_URL
    || '').replace(/\/+$/, '')
  const anon = process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || file.SUPABASE_ANON_KEY
    || file.VITE_SUPABASE_PUBLISHABLE_KEY
    || ''

  return { url, anon }
}

const { url, anon } = loadConfig()
const live = Boolean(url && anon)
const describeLive = live ? describe : describe.skip

const BASE = url ? `${url}/functions/v1` : ''

type Res = { status: number; body: unknown; headers: Headers; ms: number; timedOut: boolean }

async function call(
  fn: string,
  opts: {
    method?: string
    body?: unknown
    rawBody?: string
    headers?: Record<string, string>
    origin?: string
    timeoutMs?: number
  } = {},
): Promise<Res> {
  const { method = 'POST', headers = {}, origin, timeoutMs = 30_000 } = opts
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}/${fn}`, {
      method,
      signal: controller.signal,
      headers: {
        apikey: anon,
        'Content-Type': 'application/json',
        ...(origin ? { Origin: origin } : {}),
        ...headers,
      },
      body: opts.rawBody !== undefined
        ? opts.rawBody
        : opts.body !== undefined
          ? JSON.stringify(opts.body)
          : undefined,
    })
    let body: unknown = null
    try {
      body = await res.json()
    } catch { /* non-JSON body */ }
    return { status: res.status, body, headers: res.headers, ms: Date.now() - started, timedOut: false }
  } catch {
    return { status: 0, body: null, headers: new Headers(), ms: Date.now() - started, timedOut: true }
  } finally {
    clearTimeout(timer)
  }
}

function code(res: Res): string {
  return (res.body as { code?: string } | null)?.code ?? ''
}

function message(res: Res): string {
  return (res.body as { message?: string } | null)?.message ?? ''
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The auth endpoints are rate-limited (`auth-login` 10/60s,
 * `auth-forgot-password` 5/300s, `auth-register` 5/300s,
 * `auth-verify-email` 10/60s) with the limiter running BEFORE validation.
 * A rerun inside the same window therefore legitimately answers 429 instead
 * of the validation payload. The invariant that must always hold is that the
 * request is rejected — never 5xx, never 2xx — and that a validating request
 * reports `VALIDATION`.
 */
function expectRejected(r: Res, messageWhen400?: string | RegExp): void {
  expect(r.timedOut, `request hung for ${r.ms}ms instead of answering`).toBe(false)
  expect(
    r.status,
    `unexpected status ${r.status} for ${JSON.stringify(r.body)}`,
  ).toBeLessThan(500)
  expect([400, 401, 403, 405, 429]).toContain(r.status)
  if (r.status !== 400) return
  expect(code(r)).toBe('VALIDATION')
  if (messageWhen400 !== undefined) {
    if (messageWhen400 instanceof RegExp) expect(message(r)).toMatch(messageWhen400)
    else expect(message(r)).toBe(messageWhen400)
  }
}

/**
 * Strict call for assertions that need the real payload rather than 429.
 * Waits out one rate-limit window (bounded to 70s) if the limiter answers.
 */
async function callStrict(
  fn: string,
  opts: Parameters<typeof call>[1] = {},
): Promise<Res> {
  let r = await call(fn, opts)
  expect(r.timedOut, `${fn} hung for ${r.ms}ms on the first attempt`).toBe(false)
  if (r.status !== 429) return r
  const retryAfter = Number((r.body as { retry_after?: number } | null)?.retry_after ?? 60)
  await sleep(Math.min(retryAfter, 70) * 1000 + 750)
  r = await call(fn, opts)
  expect(r.timedOut, `${fn} hung for ${r.ms}ms after the retry`).toBe(false)
  expect(r.status, `${fn} still rate limited after waiting out the window`).not.toBe(429)
  return r
}

describeLive('API input validation (live)', () => {
  it('rejects a body with no fields', async () => {
    const r = await callStrict('auth-login', { body: {} })
    expect(r.status).toBe(400)
    expect(code(r)).toBe('VALIDATION')
    expect(message(r)).toBe('Email is required.')
  })

  it('rejects an invalid email', async () => {
    const r = await callStrict('auth-login', { body: { email: 'not-an-email', password: 'x' } })
    expect(r.status).toBe(400)
    expect(code(r)).toBe('VALIDATION')
    expect(message(r)).toBe('Enter a valid email address.')
  })

  it('rejects a missing password for a well-formed email', async () => {
    const r = await callStrict('auth-login', { body: { email: 'someone@example.com' } })
    expect(r.status).toBe(400)
    expect(code(r)).toBe('VALIDATION')
  })

  it('rejects a JSON array body', async () => {
    const r = await callStrict('auth-login', { body: ['a', 'b'] })
    expect(r.status).toBe(400)
    expect(message(r)).toBe('Invalid request body.')
  })

  it('rejects a JSON primitive body', async () => {
    const r = await callStrict('auth-login', { rawBody: '"just a string"' })
    expect(r.status).toBe(400)
    expect(code(r)).toBe('VALIDATION')
  })

  it('rejects malformed JSON without a 5xx', async () => {
    const r = await callStrict('auth-login', { rawBody: 'not-json-at-all' })
    expect(r.status).toBe(400)
    expect(message(r)).toBe('Invalid JSON body.')
  })

  it('rejects an unsupported HTTP method with 405', async () => {
    const r = await callStrict('auth-login', { method: 'PUT', body: {} })
    expect(r.status).toBe(405)
    expect(message(r)).toMatch(/method not allowed/i)
  })

  it('rejects credentials with a wrong password using 401, not a server error', async () => {
    const r = await callStrict('auth-login', {
      body: { email: 'definitely-not-a-real-user@example.com', password: 'WrongPass123' },
    })
    expect(r.status).toBe(401)
    expect(code(r)).toBe('INVALID_LOGIN')
  })
})

describeLive('Hostile input (live)', () => {
  it('rejects a SQL-injection shaped email without a 5xx', async () => {
    const r = await call('auth-login', {
      body: { email: "' OR '1'='1 --@x.co", password: 'pw' },
    })
    expectRejected(r)
  })

  it('does not 500 on an oversized password', async () => {
    const opts = {
      body: { email: 'someone@example.com', password: 'z'.repeat(150_000) },
      timeoutMs: 45_000,
    }
    let r = await callStrict('auth-login', opts)
    // The deployed function occasionally cold-starts on the first large body;
    // one retry distinguishes a hang from a one-off cold start.
    if (r.timedOut) r = await callStrict('auth-login', opts)
    expect(r.timedOut, `auth-login hung for ${r.ms}ms on a 150KB password`).toBe(false)
    expect(r.status).toBe(400)
    expect(code(r)).toBe('VALIDATION')
    expect(message(r)).toBe('Invalid credentials payload.')
  }, 180_000)

  it('does not 500 on an oversized email', async () => {
    const r = await call('auth-login', {
      body: { email: `${'a'.repeat(4000)}@example.com`, password: 'pw' },
    })
    expectRejected(r)
  })

  it('rejects an open redirect on password reset', async () => {
    const r = await call('auth-forgot-password', {
      body: { email: 'someone@example.com', redirectTo: 'https://evil.example/reset-password' },
    })
    expectRejected(r, 'Invalid reset redirect.')
  })

  it('rejects a same-origin redirect to a different path', async () => {
    const r = await call('auth-forgot-password', {
      body: { email: 'someone@example.com', redirectTo: 'https://luma-welfare.vercel.app/admin' },
    })
    expectRejected(r, 'Invalid reset redirect.')
  })

  it('rejects a redirect carrying embedded credentials', async () => {
    const r = await call('auth-forgot-password', {
      body: {
        email: 'someone@example.com',
        redirectTo: 'https://user:pass@luma-welfare.vercel.app/reset-password',
      },
    })
    expectRejected(r, 'Invalid reset redirect.')
  })

  it('rejects a non-URL redirect', async () => {
    const r = await call('auth-forgot-password', {
      body: { email: 'someone@example.com', redirectTo: 'javascript:alert(1)' },
    })
    expectRejected(r, 'Invalid reset redirect.')
  })

  it('rejects an unknown verification action', async () => {
    const r = await call('auth-verify-email', {
      body: { action: 'delete-all', email: 'someone@example.com' },
    })
    expectRejected(r, 'Invalid action.')
  })

  it('rejects an incomplete registration payload', async () => {
    const r = await call('auth-register', { body: { email: 'someone@example.com' } })
    expectRejected(r, 'Full name is required.')
  })

  it('rejects a registration array body', async () => {
    const r = await call('auth-register', { body: [] })
    expectRejected(r, 'Invalid request body.')
  })
})

describeLive('Unknown endpoints and methods (live)', () => {
  it('returns 404 for an unknown function', async () => {
    const res = await fetch(`${BASE}/definitely-not-a-function`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(404)
  })

  it('rejects non-GET on public-data with 405', async () => {
    const r = await call('public-data', { method: 'POST', body: {} })
    expect(r.status).toBe(405)
    expect(message(r)).toMatch(/method not allowed/i)
  })

  it('rejects an unknown public-data resource with 400', async () => {
    const r = await fetch(`${BASE}/public-data?resource=nope`, {
      headers: { apikey: anon },
    })
    expect(r.status).toBe(400)
    expect(await r.json()).toHaveProperty('message')
  })

  it('still returns 200 with no resource parameter', async () => {
    const r = await fetch(`${BASE}/public-data`, { headers: { apikey: anon } })
    expect(r.status).toBe(200)
    expect(await r.json()).toHaveProperty('packages')
  })
})

describeLive('CORS enforcement (live)', () => {
  it('reflects an allow-listed origin on preflight', async () => {
    const res = await fetch(`${BASE}/auth-login`, {
      method: 'OPTIONS',
      headers: {
        apikey: anon,
        Origin: 'https://luma-welfare.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://luma-welfare.vercel.app')
  })

  it('does not reflect a hostile origin', async () => {
    const res = await fetch(`${BASE}/auth-login`, {
      method: 'OPTIONS',
      headers: {
        apikey: anon,
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST',
      },
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example')
  })

  it('does not reflect a null origin', async () => {
    const res = await fetch(`${BASE}/auth-login`, {
      method: 'OPTIONS',
      headers: {
        apikey: anon,
        Origin: 'null',
        'Access-Control-Request-Method': 'POST',
      },
    })
    expect(res.headers.get('access-control-allow-origin')).not.toBe('null')
  })
})

describeLive('Concurrent requests (live)', () => {
  it('rate limits a burst of auth-logins and never answers 5xx', async () => {
    const results = await Promise.all(
      Array.from({ length: 15 }, () => call('auth-login', { body: {} })),
    )
    const limited = results.filter((r) => r.status === 429)
    const validated = results.filter((r) => r.status === 400)

    for (const r of results) {
      expect(r.status, `unexpected status ${r.status}`).toBeLessThan(500)
      expect([400, 429]).toContain(r.status)
    }
    // auth-login allows 10 per 60s; 15 parallel requests must trip the limiter.
    expect(limited.length, 'rate limiter did not engage on auth-login').toBeGreaterThan(0)
    expect(validated.length + limited.length).toBe(results.length)

    const sample = limited[0]
    expect(code(sample)).toBe('RATE_LIMITED')
    expect(message(sample)).toMatch(/too many requests/i)
    expect(sample.headers.get('retry-after')).toBeTruthy()
    expect(Number(sample.headers.get('x-ratelimit-limit'))).toBeLessThanOrEqual(15)
  })

  it('answers 10 parallel public reads successfully', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        fetch(`${BASE}/public-data?resource=packages`, { headers: { apikey: anon } }),
      ),
    )
    for (const r of results) expect(r.status).toBe(200)
  })
})

describeLive('Unauthenticated access to protected functions (live)', () => {
  const protectedFns = ['admin-dashboard', 'admin-members', 'admin-settings', 'auth-me', 'member-dashboard']

  it.each(protectedFns)('%s refuses a missing token with 401', async (fn) => {
    const r = await call(fn, { method: 'GET' })
    expect(r.status).toBe(401)
    expect(message(r)).toBeTruthy()
  })

  it.each(protectedFns)('%s refuses a garbage token with 401', async (fn) => {
    const r = await call(fn, { method: 'GET', headers: { Authorization: 'Bearer garbage.token.here' } })
    expect(r.status).toBe(401)
  })

  it('refuses an expired/undecodable bearer token on an admin function', async () => {
    const expired = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'eyJzdWIiOiJhZG1pbi0xIiwicm9sZSI6ImFkbWluIn0',
      'invalid-signature',
    ].join('.')
    const r = await call('admin-dashboard', { method: 'GET', headers: { Authorization: `Bearer ${expired}` } })
    expect(r.status).toBe(401)
  })
})
