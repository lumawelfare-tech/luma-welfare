import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getSession, setSession, clearSession, ApiError } from '../api'

// ─── Session Management ──────────────────────────────────────

describe('Session Management', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when no session exists', () => {
    expect(getSession()).toBeNull()
  })

  it('stores and retrieves a session', () => {
    setSession('test-token-123', Date.now() / 1000 + 3600)
    const session = getSession()
    expect(session).not.toBeNull()
    expect(session?.access_token).toBe('test-token-123')
  })

  it('returns null for expired sessions', () => {
    setSession('expired-token', Date.now() / 1000 - 100)
    const session = getSession()
    expect(session).toBeNull()
  })

  it('clears the session', () => {
    setSession('token-to-clear')
    clearSession()
    expect(getSession()).toBeNull()
  })

  it('handles corrupted localStorage data gracefully', () => {
    localStorage.setItem('luma_session', 'not-valid-json{{{')
    expect(getSession()).toBeNull()
  })
})

// ─── ApiError ─────────────────────────────────────────────────

describe('ApiError', () => {
  it('creates an error with status, message, and code', () => {
    const err = new ApiError(401, 'Unauthorized', 'UNAUTHORIZED')
    expect(err.status).toBe(401)
    expect(err.message).toBe('Unauthorized')
    expect(err.code).toBe('UNAUTHORIZED')
    expect(err instanceof Error).toBe(true)
  })

  it('defaults code to ERROR', () => {
    const err = new ApiError(500, 'Server error')
    expect(err.code).toBe('ERROR')
  })
})

// ─── API Retry Logic ─────────────────────────────────────────

describe('API Retry Logic', () => {
  let spy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    spy = vi.fn()
    Object.defineProperty(globalThis, 'fetch', { value: spy, writable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not retry on 401 (auth failure)', async () => {
    spy.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized', code: 'UNAUTHORIZED' }),
    })

    const { api } = await import('../api')
    await expect(api('/auth/me', { auth: true })).rejects.toThrow('Unauthorized')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not retry on 403 (forbidden)', async () => {
    spy.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    })

    const { api } = await import('../api')
    await expect(api('/admin/dashboard', { auth: true })).rejects.toThrow('Forbidden')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('retries on 503 (transient failure)', async () => {
    let callCount = 0
    spy.mockImplementation(async () => {
      callCount++
      if (callCount < 3) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ message: 'Service Unavailable' }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: 'success' }),
      }
    })

    const { api } = await import('../api')
    // Fire the API call and advance fake timers to resolve setTimeout delays
    const promise = api('/packages')
    await vi.advanceTimersByTimeAsync(500) // 1st retry delay
    await vi.advanceTimersByTimeAsync(1000) // 2nd retry delay
    const result = await promise
    expect(result).toEqual({ data: 'success' })
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('gives up after MAX_RETRIES on transient failure', async () => {
    spy.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ message: 'Bad Gateway' }),
    })

    const { api } = await import('../api')
    try {
      const promise = api('/packages')
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(1000)
      await promise
      expect.fail('Should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
    }
    // 1 initial + 2 retries = 3 calls
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('does not retry POST by default', async () => {
    spy.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: 'Service Unavailable' }),
    })

    const { api } = await import('../api')
    await expect(api('/admin/members', { method: 'POST', auth: true, body: {} })).rejects.toThrow()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

// ─── API Path Routing ────────────────────────────────────────

describe('API Path Routing', () => {
  let spy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    })
    Object.defineProperty(globalThis, 'fetch', { value: spy, writable: true })
  })

  it('maps admin/dashboard to admin-dashboard function', async () => {
    const { api } = await import('../api')
    await api('/admin/dashboard', { auth: true })
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/admin-dashboard'),
      expect.anything(),
    )
  })

  it('maps admin/media to admin-media function', async () => {
    const { api } = await import('../api')
    await api('/admin/media', { auth: true })
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/admin-media'),
      expect.anything(),
    )
  })

  it('maps public media to public-data function', async () => {
    const { api } = await import('../api')
    await api('/media')
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/public-data'),
      expect.anything(),
    )
  })

  it('maps admin/2fa to admin-2fa function', async () => {
    const { api } = await import('../api')
    await api('/admin/2fa', { auth: true })
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/admin-2fa'),
      expect.anything(),
    )
  })

  it('passes query params through', async () => {
    const { api } = await import('../api')
    await api('/admin/media?page=1&per_page=10', { auth: true })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('page=1')
    expect(url).toContain('per_page=10')
  })

  it('converts sub-resource paths to resource_id param', async () => {
    const { api } = await import('../api')
    await api('/admin/media/some-uuid-123', { method: 'DELETE', auth: true })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('resource_id=some-uuid-123')
  })

  it('throws on unknown paths', async () => {
    const { api } = await import('../api')
    await expect(api('/nonexistent/path')).rejects.toThrow('Unknown API path')
  })
})
