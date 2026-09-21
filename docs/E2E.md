# E2E test accounts & seeding (Phase 5)

Authenticated Playwright suites skip when secrets are missing. Public smoke tests always run.

## Required for member / admin UI + API flows

| Variable | Purpose |
|----------|---------|
| `BASE_URL` | Target SPA (CI sets preview/production) |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` | Auth password grant + Edge `apikey` |
| `E2E_MEMBER_EMAIL` / `E2E_MEMBER_PASSWORD` | Active **member** (email verified, ideally `active` status) |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | **Admin** without 2FA (UI clouds if 2FA is on) |

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
export SUPABASE_SERVICE_ROLE_KEY=...   # optional but needed for mutation suite

npm run build -w frontend   # or npm run dev
npx playwright test
```

## CI

GitHub Actions `e2e` job passes these from repository secrets when present. Suites that need secrets call `test.skip` otherwise so the job stays green without accounts.
