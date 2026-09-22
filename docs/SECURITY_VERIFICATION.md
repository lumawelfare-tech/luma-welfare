# Security verification notes

Last updated: 2026-09-22 (Phase H — role matrix checklist + ENFORCE gate docs)

## Automated coverage

| Suite | Command | Requires | CI |
|-------|---------|----------|-----|
| Static contracts | `npm test` (validate, auth-validate, edge-auth-contracts, rate-limit-core, …) | none | `🧪 Tests` |
| Qualification engine | `npm run test:qualify` | none | `🧪 Tests` |
| Live RLS isolation | `npm run test:rls` | `SUPABASE_URL` + anon + service_role | `🧪 Tests` (self-skips without secrets; **fails the job** when secrets set and suite fails) |
| Vitest coverage | `npm run test:coverage -w frontend` | none | Informational artifact |
| Client bundle scan | `npm run build && npm run scan:bundle` | build output | `🏗️ Build` |
| Playwright E2E | `npx playwright test` | `BASE_URL` + optional `E2E_*` / Supabase secrets | `🎭 E2E Tests` (PRs + `main`) |
| SQL inventory helpers | `scripts/verify-rls-inventory.sql` | SQL editor / `psql` | Manual |

Branch protection checklist: `docs/BRANCH_PROTECTION.md`.

## RLS live suite — tables & edge coverage

| Surface | Anonymous | Member A vs B | Member vs admin tables |
|---------|-----------|---------------|------------------------|
| `members`, `claims`, `contributions`, `subscriptions`, `family_members`, `notifications`, `registration_fees`, `data_deletion_requests`, `member_legal_acceptances`, `financial_ledger` | no read | B cannot read A; A reads own | — |
| `admins`, `audit_logs` | no read | members get empty | denied to members |
| Edge `admin-claims` | — | member JWT → 401/403 | — |

## Intentional public reads (`USING (true)` / public content)

- `package_rules` — package metadata for the public packages page
- `news_events`, `gallery_items` — public marketing content
- `platform_settings` — restricted to keys `org_contact`, `stats` (not full table)
- `media` storage bucket — public media library assets (not claim evidence)
- `system_webhooks` / `health_check_history` — `USING (true)` only for **service_role**, with explicit Block policies for authenticated/anon

## Private documents

- Bucket `claim-documents`: private, 10MB, MIME allowlist
- Downloads via **15-minute signed URLs** (`shared/storage-signed.ts`)
- Bucket `exports`: private, 50MB, MIME allowlist; admin downloads via 1-hour signed URLs

## Dependency audit (prod)

| Package | Severity | Status |
|---------|----------|--------|
| ~~`xlsx`~~ | ~~high~~ | **Removed** — admin Excel exports use SpreadsheetML (`.xls`) without the SheetJS package |
| `@vercel/node` transitive (`ajv`, `undici`, `path-to-regexp`) | high/moderate | **Not safely fixable** without breaking Vercel Node runtime (`npm audit fix --force` downgrades to v3) |

## Manual actions

1. Configure branch protection + CI secrets per `docs/BRANCH_PROTECTION.md`.
2. After secrets are populated on the canonical repo, set `ENFORCE_LIVE_SECRETS=true` so the Live Secrets Gate fails instead of soft-skipping.
3. Run live RLS against staging/preview before go-live (`npm run test:rls`).
4. Complete the **role matrix checklist** below and attach evidence (CI run URL or local log) before onboarding real members at scale.

## Role matrix checklist (operator)

Mark each row after a green live run (or document intentional skip). Do not treat soft-skipped CI as proof.

| Check | Command / surface | Pass? | Evidence |
|-------|-------------------|-------|----------|
| Member A cannot read Member B rows | `npm run test:rls` | ☐ | |
| Member JWT denied on `admin-claims` | `npm run test:rls` + edge case | ☐ | |
| Anon cannot read private tables | `npm run test:rls` | ☐ | |
| Member E2E login + dashboard | Playwright with `E2E_MEMBER_*` | ☐ | |
| Admin E2E login + claims queue | Playwright with `E2E_ADMIN_*` (non-2FA test admin) | ☐ | |
| Live Secrets Gate hard mode | `vars.ENFORCE_LIVE_SECRETS=true` + required check | ☐ | |

Staff role matrix beyond member/admin (e.g. fine-grained admin permissions) remains a product decision — current automated suite covers member isolation + admin edge denial, not every staff permission pair.
