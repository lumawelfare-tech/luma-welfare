# Branch protection — required CI checks

Configure these on `main` (GitHub → Settings → Branches → Branch protection rules).
Do **not** allow administrators to bypass required checks in production.

## Required status checks

Enable “Require status checks to pass before merging” and require:

| Check name (CI job) | Blocks merge when |
|---------------------|-------------------|
| `🔒 Security Audit` | Critical npm audit findings |
| `🔍 Typecheck` | TypeScript errors (frontend + selected Edge Deno checks) |
| `🧹 Lint` | Lint failures |
| `🧪 Tests` | Unit / qualify / live RLS failures (RLS self-skips only when Supabase secrets are unset) |
| `🏗️ Build` | Build, bundle secret scan, or legacy-backend guard failures |
| `🎭 E2E Tests` | Playwright failures on PRs and `main` pushes (skipped on non-`main` branch pushes that are not PRs) |
| `📡 Edge Function Check` | Missing required Edge Function sources |
| `📊 Security Summary` | Any of the above required jobs failed / cancelled / unexpectedly skipped |

## Secrets that must be present for full gates

| Secret | Used by |
|--------|---------|
| `SUPABASE_URL` | RLS live suite, E2E |
| `SUPABASE_ANON_KEY` | RLS live suite, E2E |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS live seed/cleanup, E2E seed |
| `E2E_MEMBER_EMAIL` / `E2E_MEMBER_PASSWORD` | Authenticated member E2E |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | Admin E2E (prefer a **non-2FA** test admin) |

Without Supabase secrets, RLS and authenticated E2E **skip** rather than fail. Configure secrets on the repo (or environment) so those suites actually run before go-live.

### Canonical repo gate (`lumawelfare-tech/luma-welfare`)

CI job `🔐 Live Secrets Gate` runs only on that repository:

1. **Soft mode (default):** emits a GitHub warning when any of the secrets above are empty (forks skip the job entirely).
2. **Hard mode:** set repository variable `ENFORCE_LIVE_SECRETS=true` after secrets are populated. The gate then **fails** CI instead of allowing green-via-skip.

Also add `🔐 Live Secrets Gate` to required checks once hard mode is enabled (optional while soft).

## Coverage (informational)

The `🧪 Tests` job uploads Vitest coverage (`lcov`) as an artifact. It is **informational** — coverage thresholds are not enforced yet. Review the artifact on PRs that touch `frontend/src/lib`, hooks, or auth context.

## Local equivalents

```bash
npm run lint
npm run typecheck
npm test
npm run test:qualify
npm run test:rls          # needs SUPABASE_* 
npm run build
npm run verify:phase8     # typecheck → lint → unit → qualify → build → scan → guard
npx playwright test       # needs BASE_URL + optional E2E_* 
# Phase 8 critical paths: e2e/phase8-critical-paths.spec.ts
```

## Phase 8 hardening notes

- Soft → hard: leave `ENFORCE_LIVE_SECRETS` unset until secrets exist; then set `true` and optionally require `🔐 Live Secrets Gate`.
- CI `📡 Edge Function Check` inventory includes Phase 4–7 functions (`admin-complaints`, `admin-community`, `admin-documents`, `admin-kb-ingest`, `member-claims`, `member-complaints`, `member-documents`, `member-assistant`).
- Live RLS suite covers `complaints`, `community_support_records`, `kb_documents`, `kb_chunks` isolation in addition to core member tables.