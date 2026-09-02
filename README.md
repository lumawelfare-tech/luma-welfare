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
backend/
  src/index.ts            Hono app entry (API server on :3001)
  src/lib/qualify.ts      Qualification engine (Section 5)
  src/lib/dashboard.ts    Per-package member dashboard builder
  src/lib/rbac.ts         Admin RBAC (roles/permissions)
  src/lib/audit.ts        Audit log writer
  src/routes/             public, member, contributions, admin
  db/schema.sql           PostgreSQL schema (run in Supabase SQL editor)
  db/seed.sql             The 12 packages, rules, roles, settings
frontend/
  src/                    React app (Vite dev server on :5173)
  src/pages/              public pages, member portal, admin panel
```

## Getting started

1. **Apply the database schema.** In the Supabase dashboard (SQL Editor), run
   `backend/db/schema.sql` then `backend/db/seed.sql`. The seed creates the
   twelve confirmed packages, contribution tiers, qualification rules, roles
   and permissions, and the Section 9 open-question flags.

2. **Environment.** Copy `.env.example` to `.env` in `backend/` and `frontend/`
   and fill in the real values. The Supabase **secret key is required** for the
   admin routes (`supabaseAdmin`); the key shown in the original setup message
   was masked, so replace the placeholder before going live. Never commit `.env`.

3. **Run locally.**
   ```
   npm install
   npm run dev           # frontend on http://localhost:5173
   npm run dev:backend   # API on http://localhost:3001
   ```

4. **Create an admin.** After the schema is applied, insert the first admin
   into the `admins` table using the Supabase SQL editor, referencing a user
   created via the site registration flow:
   ```sql
   insert into admins (id, display_name, role_id, is_superadmin)
   select id, full_name, (select id from roles where name = 'superadmin'), true
   from members where email = 'you@example.com';
   ```

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

Contribution amounts match the M-Pesa Paybill 522522 / account 454545#. The
`payments` table carries `package_id` through the whole payment chain so a
callback can attribute a payment to the right package when a member holds
several — the member never has to type a transaction code. The STK Push
integration is phase 2; until then members record a Pending contribution that a
finance admin verifies.

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
npm run build          # build frontend + backend
npm run typecheck      # typecheck both workspaces
npm run dev            # frontend dev server
npm run dev:backend    # API dev server
```