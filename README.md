# Luma Welfare Platform

Membership and contribution management for Luma Welfare, a community welfare
organization in Kenya. Members join one or more of twelve support packages,
pay monthly, and track their own progress toward eligibility. Administrators
manage members, verify payments, review claims, and run payouts.

## Architecture

```
React (Vite) on Vercel
    ↓
Supabase Auth + Edge Functions (Deno)
    ↓
Postgres + RLS + RPC + Storage
```

There is **no Hono / Node API server**. All application APIs are Supabase Edge
Functions. Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

| Layer        | Choice                                        |
| ------------ | --------------------------------------------- |
| Frontend     | React + TypeScript + Vite + Tailwind CSS      |
| Backend      | Supabase Edge Functions (Deno)                 |
| Auth / DB    | Supabase (email OTP for registration)          |
| File storage | Supabase Storage                              |
| Payments     | M-Pesa (disabled — PAYMENTS_ENABLED=false)    |

## Repo layout

```
supabase/
  functions/          Supabase Edge Functions (Deno)
    shared/           Shared helpers (auth, email, OTP, CORS, qualify, etc.)
    admin-*/          Admin panel Edge Functions
    member-*/         Member portal Edge Functions
    auth-*/           Authentication Edge Functions
  migrations/         Authoritative database schema (run in order)
  config.toml         Edge Function JWT settings

frontend/
  src/                React app (Vite on :5173)
  api/cron/           Vercel cron handlers (call Edge Functions)

scripts/
  deploy-edge-functions.sh
  verify-deploy.sh
  admin-bootstrap.ts
  dependency-audit.ts
  security-audit.ts / security-test-suite.ts   # live optional
  __tests__/qualify.test.ts

docs/legacy-backend-sql/   # archived schema/seed reference (not applied automatically)
```

## Getting started

### 1. Database

**Authoritative source:** `supabase/migrations/`

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

For a brand-new empty project, if packages/roles are missing after migrations,
review `docs/legacy-backend-sql/seed.sql` and apply only what is still needed
(after comparing with live schema). Do not treat that file as the primary path.

### 2. Environment

- `frontend/.env` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Edge Function secrets — set in Supabase Dashboard (see below)
- Local scripts (bootstrap / live security) — copy `scripts/env.example` values into a
  gitignored `scripts/.env` or export in your shell. Never commit secrets.
  Needs `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` as appropriate.

### 3. Run locally

```bash
npm install
supabase start                    # local Auth, Postgres, Storage (optional but recommended)
supabase functions serve          # Edge Functions against local or linked project
npm run dev                       # frontend on http://localhost:5173
```

The frontend talks only to `VITE_SUPABASE_URL/functions/v1/...`.
There is no `localhost:3001` API.

### 4. Provision the first admin

After registering a user through the site, promote them via SQL:

```sql
insert into admins (id, display_name, role_id, is_superadmin, is_active)
select id, full_name, (select id from roles where name = 'superadmin'), true, true
from members where email = 'your-email@example.com';
```

Or use the bootstrap script (requires `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`DATABASE_URL`, `ADMIN_BOOTSTRAP_PASSWORD`):

```bash
npm run admin:bootstrap
```

### 5. Deploy Edge Functions

```bash
supabase link --project-ref <your-project-ref>
export SUPABASE_ACCESS_TOKEN=<token>   # supabase.com/dashboard/account/tokens
npm run deploy:functions
```

Or a single function:

```bash
./scripts/deploy-edge-functions.sh admin-members
```

Set secrets in **Supabase Dashboard → Project Settings → Edge Functions**:

| Secret | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key for transactional email |
| `OTP_HASH_SECRET` | 32+ char random secret for HMAC-SHA256 OTP hashing |
| `EMAIL_FROM` | Sender address (e.g. `Luma Welfare <onboarding@resend.dev>`) |
| `EMAIL_TEST_MODE` | Set to `true` to route all email to `delivered@resend.dev` |

M-Pesa secrets are only needed when `PAYMENTS_ENABLED=true` (keep disabled).

## How the flow works

Registration → email OTP verification → select package(s) → monthly contributions →
system tracks per-package → waiting period evaluated → eligible → claim →
review → approved → payout.

Members hold multiple packages. Every package is tracked separately through the
`subscriptions` join table — its own contributions, waiting period and
qualification. Nothing is blended into a single "member status".

## Qualification engine

`supabase/functions/shared/qualify.ts` evaluates admin-editable rules from
`package_rules`. Admins re-run evaluation via
`POST /functions/v1/admin-subscriptions?resource_id=<id>&action=evaluate`
(same path mapping as `api('/admin/subscriptions/:id/evaluate')`).

Three patterns:

1. Fixed waiting period, standard (12 months)
2. Fixed waiting period, shorter (Education Support, 6 months)
3. No waiting period, ongoing condition (Welfare — contributions current)

## Payments

M-Pesa integration is intentionally **disabled** (`PAYMENTS_ENABLED=false`).
Contributions are recorded by members and verified manually by finance admins.

## Scripts

```
npm run build             # build frontend
npm run typecheck         # typecheck frontend
npm run lint              # lint frontend
npm run test              # frontend unit tests
npm run test:qualify      # qualification engine unit tests
npm run test:e2e          # Playwright E2E tests
npm run verify:deploy     # smoke-test deployed Edge Functions
npm run deploy:functions  # deploy all Edge Functions
npm run guard:backend     # fail if frontend references a non-Supabase app backend
npm run admin:bootstrap   # first admin (local/ops only)
npm run audit:security    # dependency vulnerability audit
npm run dev               # frontend only
```
