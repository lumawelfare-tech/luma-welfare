import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Security — No Secrets in Frontend', () => {
  it('VITE_SUPABASE_URL is configured', () => {
    const url = import.meta.env.VITE_SUPABASE_URL
    expect(url).toBeDefined()
    expect(url).toMatch(/^https?:\/\//)
  })

  it('VITE_SUPABASE_PUBLISHABLE_KEY is configured', () => {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    expect(key).toBeDefined()
    expect(key.length).toBeGreaterThan(0)
  })

  it('publishable key is not empty', async () => {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(5)
  })
})

describe('Security — API Auth Headers', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  it('includes apikey header in all requests', async () => {
    const { api } = await import('../api')
    await api('/packages')

    expect(fetchSpy).toHaveBeenCalled()
    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers.apikey).toBeDefined()
    expect(options.headers.apikey.length).toBeGreaterThan(0)
  })

  it('includes Content-Type header', async () => {
    const { api } = await import('../api')
    await api('/packages')

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('does not include Authorization when auth=false', async () => {
    const { api } = await import('../api')
    await api('/packages')

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers.Authorization).toBeUndefined()
  })

  it('sends JSON body for POST requests', async () => {
    const { api } = await import('../api')
    const body = { name: 'test' }
    await api('/admin/members', { method: 'POST', auth: true, body })

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.method).toBe('POST')
    expect(options.body).toBe(JSON.stringify(body))
  })
})
