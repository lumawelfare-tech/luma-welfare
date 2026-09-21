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
npx playwright test       # needs BASE_URL + optional E2E_* 
```
