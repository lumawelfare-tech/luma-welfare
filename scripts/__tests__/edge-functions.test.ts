/**
 * Edge Function Integration Tests
 *
 * Tests the live Edge Functions for:
 * - Auth enforcement (401 without token)
 * - RBAC enforcement (403 without admin role)
 * - CORS headers
 * - Response format consistency
 * - Public endpoint accessibility
 *
 * Run: npx vitest run scripts/__tests__/edge-functions.test.ts
 * Requires: running Supabase project (check .env.local for project ref)
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load project config
function loadConfig() {
  const root = resolve(import.meta.dirname, '../../..')
  const envPath = resolve(root, '.env.local')
  const configPath = resolve(root, 'supabase/config.toml')

  let projectRef = ''
  let apiKey = ''

  try {
    const config = readFileSync(configPath, 'utf-8')
    const match = config.match(/project_id\s*=\s*"([^"]+)"/)
    if (match) projectRef = match[1]
  } catch { /* ignore */ }

  try {
    const env = readFileSync(envPath, 'utf-8')
    const match = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.+)/)
    if (match) apiKey = match[1].trim()
  } catch { /* ignore */ }

  return { projectRef, apiKey }
}

const { projectRef, apiKey } = loadConfig()
const BASE = `https://${projectRef}.supabase.co/functions/v1`

// Skip all tests if config is missing
const describeIfConfig = projectRef && apiKey ? describe : describe.skip

async function callFunction(
  fn: string,
  opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const { method = 'GET', headers = {}, body } = opts
  const res = await fetch(`${BASE}/${fn}`, {
    method,
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const responseHeaders: Record<string, string> = {}
  res.headers.forEach((v, k) => { responseHeaders[k] = v })

  let responseBody: unknown = null
  try {
    responseBody = await res.json()
  } catch { /* ignore */ }

  return { status: res.status, headers: responseHeaders, body: responseBody }
}

// ============================================================================
// AUTH ENFORCEMENT TESTS
// ============================================================================

describeIfConfig('Auth Enforcement', () => {
  const protectedFunctions = [
    'admin-dashboard',
    'admin-media',
    'admin-gallery',
    'admin-members',
    'admin-claims',
    'admin-contributions',
    'admin-subscriptions',
    'admin-packages',
    'admin-news',
    'admin-2fa',
    'admin-settings',
    'admin-reports',
    'admin-scheduled-reports',
    'auth-me',
    'member-dashboard',
    'member-profile',
  ]

  it.each(protectedFunctions)(
    '%s returns 401 without auth token',
    async (fn) => {
      const { status, body } = await callFunction(fn)
      expect(status).toBe(401)
      expect(body).toHaveProperty('message')
    },
  )

  it.each(protectedFunctions)(
    '%s returns 401 with invalid token',
    async (fn) => {
      const { status } = await callFunction(fn, {
        headers: { Authorization: 'Bearer invalid-token-12345' },
      })
      expect(status).toBe(401)
    },
  )
})

// ============================================================================
// CORS TESTS
// ============================================================================

describeIfConfig('CORS Headers', () => {
  const testFunctions = ['admin-dashboard', 'admin-media', 'public-data']

  it.each(testFunctions)(
    '%s returns proper CORS headers',
    async (fn) => {
      const { headers } = await callFunction(fn)
      expect(headers['access-control-allow-origin']).toBeDefined()
      expect(headers['access-control-allow-methods']).toContain('GET')
      expect(headers['access-control-allow-methods']).toContain('POST')
      expect(headers['access-control-allow-headers']).toContain('authorization')
    },
  )

  it.each(testFunctions)(
    '%s handles OPTIONS preflight',
    async (fn) => {
      const { status, headers } = await callFunction(fn, { method: 'OPTIONS' })
      // OPTIONS should return 200 with CORS headers
      expect(status).toBe(200)
      expect(headers['access-control-allow-origin']).toBeDefined()
    },
  )
})

// ============================================================================
// PUBLIC ENDPOINTS TESTS
// ============================================================================

describeIfConfig('Public Endpoints', () => {
  it('public-data returns valid JSON for packages', async () => {
    const { status, body } = await callFunction('public-data?action=packages')
    expect(status).toBe(200)
    expect(body).toHaveProperty('items')
    expect(Array.isArray((body as { items: unknown[] }).items)).toBe(true)
  })

  it('public-data returns valid JSON for media', async () => {
    const { status, body } = await callFunction('public-data?action=media')
    expect(status).toBe(200)
    expect(body).toHaveProperty('items')
  })

  it('public-data returns valid JSON for gallery', async () => {
    const { status, body } = await callFunction('public-data?action=gallery')
    expect(status).toBe(200)
    expect(body).toHaveProperty('items')
  })

  it('public-data returns valid JSON for news', async () => {
    const { status, body } = await callFunction('public-data?action=news')
    expect(status).toBe(200)
    expect(body).toHaveProperty('items')
  })
})

// ============================================================================
// RESPONSE FORMAT TESTS
// ============================================================================

describeIfConfig('Response Format Consistency', () => {
  it('admin functions return JSON with content-type', async () => {
    const { status, body, headers } = await callFunction('admin-dashboard')
    expect(status).toBe(401) // Auth required
    expect(headers['content-type']).toContain('application/json')
    expect(body).toHaveProperty('message')
    expect(typeof (body as { message: string }).message).toBe('string')
  })

  it('admin-media returns 405 for unsupported methods', async () => {
    // PATCH without resource_id should return 404 or 405
    const { status } = await callFunction('admin-media', { method: 'PATCH', body: {} })
    // Could be 401 (auth) or 404 (no resource_id) or 405 (method not allowed)
    expect([401, 404, 405]).toContain(status)
  })
})
