/**
 * Staff 2FA is required. A password-grant JWT without a step-up token
 * must not reach admin Edge Functions. Happy-path admin API tests use
 * signInAdminApi + E2E_ADMIN_TOTP_SECRET.
 */
import { test, expect } from '@playwright/test'
import { E2E_ADMIN, hasAdminCreds } from './helpers/env'
import { signInApi, edgeJson } from './helpers/auth'

test.describe('Admin 2FA enforcement', () => {
  test.skip(!hasAdminCreds, 'Set E2E_ADMIN_EMAIL/PASSWORD + SUPABASE_URL + anon key')

  test('password-grant admin JWT without step-up is rejected', async ({ request }) => {
    const admin = await signInApi(request, E2E_ADMIN.email, E2E_ADMIN.password)
    const res = await edgeJson<{ code?: string }>(
      request,
      'GET',
      'admin-members',
      admin.accessToken,
      { query: 'page=1&per_page=1' },
    )
    expect([401, 403]).toContain(res.status)
    if (res.status === 401) {
      expect(String(res.body.code ?? '')).toMatch(/ADMIN_2FA/)
    }
  })
})
