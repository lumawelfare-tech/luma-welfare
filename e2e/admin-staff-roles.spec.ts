/**
 * Playwright: Staff & Roles UI gates (superadmin nav + non-admin API deny).
 * Full grant/revoke live flows wait until migration + function deploy.
 */
import { test, expect } from '@playwright/test'
import { BASE_URL, E2E_ADMIN, E2E_MEMBER, hasAdminCreds, hasMemberCreds } from './helpers/env'
import { loginUi, signInApi, edgeJson } from './helpers/auth'

test.describe('Admin Staff & Roles', () => {
  test('member JWT cannot call manage-user-role', async ({ request }) => {
    test.skip(!hasMemberCreds, 'Set E2E_MEMBER_EMAIL/PASSWORD')
    const member = await signInApi(request, E2E_MEMBER.email, E2E_MEMBER.password)
    const denied = await edgeJson(
      request,
      'POST',
      'manage-user-role',
      member.accessToken,
      { data: { action: 'grant', targetId: member.userId, roleName: 'support' } },
    )
    // 401/403 before deploy; 404 if function missing
    expect([401, 403, 404]).toContain(denied.status)
  })

  test('staff-roles page is reachable for admin session (gate may redirect)', async ({ page }) => {
    test.skip(!hasAdminCreds, 'Set E2E_ADMIN_EMAIL/PASSWORD')
    test.setTimeout(90_000)

    await loginUi(page, E2E_ADMIN.email, E2E_ADMIN.password)
    if (page.url().includes('verify') || await page.getByText(/two-factor|authenticator/i).isVisible().catch(() => false)) {
      test.skip(true, 'Admin 2FA enabled')
    }

    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(`${BASE_URL}/admin/staff-roles`)

    // Superadmin sees page; non-superadmin redirected to dashboard
    const onStaff = await page.getByRole('heading', { name: /staff & roles/i }).isVisible().catch(() => false)
    const onDash = page.url().includes('/admin/dashboard')
    expect(onStaff || onDash).toBe(true)

    if (onStaff) {
      await expect(page.getByLabel(/person/i).or(page.getByPlaceholder(/search by name/i))).toBeVisible()
      const assign = page.getByRole('button', { name: /assign role/i })
      await expect(assign).toBeVisible()
      const box = await assign.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
    }
  })
})
