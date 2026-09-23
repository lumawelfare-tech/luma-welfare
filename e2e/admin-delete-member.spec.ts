/**
 * Playwright: permanent delete UI gates (superadmin + closed only).
 * Skips without E2E admin credentials.
 */
import { test, expect } from '@playwright/test'
import { BASE_URL, E2E_MEMBER, hasAdminCreds, hasMemberCreds } from './helpers/env'
import { loginAdminUi, signInApi, signInAdminApi, edgeJson } from './helpers/auth'

test.describe('Admin permanent member delete', () => {
  test.skip(!hasAdminCreds, 'Set E2E_ADMIN_EMAIL/PASSWORD')

  test('non-closed rows have no permanent-delete control; API rejects non-closed', async ({ page, request }) => {
    test.setTimeout(90_000)
    const admin = await signInAdminApi(request)

    const list = await edgeJson<{ members?: Array<{ id: string; status: string }> }>(
      request,
      'GET',
      'admin-members',
      admin.accessToken,
      { query: 'status=active&per_page=5', stepUpToken: admin.stepUpToken },
    )
    expect([200, 403]).toContain(list.status)
    if (list.status !== 200) test.skip(true, 'Admin cannot list members in this env')

    const active = (list.body.members ?? []).find((m) => m.status === 'active')
    if (active) {
      const denied = await edgeJson(
        request,
        'POST',
        'admin-delete-member',
        admin.accessToken,
        { data: { memberId: active.id }, stepUpToken: admin.stepUpToken },
      )
      // Superadmin → 409 MEMBER_NOT_CLOSED; non-superadmin → 403
      expect([403, 409, 400]).toContain(denied.status)
    }

    await loginAdminUi(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${BASE_URL}/admin/members?status=active`)
    await expect(page.getByRole('heading', { name: /member/i }).first()).toBeVisible({ timeout: 25_000 })
    await expect(page.getByRole('button', { name: /permanently delete/i })).toHaveCount(0)
  })

  test('member JWT cannot call admin-delete-member', async ({ request }) => {
    test.skip(!hasMemberCreds, 'Set E2E_MEMBER_EMAIL/PASSWORD')
    const member = await signInApi(request, E2E_MEMBER.email, E2E_MEMBER.password)
    const denied = await edgeJson(
      request,
      'POST',
      'admin-delete-member',
      member.accessToken,
      { data: { memberId: member.userId } },
    )
    expect([401, 403]).toContain(denied.status)
  })
})
