# Architecture — Luma Welfare

This document describes the production architecture after the Hono/Node API
removal. The browser talks only to Supabase.

## Overview

```
React SPA (Vite) ──► Vercel (static + optional /api/cron/* serverless)
        │
        ├── supabase-js Auth (email/password, OAuth, session)
        ├── supabase-js Storage (signed URLs / uploads via Edge where required)
        └── fetch → ${VITE_SUPABASE_URL}/functions/v1/<function-name>
                      │
                      ▼
              Supabase Edge Functions (Deno)
                      │
                      ├── shared/* (CORS, auth helpers, rate limit, validate, email, …)
                      └── Postgres (RLS + RPC) + Storage
```

There is **no** separate Node/Hono/`localhost:3001` application API.

## Frontend

| Concern | Location |
| -------- | -------- |
| SPA | `frontend/src` |
| API client | `frontend/src/lib/api.ts` — maps logical paths to Edge Function names |
| Supabase client | `frontend/src/lib/supabase.ts` |
| Env | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (never service-role) |
| Vercel crons | `frontend/api/cron/*` (and root `api/cron/*` re-exports) — call Edge Functions with secrets |

Logical paths such as `/member/claims` or `/packages` are **not** HTTP routes on
Vercel. They are rewritten by `api()` to Edge Function URLs.

## Edge Functions

Sources live under `supabase/functions/<name>/index.ts`. Shared modules:

| Module | Role |
| ------ | ---- |
| `shared/cors.ts` | Origin allowlist + security headers |
| `shared/supabase.ts` | Admin / user clients, RBAC helpers |
| `shared/validate.ts` | Input validation |
| `shared/rate-limit.ts` | Rate limiting |
| `shared/email.ts` / `otp.ts` | Transactional email + OTP |
| `shared/security.ts` | CSP and related headers |
| `shared/qualify.ts` | Package qualification rules |

Deploy with `npm run deploy:functions` or
`./scripts/deploy-edge-functions.sh <name>`. Public/cron functions use
`--no-verify-jwt` at the gateway where documented in that script; handlers still
enforce auth where required.

## Database and storage

- **Authoritative schema:** `supabase/migrations/`
- **RLS:** every member-owned table must deny cross-member reads/writes
- **Storage:** claim documents and media use bucket policies + signed URLs from Edge where needed
- Legacy SQL under `docs/legacy-backend-sql/` is reference-only

## Adding a new Edge Function safely

1. **Create** `supabase/functions/<name>/index.ts`.
2. **CORS** — call `handleCors(req)` early; use `getCorsHeaders(req)` on every
   response (do not rely on the static `corsHeaders` export for browser-facing
   responses).
3. **Auth** — for member/admin routes, verify the JWT (user client) and load
   membership/admin role before any data access. Reject anonymous callers.
4. **Validation** — parse and validate body/query with `shared/validate.ts`
   (or equivalent); never trust client-supplied IDs for authorization.
5. **Rate limit** — apply `shared/rate-limit.ts` on sensitive/public endpoints.
6. **RLS** — prefer the user-scoped client for member data; use the admin client
   only when the function has already authorized an admin action.
7. **Map the path** in `frontend/src/lib/api.ts` (`pathToFunctionName`).
8. **Register deploy** — add to `scripts/deploy-edge-functions.sh` (and
   `--no-verify-jwt` allowlist only if the gateway must accept anon invoke).
9. **CI** — ensure `npm run guard:backend` still passes (path map + no legacy URLs).
10. **Smoke** — `npm run verify:deploy` after production deploy.

## Payments

M-Pesa Edge Functions exist but are gated by `PAYMENTS_ENABLED` (keep `false`
unless product explicitly enables them). Do not treat them as a second backend.

## Related docs

- Root `README.md` — setup and scripts
- `docs/SUPABASE_ONLY_MIGRATION.md` — historical Hono → Edge coverage table
- `docs/E2E.md` — Playwright secrets and skips
- `docs/RUNBOOK.md` / `docs/SECRETS_ROTATION.md` — operations
