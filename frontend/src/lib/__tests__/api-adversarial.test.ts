/**
 * Adversarial / error-state tests for the API client.
 *
 * Expected and unexpected inputs:
 *  - network failures (offline, DNS, CORS)
 *  - malformed / non-JSON responses
 *  - transient API failures (408 / 429 / 5xx) and retry policy
 *  - expired sessions (localStorage + admin 2FA step-up token)
 *  - concurrent requests
 *  - query-parameter injection through sub-resource path segments
 *  - FormData uploads
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  api,
  ApiError,
  setSession,
  clearSession,
  setAdmin2faStepUpToken,
  getAdmin2faStepUpToken,
  clearAdmin2faStepUpToken,
} from '../api'

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: mockGetSession } },
  edgeFunctionUrl: 'https://test.supabase.co/functions/v1',
}))

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })
const fail = (status: number, data: unknown) => ({ ok: false, status, json: async () => data })

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  Object.defineProperty(globalThis, 'fetch', { value: fetchSpy, writable: true })
  localStorage.clear()
  sessionStorage.clear()
  mockGetSession.mockReset().mockResolvedValue({ data: { session: null } })
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Network failures ────────────────────────────────────────

describe('network failures', () => {
  it('maps a rejected fetch on a mutation to ApiError(0, NETWORK) without retrying', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(api('/admin/members', { method: 'POST', auth: true, body: {} })).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK',
      message: 'Unable to reach the server. Check your connection and try again.',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('retries a GET network failure MAX_RETRIES times before surfacing NETWORK', async () => {
    vi.useFakeTimers()
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))

    const settled = api('/packages').then(() => 'resolved', (e) => e)
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1000)
    const err = await settled

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('NETWORK')
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('wraps a non-Error rejection into an ApiError', async () => {
    fetchSpy.mockRejectedValue('boom')

    await expect(api('/admin/members', { method: 'POST', auth: true, body: {} })).rejects.toBeInstanceOf(ApiError)
  })
})

// ─── Malformed responses ─────────────────────────────────────

describe('malformed responses', () => {
  it('returns null when a 200 response body is not valid JSON', async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json') } })

    await expect(api('/packages')).resolves.toBeNull()
  })

  it('falls back to a generic message when a 500 body is not valid JSON', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new SyntaxError('bad json') } })

    await expect(api('/packages')).rejects.toMatchObject({
      status: 500,
      code: 'ERROR',
      message: 'Something went wrong. Try again.',
    })
  })

  it('parses retry_after into ApiError.retryAfter', async () => {
    fetchSpy.mockResolvedValue(fail(429, { message: 'Slow down', code: 'RATE_LIMITED', retry_after: 30 }))

    await expect(api('/admin/members', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      retryAfter: 30,
    })
  })

  it('ignores a non-numeric retry_after', async () => {
    fetchSpy.mockResolvedValue(fail(429, { message: 'Slow down', retry_after: 'soon' }))

    await expect(api('/admin/members', { method: 'POST', body: {} })).rejects.toMatchObject({ retryAfter: null })
  })
})

// ─── Retry policy ────────────────────────────────────────────

describe('retry policy', () => {
  it('retries GET on 429 then succeeds', async () => {
    vi.useFakeTimers()
    fetchSpy.mockResolvedValueOnce(fail(429, { message: 'Too many' })).mockResolvedValueOnce(ok({ items: [] }))

    const settled = api('/packages').then((v) => v, (e) => e)
    await vi.advanceTimersByTimeAsync(500)
    const result = await settled

    expect(result).toEqual({ items: [] })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('retries GET on 408 then succeeds', async () => {
    vi.useFakeTimers()
    fetchSpy.mockResolvedValueOnce(fail(408, { message: 'Timeout' })).mockResolvedValueOnce(ok({ items: [] }))

    const settled = api('/packages').then((v) => v, (e) => e)
    await vi.advanceTimersByTimeAsync(500)
    const result = await settled

    expect(result).toEqual({ items: [] })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('honours retry:false for GET', async () => {
    fetchSpy.mockResolvedValue(fail(503, { message: 'Unavailable' }))

    await expect(api('/packages', { retry: false })).rejects.toMatchObject({ status: 503 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('honours retry:true for an explicit mutation opt-in', async () => {
    vi.useFakeTimers()
    fetchSpy.mockResolvedValue(fail(503, { message: 'Unavailable' }))

    const settled = api('/admin/members', { method: 'POST', body: {}, retry: true }).then((v) => v, (e) => e)
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1000)
    await settled

    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('treats a lowercase method as retryable', async () => {
    vi.useFakeTimers()
    fetchSpy.mockResolvedValueOnce(fail(503, { message: 'Unavailable' })).mockResolvedValueOnce(ok({ ok: true }))

    const settled = api('/packages', { method: 'get' }).then((v) => v, (e) => e)
    await vi.advanceTimersByTimeAsync(500)
    const result = await settled

    expect(result).toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

// ─── Admin 2FA step-up token ─────────────────────────────────

describe('admin 2FA step-up token', () => {
  it('sends x-admin-2fa-token for admin functions', async () => {
    setAdmin2faStepUpToken('step-up-abc', Date.now() / 1000 + 300)
    fetchSpy.mockResolvedValue(ok({}))

    await api('/admin/dashboard', { auth: true })

    expect(fetchSpy.mock.calls[0][1].headers['x-admin-2fa-token']).toBe('step-up-abc')
  })

  it('never sends x-admin-2fa-token for non-admin functions', async () => {
    setAdmin2faStepUpToken('step-up-abc', Date.now() / 1000 + 300)
    fetchSpy.mockResolvedValue(ok({}))

    await api('/member/dashboard', { auth: true })

    expect(fetchSpy.mock.calls[0][1].headers['x-admin-2fa-token']).toBeUndefined()
  })

  it('drops an expired step-up token instead of sending it', () => {
    setAdmin2faStepUpToken('stale', Date.now() / 1000 - 10)
    expect(getAdmin2faStepUpToken()).toBeNull()
    expect(sessionStorage.getItem('luma_admin_2fa_token')).toBeNull()
  })

  it('clearSession also clears the step-up token', async () => {
    setSession('tok')
    setAdmin2faStepUpToken('step-up-abc', Date.now() / 1000 + 300)
    clearSession()

    expect(getSessionToken()).toBeNull()
    expect(getAdmin2faStepUpToken()).toBeNull()
  })

  it('survives corrupted step-up storage', () => {
    sessionStorage.setItem('luma_admin_2fa_token', '{{{not json')
    expect(getAdmin2faStepUpToken()).toBeNull()
  })
})

function getSessionToken(): string | null {
  const raw = localStorage.getItem('luma_session')
  if (!raw) return null
  try {
    return (JSON.parse(raw) as { access_token?: string }).access_token ?? null
  } catch {
    return null
  }
}

// ─── Auth headers / expired sessions ─────────────────────────

describe('auth headers', () => {
  it('sends the Supabase session token when present', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'sb-token' } },
    })
    fetchSpy.mockResolvedValue(ok({}))

    await api('/member/dashboard', { auth: true })

    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer sb-token')
  })

  it('falls back to the stored local session when Supabase has none', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    setSession('local-token', Date.now() / 1000 + 600)
    fetchSpy.mockResolvedValue(ok({}))

    await api('/member/dashboard', { auth: true })

    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer local-token')
  })

  it('does not send a token for an expired local session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    setSession('expired-token', Date.now() / 1000 - 600)
    fetchSpy.mockResolvedValue(ok({}))

    await api('/member/dashboard', { auth: true })

    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('always attaches a unique x-request-id', async () => {
    fetchSpy.mockResolvedValue(ok({}))

    await api('/packages')
    await api('/packages')

    const ids = fetchSpy.mock.calls.map((c) => c[1].headers['x-request-id'])
    expect(ids[0]).toMatch(/^req_/)
    expect(new Set(ids).size).toBe(2)
  })
})

// ─── Query-parameter injection ───────────────────────────────

describe('sub-resource path injection', () => {
  it('percent-encodes a sub-resource id so it cannot inject query params', async () => {
    fetchSpy.mockResolvedValue(ok({}))

    await api('/admin/media/x&admin=true', { method: 'DELETE', auth: true })

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('resource_id=x%26admin%3Dtrue')
    expect(url).not.toContain('admin=true')
  })

  it('forwards the action segment for nested admin paths', async () => {
    fetchSpy.mockResolvedValue(ok({}))

    await api('/admin/members/some-uuid/status', { method: 'POST', auth: true })

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('resource_id=some-uuid')
    expect(url).toContain('action=status')
  })

  it('keeps caller-supplied query strings intact', async () => {
    fetchSpy.mockResolvedValue(ok({}))

    await api('/news?resource=news')

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('resource=news')
  })
})

// ─── Concurrent requests ─────────────────────────────────────

describe('concurrent requests', () => {
  it('resolves parallel calls independently without cross-talk', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      await new Promise((r) => setTimeout(r, 5))
      return ok({ url })
    })

    const [a, b, c] = await Promise.all([
      api<{ url: string }>('/packages'),
      api<{ url: string }>('/news'),
      api<{ url: string }>('/gallery'),
    ])

    expect(a.url).toContain('public-data')
    expect(b.url).toContain('resource=news')
    expect(c.url).toContain('resource=gallery')

    const ids = fetchSpy.mock.calls.map((call) => call[1].headers['x-request-id'])
    expect(new Set(ids).size).toBe(3)
  })

  it('keeps a rejection isolated to the failing call', async () => {
    fetchSpy
      .mockResolvedValueOnce(ok({ ok: true }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const [good, bad] = await Promise.allSettled([
      api('/packages'),
      api('/admin/members', { method: 'POST', body: {} }),
    ])

    expect(good.status).toBe('fulfilled')
    expect(bad.status).toBe('rejected')
    if (bad.status === 'rejected') expect(bad.reason).toBeInstanceOf(ApiError)
  })
})

// ─── Request body handling ───────────────────────────────────

describe('request body handling', () => {
  it('does not set Content-Type for FormData uploads', async () => {
    fetchSpy.mockResolvedValue(ok({}))

    const form = new FormData()
    form.append('file', new Blob(['x']), 'x.txt')

    await api('/member/identity-docs', { method: 'POST', auth: true, body: form })

    const options = fetchSpy.mock.calls[0][1]
    expect(options.headers['Content-Type']).toBeUndefined()
    expect(options.body).toBe(form)
  })

  it('serialises plain objects to JSON', async () => {
    fetchSpy.mockResolvedValue(ok({}))

    await api('/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'x' } })

    const options = fetchSpy.mock.calls[0][1]
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({ email: 'a@b.co', password: 'x' })
  })

  it('never sends a body for GET requests', async () => {
    fetchSpy.mockResolvedValue(ok({}))

    await api('/packages')

    expect(fetchSpy.mock.calls[0][1].body).toBeUndefined()
  })

  it('throws ApiError instead of crashing on an unserialisable body', async () => {
    fetchSpy.mockResolvedValue(ok({}))

    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    await expect(api('/admin/members', { method: 'POST', auth: true, body: cyclic })).rejects.toBeInstanceOf(ApiError)
  })
})

// ─── public-data resource contract (regression) ──────────────

describe('public-data resource contract', () => {
  it('derives resource= from a bare public path', async () => {
    fetchSpy.mockResolvedValue(ok({}))

    await api('/news')

    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://test.supabase.co/functions/v1/public-data?resource=news',
    )
  })

  it('lets an explicit ?resource= win over the derived one', async () => {
    fetchSpy.mockResolvedValue(ok({}))

    await api('/news?resource=gallery')

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('resource=gallery')
    expect(url.match(/resource=/g)).toHaveLength(1)
  })

  it('keeps resource_id for non-public sub-resources', async () => {
    fetchSpy.mockResolvedValue(ok({}))

    await api('/admin/reports/some-id')

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('resource_id=some-id')
    expect(url).not.toContain('resource=some-id')
  })
})

// ─── Unknown routes ──────────────────────────────────────────

describe('unknown routes', () => {
  it('rejects an unmapped path without touching the network', async () => {
    await expect(api('/totally/unknown')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('clears the stored step-up token on module-level cleanup', () => {
    setAdmin2faStepUpToken('abc', Date.now() / 1000 + 60)
    clearAdmin2faStepUpToken()
    expect(getAdmin2faStepUpToken()).toBeNull()
  })
})
