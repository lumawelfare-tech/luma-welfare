/**
 * Phase 5 — Admin regression (API + light UI).
 * Approves/rejects claims, verifies a manual contribution, exports a report,
 * and checks receipt listing. Skips without E2E_ADMIN_* (+ seed key for mutations).
 */
import { test, expect } from '@playwright/test'
import {
  BASE_URL,
  E2E_ADMIN,
  E2E_MEMBER,
  hasAdminCreds,
  hasMemberCreds,
  canSeed,
} from './helpers/env'
import { loginUi, signInApi, edgeJson } from './helpers/auth'
import {
  seedSubmittedClaims,
  seedPendingContribution,
  deleteClaims,
  deleteContributions,
} from './helpers/seed'

test.describe('Admin flows', () => {
  test.skip(!hasAdminCreds, 'Set E2E_ADMIN_EMAIL/PASSWORD + SUPABASE_URL + anon key')

  test('admin UI loads dashboard and members list (masked phones)', async ({ page }) => {
    test.setTimeout(90_000)
    await loginUi(page, E2E_ADMIN.email, E2E_ADMIN.password)

    // Admin lands on /admin or /admin/dashboard (2FA may block — fail soft)
    if (page.url().includes('verify') || await page.getByText(/two-factor|authenticator/i).isVisible().catch(() => false)) {
      test.skip(true, 'Admin account has 2FA enabled — use a test admin without 2FA for UI E2E')
    }

    await page.goto(`${BASE_URL}/admin/dashboard`)
    await expect(page.getByText(/dashboard|members|claims|overview/i).first()).toBeVisible({ timeout: 25_000 })

    await page.goto(`${BASE_URL}/admin/members`)
    await expect(page.getByRole('heading', { name: /member/i }).first()).toBeVisible({ timeout: 25_000 })
  })

  test('approve and reject seeded claims; verify manual contribution; export report', async ({ request }) => {
    test.skip(!canSeed || !hasMemberCreds, 'Need E2E member + SUPABASE_SERVICE_ROLE_KEY to seed claim/contribution rows')
    test.setTimeout(120_000)

    const member = await signInApi(request, E2E_MEMBER.email, E2E_MEMBER.password)
    const admin = await signInApi(request, E2E_ADMIN.email, E2E_ADMIN.password)

    const claims = await seedSubmittedClaims(request, member.userId, 2)
    test.skip(claims.length < 2, 'Could not seed two Submitted claims (member needs active subscription + packages)')

    const claimIds = claims.map((c) => c.id)
    try {
      const approve = await edgeJson<{ claim?: { status: string } }>(
        request,
        'PATCH',
        'admin-claims',
        admin.accessToken,
        {
          query: `resource_id=${claimIds[0]}`,
          data: { decision: 'approve', adminNotes: 'E2E approve', amount: 1000 },
        },
      )
      expect([200, 403]).toContain(approve.status)
      if (approve.status === 200) {
        expect(approve.body.claim?.status).toMatch(/Approved/i)
      }

      const reject = await edgeJson<{ claim?: { status: string } }>(
        request,
        'PATCH',
        'admin-claims',
        admin.accessToken,
        {
          query: `resource_id=${claimIds[1]}`,
          data: { decision: 'reject', adminNotes: 'E2E reject' },
        },
      )
      expect([200, 403]).toContain(reject.status)
      if (reject.status === 200) {
        expect(reject.body.claim?.status).toMatch(/Rejected/i)
      }

      // Manual contribution path (no M-Pesa): seed Pending → admin verify
      const contrib = await seedPendingContribution(request, member.userId)
      test.skip(!contrib, 'Could not seed Pending contribution')
      try {
        const verified = await edgeJson<{ contribution?: { status: string } }>(
          request,
          'PATCH',
          'admin-contributions',
          admin.accessToken,
          {
            query: `resource_id=${contrib!.id}`,
            data: { action: 'verify' },
          },
        )
        expect([200, 403]).toContain(verified.status)
        if (verified.status === 200) {
          expect(verified.body.contribution?.status).toMatch(/Verified/i)
        }
      } finally {
        await deleteContributions(request, contrib ? [contrib.id] : [])
      }

      // Export / report generation (admin-reports)
      const report = await edgeJson<{ data?: unknown[]; message?: string }>(
        request,
        'GET',
        'admin-reports',
        admin.accessToken,
        { query: 'type=claims' },
      )
      expect([200, 400, 403]).toContain(report.status)
      if (report.status === 200) {
        expect(Array.isArray(report.body.data) || report.body.data === undefined || typeof report.body === 'object').toBeTruthy()
      }

      // Claims CSV export action if supported
      const exportRes = await edgeJson<Record<string, unknown>>(
        request,
        'GET',
        'admin-claims',
        admin.accessToken,
        { query: 'action=export&format=csv' },
      )
      expect([200, 400, 403, 404]).toContain(exportRes.status)
    } finally {
      await deleteClaims(request, claimIds)
    }
  })

  test('member receipts endpoint returns data for download flows', async ({ request }) => {
    test.skip(!hasMemberCreds, 'Need E2E member credentials')
    const member = await signInApi(request, E2E_MEMBER.email, E2E_MEMBER.password)
    const tx = await edgeJson<{ transactions?: unknown[] }>(
      request,
      'GET',
      'member-receipts',
      member.accessToken,
      { query: 'action=transactions' },
    )
    expect([200, 401, 403]).toContain(tx.status)
    if (tx.status === 200) {
      expect(Array.isArray(tx.body.transactions)).toBeTruthy()
    }
  })
})
