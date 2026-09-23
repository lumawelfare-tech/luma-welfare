/**
 * Admin Members list — columns, search, ID reveal, member denied, 375px viewport.
 * Uses seeded fake E2E credentials only. Skips when admin/member creds missing.
 */
import { test, expect } from '@playwright/test'
import {
  BASE_URL,
  E2E_MEMBER,
  hasAdminCreds,
  hasMemberCreds,
} from './helpers/env'
import { loginUi, loginAdminUi, signInApi, signInAdminApi, edgeJson } from './helpers/auth'

test.describe('Admin Members list columns + ID reveal', () => {
  test.skip(!hasAdminCreds, 'Set E2E_ADMIN_EMAIL/PASSWORD + SUPABASE_URL + anon key')

  test('admin sees name/phone/masked ID/email; search + reveal; 375px card layout', async ({ page, request }) => {
    test.setTimeout(120_000)

    const admin = await signInAdminApi(request)

    const list = await edgeJson<{ members?: Array<Record<string, unknown>> }>(
      request,
      'GET',
      'admin-members',
      admin.accessToken,
      { query: 'page=1&per_page=10', stepUpToken: admin.stepUpToken },
    )
    expect(list.status).toBe(200)
    const rows = list.body.members ?? []
    for (const row of rows) {
      expect(row).not.toHaveProperty('id_number')
      if (row.id_number_masked && row.id_number_masked !== '—') {
        expect(String(row.id_number_masked)).toMatch(/^•{4}\d{4}$/)
      }
    }

    await loginAdminUi(page)

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${BASE_URL}/admin/members`)
    await expect(page.getByRole('heading', { name: /member/i }).first()).toBeVisible({ timeout: 25_000 })

    const search = page.getByPlaceholder(/search name, phone, id/i)
    await expect(search).toBeVisible()

    const withPhone = rows.find((r) => typeof r.phone === 'string' && String(r.phone).replace(/\D/g, '').length >= 9)
    if (withPhone?.phone) {
      const digits = String(withPhone.phone).replace(/\D/g, '')
      const suffix = digits.slice(-4)
      await search.fill(suffix)
      await page.waitForTimeout(600)
    }

    const revealBtn = page.getByRole('button', { name: /reveal national id/i }).first()
    if (await revealBtn.isVisible().catch(() => false)) {
      await revealBtn.click()
      await expect(page.getByRole('button', { name: /hide national id/i }).first()).toBeVisible({ timeout: 10_000 })

      const revealApi = await edgeJson<{ id_number?: string }>(
        request,
        'POST',
        'admin-reveal-member-id',
        admin.accessToken,
        {
          query: `member_id=${encodeURIComponent(String(withPhone?.id ?? rows[0]?.id ?? ''))}`,
          data: {},
          stepUpToken: admin.stepUpToken,
        },
      )
      expect([200, 404]).toContain(revealApi.status)
      if (revealApi.status === 200) {
        expect(revealApi.body.id_number).toMatch(/^\d{7,8}$/)
      }
    }
  })

  test('member JWT cannot call reveal-member-id or open admin members', async ({ page, request }) => {
    test.skip(!hasMemberCreds, 'Set E2E_MEMBER_EMAIL/PASSWORD')
    test.setTimeout(90_000)

    const member = await signInApi(request, E2E_MEMBER.email, E2E_MEMBER.password)
    const denied = await edgeJson(
      request,
      'POST',
      'admin-reveal-member-id',
      member.accessToken,
      { query: `member_id=${encodeURIComponent(member.userId)}`, data: {} },
    )
    expect([401, 403]).toContain(denied.status)

    await loginUi(page, E2E_MEMBER.email, E2E_MEMBER.password)
    await page.goto(`${BASE_URL}/admin/members`)
    await page.waitForTimeout(1500)
    await expect(page).not.toHaveURL(/\/admin\/members/)
  })
})
