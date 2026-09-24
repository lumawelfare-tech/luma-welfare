# E2E test accounts & seeding (Phase 5)

Authenticated Playwright suites skip when secrets are missing. Public smoke tests always run.

## Required for member / admin UI + API flows

| Variable | Purpose |
|----------|---------|
| `BASE_URL` | Target SPA (CI sets preview/production) |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` | Auth password grant + Edge `apikey` |
| `E2E_MEMBER_EMAIL` / `E2E_MEMBER_PASSWORD` | Active **member** (email verified, ideally `active` status) |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | **Staff admin** (email verified, 2FA already enrolled) |
| `E2E_ADMIN_TOTP_SECRET` | RFC 6238 secret for that staff account. Required for admin UI/API happy paths (`hasAdminTotp` in `e2e/helpers/env.ts`). Suites skip if unset. |

## Required for claim approve/reject + contribution verify seeding

| Variable | Purpose |
|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Seed/delete `claims` + `contributions` via PostgREST |

## Seed expectations

1. Member should have an **active** subscription (and preferably `qualifications.status = eligible` for claim UI submit).
2. Admin must have claim approve + contribution verify permissions.
3. Prefer a dedicated staging project — never use real member PII.

## Local run

```bash
export BASE_URL=http://localhost:5173
export SUPABASE_URL=...
export SUPABASE_ANON_KEY=...
export E2E_MEMBER_EMAIL=...
export E2E_MEMBER_PASSWORD=...
export E2E_ADMIN_EMAIL=...
export E2E_ADMIN_PASSWORD=...
export E2E_ADMIN_TOTP_SECRET=...       # required for admin happy paths (staff 2FA)
export SUPABASE_SERVICE_ROLE_KEY=...   # required for live RLS + mutation seeding

npm run build -w frontend   # or npm run dev
npx playwright test
```

## Live RLS (not Playwright)

`scripts/__tests__/rls-isolation.live.test.ts` (`npm run test:rls`) needs `SUPABASE_URL`, anon/publishable key, and service role. It self-skips when those are absent. When secrets are present it covers owner / peer / anonymous isolation for `member_documents` and the `member-documents` storage bucket, plus PostgREST denial of `members.kra_pin`. Missing secrets are **NOT VERIFIED**, not a pass.

## CI

GitHub Actions `e2e` job passes these from repository secrets when present. Suites that need secrets call `test.skip` otherwise so the job stays green without accounts.

The `🔐 Live Secrets Gate` warns when any of these repository **secrets** are missing:

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_MEMBER_EMAIL`, `E2E_MEMBER_PASSWORD`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_ADMIN_TOTP_SECRET`

After they are populated on a **dedicated test project** (not real member PII), set repository **variable** `ENFORCE_LIVE_SECRETS=true` so missing secrets fail CI instead of skipping. See `docs/BRANCH_PROTECTION.md`.

Do not invent or commit these values.
