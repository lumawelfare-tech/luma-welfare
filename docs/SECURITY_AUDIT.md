# Luma Welfare — Security Audit

**Date:** 23 Sep 2026  
**Scope:** Vite/React SPA (Vercel) + Supabase (Postgres / RLS / Auth / Storage) + Edge Functions  
**This document is Stage 4** — combined findings plus approved remediations (23 Sep 2026).  
**Payments:** M-Pesa / Daraja remain **read-only**. No payment initiate/callback changes.  
**Do not start Stage 5 leftover product work or Stage 6 (maintenance doc) until you approve.**

Prior cycle (21 Sep 2026) High/Medium patches (H-01–H-04, M-02–M-06, M-08, M-10, L-05) stay in force. Contracts: `frontend/src/lib/__tests__/security-audit-stage4.test.ts`.

---

## Executive status

| Area | Status |
|------|--------|
| A01 Access control | Privileged actions split off `members:read`. Support cannot be granted settings / reveal / exports by the Stage 1+2 migration. Client nav is UX-only. |
| A02 Crypto | National ID, DOB, phones still stored at rest in Postgres. No column encryption (not approved). |
| A03 Injection | Parameterized PostgREST / RPC. Offline sanitize + magic-byte uploads. No live exploit suites (by design). |
| A04 Insecure design | Self-approve blocked. Fee-required activate. Claim upload uses one id. Login / forgot-password go through rate-limited Edge Functions. |
| A05 Misconfig | Hosted `enable_signup=false`. Health / callback use `handleCors`. Member 500s no longer echo raw `Error.message`. |
| A06 Components | CI fails production High/Critical (`pipefail` + `--audit-level=high`). Dev-only audit is informational. |
| A07 Auth | Staff 2FA required. Login stores the step-up token. TOTP verify is rate-limited. |
| A08 Integrity | Bundle secret scan + legacy-backend guard on build. |
| A09 Logging | Audit log FORCE RLS, no client policies, UPDATE blocked. `auth-login` writes `auth_failed` for invalid login and inactive accounts. |
| A10 SSRF | No user-controlled server-side fetch. |

**Residual High (ops, not product code):** CI can still go green without live RLS / authenticated E2E until `ENFORCE_LIVE_SECRETS=true` and `E2E_ADMIN_TOTP_SECRET` are set on the GitHub repo.

---

## Inventory (current)

| Surface | Guard |
|---------|--------|
| Public SPA routes | `Layout` only |
| Member routes | `RequireMember` + `LegalConsentGate` |
| Admin routes | `RequireAdmin` + required 2FA + `RequirePermission` |
| Superadmin | `/admin/staff-roles` via `RequireSuperadmin` |
| Admin APIs | `getAuthenticatedUser` → `loadAdminSession` (2FA step-up) → `requirePermission` |
| Member APIs | JWT + `member_id = auth.uid()` |
| Cron / callback | Shared secrets (`x-callback-secret`, `x-cron-secret`) |

Gateway JWT is off only for: `auth-register`, `auth-verify-email`, `auth-login`, `auth-forgot-password`, `public-data`, `contact`, `payments-callback`, `send-report-email`, `admin-exports-worker`, `health`.

---

## Stage 1 — OWASP Top 10 (remediated)

| Finding | Severity | Fix |
|---------|----------|-----|
| SPA login / forgot-password bypassed Edge rate limits | High | `AuthContext` → `/auth/login`; `ForgotPassword` → `/auth/forgot-password` |
| `members:read` gated settings, ID reveal, exports | High | `settings:*`, `members:reveal`, `exports:create` — granted to `superadmin`/`admin` only |
| Staff 2FA optional | High | `loadAdminSession` returns `2fa_setup_required` when off; TOTP rate-limited |
| Claim upload `id` vs `claimId` IDOR | High | Single claim id; reject mismatched aliases |
| Self-approve claims | High | `SELF_APPROVE_FORBIDDEN` |
| Activate without paid fee | High | `FEE_REQUIRED`; no `markPaymentVerified` |
| GoTrue signup open | Medium | `enable_signup=false` in `config.toml` |
| PII at rest unencrypted | Medium | Reported; no column encryption (not approved) |

Contracts: `frontend/src/lib/__tests__/owasp-stage12-fixes.test.ts`.

---

## Stage 2 — extra checks (remediated)

| Finding | Severity | Fix |
|---------|----------|-----|
| Anonymize left address / WhatsApp / emergency contacts | High | Purge function nulls those columns |
| Public CMS / avatar uploads trusted client MIME | Medium | Magic-byte allowlists (`detectAllowedImage` / `detectAllowedPublicMedia`) |
| Health / callback CORS did not use `handleCors` | Medium | Both call `handleCors` |
| Audit log UPDATE possible via service role | Medium | `prevent_audit_log_update` trigger |
| Deploy workflow interpolated `function_name` | Medium | Env-passed `FUNCTION_NAME` |

Not done (need a vendor / product decision): malware scanning inside valid PDFs; irreversible Auth-user delete on anonymize.

---

## Stage 3 — test / CI (remediated 23 Sep 2026)

| Finding | Severity | Fix |
|---------|----------|-----|
| Admin UI E2E skipped whenever 2FA appeared | High | `loginAdminUi` / `signInAdminApi` complete TOTP via `E2E_ADMIN_TOTP_SECRET` |
| Login 2FA did not persist the step-up token | High | `Login.tsx` calls `setAdmin2faStepUpToken` |
| Live 401 list was 7 functions | Medium | Expanded (settings, reveal, notifications, packages, admin-2fa, manage-user-role, member-profile) |
| `auth-verify-email` E2E hit Vercel and accepted 404 | Medium | Hits Supabase URL; 404 is a fail |
| `npm audit \| tee` hid exit codes | Medium | Production audits: `pipefail` + `--audit-level=high`. Full/dev dump is explicitly `\|\| true` |
| Invalid-login E2E clicked Google; stale `/admin/health-checks` | Medium | Stable `#login-email` / `login-submit`; route is `/admin/health` |
| a11y “Loading statistics” on a generic div | Medium | `StatBar` loading state is `role="status"` |
| Support vs settings/reveal/exports untested | Medium | UI permission unit test + migration contract |

New enforcement spec: `e2e/admin-2fa-enforcement.spec.ts` — password-grant admin JWT without step-up must be 401 `ADMIN_2FA_*`.

Contracts: `frontend/src/lib/__tests__/owasp-stage3-coverage.test.ts`, `totp.test.ts`.

---

## What still skips (honest, not hidden)

These suites **self-skip** when secrets are missing. That is documented. It is **not** a product defect.

| Suite | Skips unless |
|-------|----------------|
| Live RLS isolation | `SUPABASE_URL` + anon + service role |
| Authenticated member E2E | `E2E_MEMBER_*` + Supabase URL/anon |
| Admin UI / API happy paths | `E2E_ADMIN_*` + `E2E_ADMIN_TOTP_SECRET` |
| `🎭 E2E Tests` job | PR to `main`, or push to `main` / `develop` |
| `🔐 Live Secrets Gate` hard fail | Repo variable `ENFORCE_LIVE_SECRETS=true` |

`test:coverage` remains informational (`continue-on-error`). Playwright is Chromium + Pixel 5 only.

---

## Stage 4 remediations (23 Sep 2026)

| ID | Status | Change |
|----|--------|--------|
| O-02 | Fixed | Live RLS queries `roles`/`permissions` — support / finance / claims_reviewer must not have settings, reveal, or exports |
| O-03 | Fixed | Idempotent storage lockdown + live isolation (claim-documents cross-member; member cannot write media/exports/kb/report-files) |
| O-05 | Fixed | CI E2E and Edge Function Check run on `develop` pushes |
| O-07 | Fixed | `auth-login` already audited invalid login; now also audits `ACCOUNT_INACTIVE` |
| A05 | Fixed | Member APIs use `handleUnexpectedError` — no raw SQL / stack in 500 bodies |
| O-01 | Ops | Still needs GitHub `E2E_ADMIN_TOTP_SECRET` + `ENFORCE_LIVE_SECRETS=true` |
| O-04 | Deferred | Firefox / WebKit (CI time) |
| O-06 | Deferred | Coverage threshold |
| O-08 | Deferred | PII column encryption |
| O-09 | Deferred | PDF malware vendor |
| P-* | Frozen | Daraja / M-Pesa |

Contracts: `frontend/src/lib/__tests__/owasp-stage4-fixes.test.ts`. Migration: `20260923180000_owasp_stage4_storage_lockdown.sql`.

## Remaining open (Stage 5 candidates)

Do not implement these until you approve Stage 5. No exploit PoCs.

| ID | Severity | Item |
|----|----------|------|
| O-01 | High (ops) | Set GitHub secrets including `E2E_ADMIN_TOTP_SECRET`, then `ENFORCE_LIVE_SECRETS=true` |
| O-04 | Medium | Firefox / WebKit Playwright project |
| O-06 | Medium | Coverage threshold (today informational) |
| O-08 | Low | PII column encryption (product + key-management decision) |
| O-09 | Info | Malware scan of valid PDFs (vendor) |
| P-* | Deferred | Daraja / M-Pesa — report only until full secrets + GO |

---

## GO decisions before Stage 5

1. Populate `E2E_ADMIN_TOTP_SECRET` (enrolled test admin) and flip `ENFORCE_LIVE_SECRETS=true`.  
2. Which leftover IDs to take in Stage 5 (O-04, O-06, O-08, O-09).  
3. Payments stay frozen unless you explicitly say otherwise.

---

## Appendix — 21 Sep 2026 cycle (already patched)

| ID | Status |
|----|--------|
| H-01 Import auto-active | Fixed — `pending_approval` + `email_confirm: false` |
| H-02 Claim MIME trust | Fixed — magic bytes |
| H-03 Admin UI unscoped | Fixed — `adminPermissions` + `RequirePermission` |
| H-04 Phone uniqueness | Fixed — `members_phone_unique` |
| M-02 Exports own-folder | Fixed — drop `*_own` policies |
| M-03 `ledger_read_own` | Fixed — dropped |
| M-04 CI High non-blocking | Fixed — then tightened again 23 Sep (`pipefail`) |
| M-05 Excel XML escape | Fixed |
| M-08 Login open redirect | Fixed — `safeInternalPath` |
| M-10 Deno check | Fixed |
| L-05 Contact href | Fixed — `safeHref` |
| P-* Payments | Unchanged |
