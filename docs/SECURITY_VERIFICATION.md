# Security verification notes (Phase 2)

Last updated: 2026-09-21

## Automated coverage

| Suite | Command | Requires |
|-------|---------|----------|
| Static contracts | `npm test` (phase2-security-verification + validate) | none |
| Live RLS isolation | `npm run test:rls` | `SUPABASE_URL` + anon + service_role |
| Client bundle scan | `npm run build && npm run scan:bundle` | build output |
| SQL inventory helpers | `scripts/verify-rls-inventory.sql`, `scripts/verify-security-lockdown.sql` | SQL editor / `psql` |

Docker / `supabase start` is **not** available on the current Windows agent — live RLS must be run against a local Docker host or a preview project.

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
| `xlsx` | high | **No fix upstream** — used for admin Excel exports only; keep pinned; prefer CSV/PDF for sensitive dumps where possible |
| `@vercel/node` transitive (`ajv`, `undici`, `path-to-regexp`) | high/moderate | **Not safely fixable** without breaking Vercel Node runtime (`npm audit fix --force` downgrades to v3) |

## Manual actions

See Phase 2 summary checklist: apply migration `20260921140000_phase2_security_verification.sql`, run live RLS suite, rotate any keys that ever appeared in client logs.
