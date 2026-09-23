/**
 * Phase 8 — Critical member/admin path smoke for Phases 2–7 surfaces.
 * Skips when E2E credentials are unset (soft gate; ENFORCE_LIVE_SECRETS hardens CI separately).
 */
import { test, expect } from '@playwright/test'
import { BASE_URL, E2E_MEMBER, hasAdminCreds, hasMemberCreds } from './helpers/env'
import { loginUi, loginAdminUi, signInApi, edgeJson } from './helpers/auth'

test.describe('Phase 8 member critical paths', () => {
  test.skip(!hasMemberCreds, 'Set E2E_MEMBER_EMAIL/PASSWORD + SUPABASE_URL + anon key')

  test('documents, complaints, assistant, programs routes load', async ({ page, request }) => {
    test.setTimeout(120_000)
    await loginUi(page, E2E_MEMBER.email, E2E_MEMBER.password)

    await page.goto(`${BASE_URL}/documents`)
    await expect(page.getByRole('heading', { name: /my documents|documents/i }).first()).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(/organization documents|claim evidence|membership/i).first()).toBeVisible({ timeout: 15_000 })

    await page.goto(`${BASE_URL}/complaints`)
    await expect(page.getByRole('heading', { name: /complaint/i }).first()).toBeVisible({ timeout: 25_000 })

    await page.goto(`${BASE_URL}/join`)
    await expect(page.getByRole('heading', { name: /program/i }).first()).toBeVisible({ timeout: 25_000 })

    await page.goto(`${BASE_URL}/assistant`)
    await expect(page.getByRole('heading', { name: /help assistant|assistant/i }).first()).toBeVisible({ timeout: 25_000 })

    const session = await signInApi(request, E2E_MEMBER.email, E2E_MEMBER.password)

    const docs = await edgeJson(request, 'GET', 'member-documents', session.accessToken)
    expect([200, 403]).toContain(docs.status)

    const complaints = await edgeJson(request, 'GET', 'member-complaints', session.accessToken)
    expect([200, 403]).toContain(complaints.status)

    const assistant = await edgeJson(request, 'POST', 'member-assistant', session.accessToken, {
      data: { query: 'What is Luma Welfare?' },
    })
    // Fail-closed when AI_ASSISTANT_ENABLED is unset; 200 when enabled
    expect([200, 403]).toContain(assistant.status)
    if (assistant.status === 403) {
      expect(String((assistant.body as { code?: string }).code ?? '')).toMatch(/AI_DISABLED|ACCOUNT/i)
    }
  })
})

test.describe('Phase 8 admin critical paths', () => {
  test.skip(!hasAdminCreds, 'Set E2E_ADMIN_EMAIL/PASSWORD + SUPABASE_URL + anon key')

  test('applications, complaints, community, documents admin routes', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAdminUi(page)

    await page.goto(`${BASE_URL}/admin/applications`)
    await page.waitForURL(/\/admin\/(applications|members)/, { timeout: 25_000 })
    expect(page.url()).toMatch(/status=pending_approval|\/admin\/members|\/admin\/applications/)

    await page.goto(`${BASE_URL}/admin/complaints`)
    await expect(page.getByRole('heading', { name: /complaint/i }).first()).toBeVisible({ timeout: 25_000 })

    await page.goto(`${BASE_URL}/admin/community`)
    await expect(page.getByRole('heading', { name: /community|mission/i }).first()).toBeVisible({ timeout: 25_000 })

    await page.goto(`${BASE_URL}/admin/documents`)
    await expect(page.getByRole('heading', { name: /document/i }).first()).toBeVisible({ timeout: 25_000 })
  })
})
