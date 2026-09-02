# Luma Welfare Platform

Membership and contribution management for Luma Welfare, a community welfare
organization in Kenya. Members join one or more of twelve support packages,
pay monthly, and track their own progress toward eligibility. Administrators
manage members, verify payments, review claims, and run payouts.

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
    shared/           Shared helpers (auth, email, OTP, RLS, CORS, etc.)
    admin-*/         Admin panel Edge Functions
    member-*/        Member portal Edge Functions
    auth-*/          Authentication Edge Functions
  migrations/         Database migrations (run in order)
  config.toml         Edge Function JWT settings

backend/
  src/index.ts            Hono app entry (local dev only — not deployed)
  src/lib/rbac.ts        Admin RBAC (roles/permissions)
  src/lib/audit.ts       Audit log writer
  src/routes/             public, member, contributions, admin
  db/schema.sql          PostgreSQL schema (run in Supabase SQL editor)
  db/seed.sql            The 12 packages, rules, roles, settings

frontend/
  src/                   React app (Vite dev server on :5173)
  src/pages/             public pages, member portal, admin panel
```

## Getting started

### 1. Apply database schema

In the Supabase dashboard (SQL Editor), run `backend/db/schema.sql` then `backend/db/seed.sql`.
The seed creates the twelve confirmed packages, contribution tiers, qualification rules, roles and permissions.

### 2. Environment

- `backend/.env` — Supabase URL and secret key (for local Hono dev server)
- `frontend/.env` — Supabase publishable key (Vite public)
- `supabase/` — linked to the Supabase project automatically via `supabase link`

Never commit `.env` files. All are in `.gitignore`.

### 3. Run locally

```
npm install
npm run dev           # frontend on http://localhost:5173
npm run dev:backend   # Hono API on http://localhost:3001 (local dev only)
```

### 4. Provision the first admin

After registering a user through the site, promote them to admin via the Supabase SQL editor:

```sql
insert into admins (id, display_name, role_id, is_superadmin, is_active)
select id, full_name, (select id from roles where name = 'superadmin'), true, true
from members where email = 'your-email@example.com';
```

Or use the bootstrap script (requires `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_BOOTSTRAP_PASSWORD`):

```
npx tsx backend/src/_admin-bootstrap.ts
```

### 5. Deploy Edge Functions

After cloning, install deps and link the project:

```
supabase link --project-ref <your-project-ref>
export SUPABASE_ACCESS_TOKEN=<your-personal-access-token>  # from supabase.com/dashboard/account/tokens
npm run deploy:functions    # deploy all functions
```

Or deploy a single function:

```
./scripts/deploy-edge-functions.sh admin-members
```

Set required secrets in **Supabase Dashboard → Project Settings → Edge Functions**:

| Secret | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key for transactional email |
| `OTP_HASH_SECRET` | 32+ char random secret for HMAC-SHA256 OTP hashing |
| `EMAIL_FROM` | Sender address (e.g. `Luma Welfare <onboarding@resend.dev>`) |
| `EMAIL_TEST_MODE` | Set to `true` to route all email to `delivered@resend.dev` |

M-Pesa secrets (`MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, etc.) are only needed when `PAYMENTS_ENABLED=true`.

## How the flow works

Registration → email OTP verification → select package(s) → monthly contributions →
system tracks per-package → waiting period evaluated → eligible → claim →
review → approved → payout.

Members hold multiple packages. Every package is tracked separately through the
`subscriptions` join table — its own contributions, waiting period and
qualification. Nothing is blended into a single "member status".

## Qualification engine

`backend/src/lib/qualify.ts` reads admin-editable rules from `package_rules`
instead of hardcoding. Three patterns are supported:

1. Fixed waiting period, standard (12 months)
2. Fixed waiting period, shorter (Education Support, 6 months)
3. No waiting period, ongoing condition (Welfare — contributions current)

Admins edit a package's rules as JSON in the admin panel (`/admin/packages`).
Change a rule, save, and re-run evaluation — no redeploy required.

## Payments

M-Pesa integration is intentionally **disabled** for this phase (`PAYMENTS_ENABLED=false`).
Contributions are recorded by members and verified manually by finance admins.
When enabled, STK Push will use Paybill 522522 / account 454545#.

## Open items to resolve with Luma (Section 9)

Luma's printed materials disagree with each other. These are surfaced in the
admin dashboard (`open_questions`) and summarised in
`docs/open-items.md`. The system is built to absorb whichever version turns out
correct:

- Package count (12, 13, or 14 — extra packages exist in some flyers)
- Payout model (flat KSh 100,000 vs. tied to amount paid in)
- Renewal terms ("renew every 2 months with 300")
- Contact details (older flyers show different phone/email)
- Membership figures (12,000+/10,000+ marketing claims vs. 150 confirmed members)

Stats shown on the site come from `platform_settings` and only contain
confirmed numbers. The two unconfirmed figures render as "awaiting
confirmation", never as made-up numbers.

## Scripts

```
npm run build             # build frontend
npm run typecheck         # typecheck frontend
npm run lint              # lint frontend
npm run test              # unit tests (frontend)
npm run test:e2e          # Playwright E2E tests
npm run verify:deploy     # smoke-test all deployed Edge Functions
npm run deploy:functions  # deploy all Edge Functions to Supabase (requires SUPABASE_ACCESS_TOKEN)
npm run dev               # frontend dev server
npm run dev:backend       # Hono API dev server (local only)
```