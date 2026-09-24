# Luma Welfare — Security Audit

**Date:** 23 Sep 2026  
**Scope:** Vite/React SPA (Vercel) + Supabase (Postgres / RLS / Auth / Storage) + Edge Functions  
**This document is Stages 1–5 findings.** Ongoing operations: `docs/SECURITY_MAINTENANCE.md` (Stage 6, 24 Sep 2026).  
**Payments:** M-Pesa / Daraja remain **read-only**. No payment initiate/callback changes.

Prior cycle (21 Sep 2026) High/Medium patches (H-01–H-04, M-02–M-06, M-08, M-10, L-05) stay in force. Contracts: `frontend/src/lib/__tests__/owasp-stage5-fixes.test.ts`.

---

## Executive status

| Area | Status |
|------|--------|
| A01 Access control | Privileged actions split off `members:read`. Support cannot be granted settings / reveal / exports. Client nav is UX-only. |
| A02 Crypto | National ID, DOB, phones still stored at rest in Postgres. No column encryption (not approved). |
| A03 Injection | Parameterized PostgREST / RPC. Offline sanitize + magic-byte uploads. Claim / payout amounts go through `parseOptionalMoneyAmount` / `parseRequiredMoneyAmount`. |
| A04 Insecure design | Self-approve blocked. Fee-required activate. Claim upload uses one id. Login / forgot-password go through rate-limited Edge Functions. |
| A05 Misconfig | Hosted `enable_signup=false`. Health / callback use `handleCors`. Hosted Edge no longer defaults CORS to localhost. Member 500s stay generic. |
| A06 Components | CI fails production High/Critical (`pipefail` + `--audit-level=high`). Vitest coverage has a floor. |
| A07 Auth | Staff 2FA required. Role grant/revoke retries session invalidation and returns `session_invalidated`. |
| A08 Integrity | Bundle secret scan + legacy-backend guard on build. |
| A09 Logging | Audit log FORCE RLS. `auth_failed` on invalid / inactive login. Incomplete session invalidate is audited. |
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

## Stage 5 remediations (23 Sep 2026)

| ID | Status | Change |
|----|--------|--------|
| Amounts | Fixed | Shared money parser (positive, finite, ≤ 10,000,000 KES). Used on member claim create/submit, admin approve, and admin payout. |
| Sessions | Fixed | Role grant/revoke retries session sign-out once, returns `session_invalidated`, audits `staff.session_invalidate_incomplete`. Staff UI warns. Role write is not rolled back (already committed). |
| CORS | Fixed | Hosted `*.supabase.co` default is production origin only. Localhost stays for local `functions serve`. |
| O-04 | Fixed | Playwright `firefox-security-api` project (`security-api.spec.ts` only). CI installs Firefox. WebKit not added (CI time). |
| O-06 | Fixed | Vitest coverage thresholds in `vite.config.ts`. CI coverage step no longer `continue-on-error`. |
| O-01 | Ops | Still needs GitHub `E2E_ADMIN_TOTP_SECRET` + `ENFORCE_LIVE_SECRETS=true` |
| O-08 | Deferred | PII column encryption (product + key-management decision) |
| O-09 | Deferred | PDF malware vendor |
| P-* | Frozen | Daraja / M-Pesa |

Contracts: `frontend/src/lib/__tests__/owasp-stage5-fixes.test.ts`.

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

Playwright is Chromium + Pixel 5 + Firefox (`security-api` only). Coverage is a floor, not a skip.

---

## Remaining open (ops / product decisions)

Tracked for operators in `docs/SECURITY_MAINTENANCE.md`. Stage 6 did not implement these.

| ID | Severity | Item |
|----|----------|------|
| O-01 | High (ops) | Set GitHub secrets including `E2E_ADMIN_TOTP_SECRET`, then `ENFORCE_LIVE_SECRETS=true` |
| O-08 | Low | PII column encryption (product + key-management decision) |
| O-09 | Info | Malware scan of valid PDFs (vendor) |
| P-* | Deferred | Daraja / M-Pesa — report only until full secrets + GO |
| WebKit | Info | Extra Playwright project (skipped to keep CI time) |

---

## Appendix — Stages 1–4 (already patched)

### Stage 1 — OWASP Top 10

SPA login / forgot-password → Edge rate limits; RBAC split (`settings:*`, `members:reveal`, `uploads:create`); staff 2FA required; claim upload single id; self-approve blocked; fee-required activate; `enable_signup=false`.

### Stage 2 — extra checks

Anonymize purges address / WhatsApp / emergency contacts; magic-byte CMS uploads; health / callback `handleCors`; audit log UPDATE trigger; deploy workflow env-passed function name.

### Stage 3 — test / CI

2FA-aware admin E2E; Login stores step-up token; expanded 401 list; `pipefail` + `--audit-level=high`; stable login selectors.

### Stage 4 — combined remediations

Live role-matrix contract; storage lockdown migration; E2E on `develop`; `auth_failed` for inactive accounts; `handleUnexpectedError` on member APIs.

Full tables remain in git history of this file from the Stage 4 commit.
