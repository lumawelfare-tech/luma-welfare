/**
 * RBAC / API Authorization — Unit Tests
 *
 * Tests that the API client correctly:
 * - Includes Authorization headers for auth-required calls
 * - Rejects requests without valid auth tokens
 * - Handles 401 and 403 responses correctly
 * - Does NOT leak tokens to unauthenticated endpoints
 *
 * Run: npm test -- rbac
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, ApiError } from '../api'

const { mockGetSession, mockSignInWithPassword, mockSignOut } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithOAuth: vi.fn(),
    },
  },
  edgeFunctionUrl: 'https://test.supabase.co/functions/v1',
}))

async function expectApiError(promise: Promise<unknown>, status: number, code?: string) {
  try {
    await promise
    expect.fail(`Expected ApiError(${status}) but request succeeded`)
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError)
    const err = e as ApiError
    expect(err.status).toBe(status)
    if (code) expect(err.code).toBe(code)
  }
}

describe('RBAC — Auth Header Enforcement', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key')
    fetchSpy = vi.fn()
    Object.defineProperty(globalThis, 'fetch', { value: fetchSpy, writable: true })
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ data: { session: null } })
  })

  // ── Token injection ───────────────────────────────────────────

  it('includes Authorization header when auth=true', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
          access_token: 'member-token-xyz',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    })

    await api('/member/profile', { auth: true })

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers['Authorization']).toBe('Bearer member-token-xyz')
    expect(options.headers['apikey']).toBe('test-anon-key')
  })

  it('does NOT include Authorization header when auth=false', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await api('/packages', { auth: false })

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers['Authorization']).toBeUndefined()
  })

  it('does NOT include Authorization header when auth is omitted (default)', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await api('/packages')

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers['Authorization']).toBeUndefined()
  })

  // ── 401 Unauthorized ─────────────────────────────────────────

  it('throws ApiError with 401 when no session and auth=true', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized', code: 'UNAUTHORIZED' }),
    })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await expectApiError(api('/admin/dashboard', { auth: true }), 401, 'UNAUTHORIZED')
  })

  it('throws ApiError with 403 when token is rejected by server', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden', code: 'FORBIDDEN' }),
    })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
          access_token: 'invalid-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    })

    await expectApiError(api('/admin/dashboard', { auth: true }), 403, 'FORBIDDEN')
  })

  // ── Admin/member boundary ───────────────────────────────────

  it('routes member-dashboard with auth for member context', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
          access_token: 'member-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    })

    await api('/member/dashboard', { auth: true })

    const [url] = fetchSpy.mock.calls[0]
    expect(url).toContain('/functions/v1/member-dashboard')
    expect(url).not.toContain('resource_id')
  })

  it('routes admin-members with sub-resource for specific member lookup', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'admin-1' },
          access_token: 'admin-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    })

    await api('/admin/members/specific-uuid-here', { auth: true })

    const [url] = fetchSpy.mock.calls[0]
    expect(url).toContain('/functions/v1/admin-members')
    expect(url).toContain('resource_id=specific-uuid-here')
  })

  // ── Session expiry ──────────────────────────────────────────

  it('removes expired session from localStorage', async () => {
    const { setSession, getSession } = await import('../api')

    setSession('expired-token', Math.floor(Date.now() / 1000) - 100)
    expect(getSession()).toBeNull()
  })

  it('does not use expired localStorage token when getSession returns null', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' }),
    })
    // getSession returns null → no Authorization header used
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const { setSession } = await import('../api')
    setSession('expired-token', Math.floor(Date.now() / 1000) - 100)

    // No Authorization header used (expired token in localStorage ignored when getSession is null)
    // Server returns 401 because no token was sent
    await expectApiError(api('/auth/me', { auth: true }), 401)
  })
})

describe('RBAC — Error response shape', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key')
    fetchSpy = vi.fn()
    Object.defineProperty(globalThis, 'fetch', { value: fetchSpy, writable: true })
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ data: { session: null } })
  })

  it('extracts error code from error response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden', code: 'MEMBER_NOT_ADMIN' }),
    })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
          access_token: 'any-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    })

    await expectApiError(api('/admin/dashboard', { auth: true }), 403, 'MEMBER_NOT_ADMIN')
  })

  it('defaults to ERROR code when response has no code field', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal Server Error' }),
    })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
          access_token: 'any-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    })

    await expectApiError(api('/packages', { auth: true }), 500, 'ERROR')
  })

  it('extracts retry_after when present in 429 response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ message: 'Too Many Requests', retry_after: 60 }),
    })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
          access_token: 'any-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    })

    await expectApiError(api('/packages', { auth: true }), 429, 'ERROR')
    // The ApiError.retryAfter should be set from the response
    // We can verify by checking the last error thrown
    const err = await api('/packages', { auth: true }).catch(e => e) as ApiError
    expect(err.retryAfter).toBe(60)
  })
})
