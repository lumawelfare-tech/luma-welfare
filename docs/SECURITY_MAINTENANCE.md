# Luma Welfare — Security Maintenance

**Stage 6 of the 23–24 Sep 2026 OWASP cycle.**  
**Scope:** Vite/React SPA (Vercel) + Supabase (Postgres / RLS / Auth / Storage) + Edge Functions  
**This document is an operator playbook.** Findings and remediations live in `docs/SECURITY_AUDIT.md`.  
**Payments:** M-Pesa / Daraja stay **read-only** until full secrets exist and you give an explicit GO.

This file is the monthly gate. Do not skip the monthly section. Do not delete the Stage 1–5 contract tests to hide failures.

---

## Standing rules (do not weaken)

These are already in code. Do not reverse them in a “quick fix.”

| Rule | Why |
|------|-----|
| Client nav is UX-only. Server `requirePermission` / `member_id = auth.uid()` is the gate. | A01 |
| Do not grant `settings:*`, `members:reveal`, or `exports:create` to `support`. | Stage 1 RBAC split |
| Staff 2FA stays required. Do not make `loadAdminSession` accept “2FA later.” | A07 |
| Gateway JWT off **only** for the allowlist in `scripts/deploy-edge-functions.sh` and `supabase/config.toml`. | A05 |
| Hosted CORS does not default to localhost. Set `CORS_ALLOWED_ORIGIN` explicitly. | Stage 5 |
| Claim / payout amounts go through `parseOptionalMoneyAmount` / `parseRequiredMoneyAmount`. | Stage 5 |
| Member 500s use `handleUnexpectedError` — never echo `Error.message`. | Stage 4 |
| Uploads use magic-byte allowlists, not client MIME. | Stage 2 |
| `enable_signup=false` in `config.toml`. | Stage 1 |
| `PAYMENTS_ENABLED` stays false / unset. | P-* frozen |
| Coverage floor in `frontend/vite.config.ts` stays enforced. Do not restore `continue-on-error` on that step. | O-06 |
| Do not delete `owasp-stage*-fixes.test.ts` (or this doc’s contract) to go green. | Honesty |

Destructive schema, Auth-user hard delete, and PII column encryption need a written GO. Same for turning on Daraja.

---

## Cadence

### Every PR / push (CI)

Required checks: `docs/BRANCH_PROTECTION.md`.

Soft-skipped live RLS / authenticated E2E is **not** a pass. Treat a green job with skipped live suites as “static only.”

### After every Edge deploy

1. Confirm each function printed `Deployed Functions` (CLI can exit 1 on PostHog shutdown after a good deploy).
2. `GET /functions/v1/health` → 200.
3. If you changed `supabase/functions/shared/*`, redeploy **every** function that imports the changed file. Shared code is bundled at deploy time.
4. Do **not** pass `--no-verify-jwt` unless the function is on the allowlist and `config.toml` already has `verify_jwt = false`.

### After every migration

1. `npx supabase db push` on the linked project (you must ask / approve).
2. `npm run test:rls` when `SUPABASE_*` secrets exist.
3. No DROP / wipe without sign-off.

### Monthly (cannot skip)

Run in the first week of the month. Record date + operator in the table at the bottom. If a row is N/A, write why — do not leave it blank.

| # | Check | How |
|---|--------|-----|
| M1 | Production npm audit | `npm audit --omit=dev --audit-level=high` |
| M2 | Secrets still named, not leaked | `supabase secrets list` + Vercel env UI. **Never paste values.** See `docs/SECRETS_ROTATION.md`. |
| M3 | Signup stays closed | `supabase/config.toml` → `enable_signup=false` |
| M4 | Payments stay off | Edge `PAYMENTS_ENABLED` false / unset |
| M5 | CORS is explicit | `CORS_ALLOWED_ORIGIN` is set on hosted Edge (production origin only) |
| M6 | Live secrets gate | Either secrets populated **and** `ENFORCE_LIVE_SECRETS=true`, or a dated note that CI is still soft (O-01) |
| M7 | Staff 2FA | One admin login still required TOTP / step-up |
| M8 | Audit log sanity | Spot-check `audit_logs` for `auth_failed`, `staff.session_invalidate_incomplete`, unexpected `staff.granted` |
| M9 | Coverage floor | `npm run test:coverage -w frontend` still ≥ thresholds in `vite.config.ts` |
| M10 | Branch protection | Required checks on `main` still match `docs/BRANCH_PROTECTION.md` (admins cannot bypass) |
| M11 | Storage lockdown | Members still cannot write `media` / `exports` / `kb-documents` / `report-files` (live RLS if secrets exist) |
| M12 | Incident path | Confirm `docs/RUNBOOK.md` owner is current |

---

## Adding a new Edge Function

1. Add `[functions.<name>]` in `supabase/config.toml`. Default `verify_jwt = true` unless it is a public/cron/callback function.
2. If JWT is off, add the name to `NO_VERIFY_JWT_FUNCTIONS` in `scripts/deploy-edge-functions.sh`.
3. Call `handleCors(req)` first. Use shared `validate.ts` parsers for bodies. Fail closed on rate-limit errors.
4. Member routes: `getAuthenticatedUser` + `assertMemberActive` + row scoped to `user.id`.
5. Admin routes: `loadAdminSession` (2FA) + `requirePermission`. Superadmin-only stays `is_superadmin` + `role_name === 'superadmin'`.
6. Unexpected errors: `handleUnexpectedError` / `handleAdminError`. Validation → 400 `VALIDATION`.
7. Add the function to the deploy script inventory and the CI Edge Function Check list.
8. Add an offline contract test. Do not add exploit PoCs.
9. Deploy with `npx supabase functions deploy <name>` (no `--no-verify-jwt` flag; `config.toml` owns that).

---

## Verification commands

| Intent | Command | Needs |
|--------|---------|-------|
| Unit / OWASP contracts | `npm test -w frontend` | none |
| Coverage floor | `npm run test:coverage -w frontend` | none |
| Qualification engine | `npm run test:qualify` | none |
| Live RLS | `npm run test:rls` | `SUPABASE_URL` + anon + service role |
| Typecheck | `npm run typecheck` | none |
| Build + secret scan | `npm run build && npm run scan:bundle` | none |
| Phase 8 smoke | `npm run verify:phase8` | none |
| Playwright | `npx playwright test` | `BASE_URL`; `E2E_*` + `E2E_ADMIN_TOTP_SECRET` for auth |
| Firefox API only | `npx playwright test --project=firefox-security-api` | same as Playwright |
| Migrations | `npx supabase db push` | linked project |
| Function deploy | `npx supabase functions deploy <name>` | linked project + token |

Full gate list: `docs/SECURITY_VERIFICATION.md`.  
Branch protection: `docs/BRANCH_PROTECTION.md`.

---

## Open items (not this document)

Stage 6 does **not** implement these. They stay until you decide.

| ID | Severity | Owner action |
|----|----------|--------------|
| O-01 | High (ops) | Set GitHub `E2E_ADMIN_TOTP_SECRET` (and the other `E2E_*` / `SUPABASE_*` secrets), then `ENFORCE_LIVE_SECRETS=true`. Add `🔐 Live Secrets Gate` to required checks. |
| O-08 | Low | Product + key-management decision before any PII column encryption. |
| O-09 | Info | Choose a PDF malware vendor if claim evidence must be scanned beyond magic bytes. |
| P-* | Deferred | Daraja / M-Pesa only after full secrets + explicit GO. |
| WebKit | Info | Extra Playwright project; skipped to keep CI time. |

---

## Incident

1. Rotate the leaked secret first — `docs/SECRETS_ROTATION.md`. Never put values in git, tickets, or chat.
2. Follow `docs/RUNBOOK.md`.
3. Review `audit_logs` for the abuse window (`auth_failed`, role grants, claim decisions).
4. If Auth keys leaked: rotate, then invalidate sessions. Role changes already retry `signOut(..., 'global')` and report `session_invalidated`.
5. Confirm the client bundle still has no service role: `npm run build && npm run scan:bundle`.

---

## Related documents

| Doc | Use |
|-----|-----|
| `docs/SECURITY_AUDIT.md` | What was found and fixed in Stages 1–5 |
| `docs/SECURITY_VERIFICATION.md` | Automated vs live suite map |
| `docs/BRANCH_PROTECTION.md` | Required CI checks + GitHub secrets |
| `docs/SECRETS_ROTATION.md` | Rotation order |
| `docs/LAUNCH_CHECKLIST.md` | Membership go-live |
| `docs/DATA_INVENTORY.md` | PII categories (draft) |
| `docs/RUNBOOK.md` | Incidents |

---

## Monthly log (cannot skip)

| Month | Operator | M1–M12 done? | Notes / N/A reasons |
|-------|----------|--------------|---------------------|
| 2026-10 | | ☐ | First month after Stage 6. O-01 still soft unless you flip the gate. |
| 2026-11 | | ☐ | |
| 2026-12 | | ☐ | |
