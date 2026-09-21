# Luma Welfare — Security Audit

**Date:** 2026-09-21  
**Scope:** Vite/React SPA (Vercel) + Supabase (Postgres/RLS/Auth/Storage) + Edge Functions only  
**Auditor mode:** Stages 1–2 complete. **Stage 4 patches applied** (payments excluded). Stage 5 pending.  
**Payments:** M-Pesa/Daraja audited **read-only** — findings reported; no payment code/env changes.

---

## Stage 1 — Recon inventory

### 1.1 Frontend routes

| Zone | Paths | Guard |
|------|-------|-------|
| Public | `/`, `/about`, `/packages`, `/how-it-works`, `/faq`, `/privacy`, `/terms`, `/contact`, `/news`, `/gallery`, `/media`, `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `*` | `Layout` only (`frontend/src/App.tsx`) |
| Member | `/dashboard`, `/contributions`, `/join`, `/profile`, `/family`, `/receipts-statements`, `/claims`, `/notifications`, `/notification-preferences` | `RequireMember` + `LegalConsentGate` |
| Admin | `/admin/*` (dashboard, members, fees, packages, contributions, claims, subscriptions, news, gallery, media, reports, scheduled-reports, settings, audit-logs, reconciliation, health) | `RequireAdmin` (+ in-UI 2FA) |
| Superadmin | `/admin/staff-roles` | `RequireAdmin` + `RequireSuperadmin` |

**Note:** Client guards are UX-only; Edge Functions must enforce authorization (`App.tsx` comments + prior hardening).

### 1.2 Edge functions (46)

**Gateway JWT OFF** (`scripts/deploy-edge-functions.sh` allowlist + `supabase/config.toml`):  
`auth-register`, `auth-verify-email`, `auth-login`, `public-data`, `contact`, `payments-callback`, `send-report-email`, `admin-exports-worker`, `health`.

**Auth pattern:** Most admin paths use `getAuthenticatedUser` → `loadAdminSession` → `requirePermission`. Member paths scope by `eq('member_id', user.id)`. Cron/callback use shared secrets.

**Validation:** No Zod anywhere. Shared pure-TS parsers in `supabase/functions/shared/validate.ts` for auth/register/profile/roles/reveal/delete. Majority of admin CRUD uses manual checks.

**CORS:** Allowlist reflection in `shared/cors.ts` (not `*`).

### 1.3 Database / RLS (migration-backed)

- Core PII/financial tables: RLS + many `FORCE ROW LEVEL SECURITY` (`20260921140000_phase2_security_verification.sql`).
- Member INSERT clamps on payments/contributions/claims/registration_fees (`20260918091409_phase1_security_containment.sql`).
- `id_number`: partial unique index (`20260921180000_members_id_number_unique.sql`).
- **No UNIQUE** on `members.phone` or `members.email` (email uniqueness is Auth-side only).
- Public SELECT `USING (true)`: `gallery_items`, `package_rules` (DML revoked).
- Residual: `financial_ledger.ledger_read_own` still present vs later “admin-only” commentary.
- Storage: `claim-documents` private+path-bound; `media` public; `exports` private but any authenticated user may use own UID folder.

### 1.4 Third parties / env

| Service | Client env |
|---------|------------|
| Supabase | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Sentry | `VITE_SENTRY_DSN`, `VITE_APP_VERSION` |
| Site URL | `VITE_SITE_URL` / `VITE_PUBLIC_SITE_URL` |
| Web Push | `VITE_VAPID_PUBLIC_KEY` |
| Resend / Daraja / cron | Server-only (Edge / Vercel cron) |

### 1.5 CI workflows

| Workflow | Role |
|----------|------|
| `.github/workflows/ci.yml` | npm audit, typecheck, lint, unit + qualify + live RLS (if secrets), build, bundle scan, Playwright e2e, security-summary |
| `.github/workflows/scheduled-security.yml` | Weekly audit (continue-on-error on audit steps) |
| `.github/workflows/deploy-functions.yml` | Edge deploy |

### 1.6 Component inventory (audit coverage map)

| Component / surface | Stage 2 sections |
|---------------------|------------------|
| Auth (register/login/OTP/reset) | A, C |
| Member CRUD + claims upload | A, B |
| Admin members import/export/reveal | A, B, E |
| Admin reports/CSV/Excel | A |
| News/Gallery/Media CMS | A, G |
| Payments initiate/callback | D integrity (read-only) |
| RLS + DEFINER RPCs | B |
| Vercel headers / CSP | D |
| CI / deps / Actions | D, F |
| SEO / noindex | G |

---

## Stage 2 — Findings

Severity order: Critical → High → Medium → Low.  
Each finding: ID, severity, OWASP category, location, issue, exploit (one sentence), proposed patch.

### Critical

_(None confirmed with a complete remote exploit chain from evidence alone. Highest issues are High.)_

---

### High

#### H-01 — Bulk CSV import creates verified, **active** members without fee/OTP
- **OWASP:** Broken Access Control / Insecure Design  
- **Location:** `supabase/functions/admin-members/index.ts` ~388–410  

```388:410:supabase/functions/admin-members/index.ts
          const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          })
          // ...
            .insert({
              id: authUser.user.id,
              email,
              full_name: fullName,
              phone,
              id_number: idNumber || null,
              status: 'active',
```

- **What's wrong:** Import bypasses normal `pending_approval` / email OTP and marks Auth email confirmed. Phone/ID not run through `parseKenyanNationalId` / `normalizeKenyanPhone`. Temp password is generated but not returned in API results (orphaned credentials until reset).  
- **Exploit:** Compromised or over-permissioned staff account (or XSS on admin) can mass-create active members skipping verification and registration fee gate.  
- **Patch:** Create as `pending_approval` + `email_confirm: false` (or invite flow); validate phone/ID with shared parsers; never auto-active without explicit flag + audit; return invite/reset link pattern.

#### H-02 — Claim document upload trusts client MIME; no content sniffing
- **OWASP:** Security Misconfiguration / Injection (file)  
- **Location:** `supabase/functions/member-claims/index.ts` ~167–200  

```167:200:supabase/functions/member-claims/index.ts
      const { fileName, fileData, fileType, documentType } = body
      // ... size check only ...
        .upload(storagePath, bytes, {
          contentType: fileType || 'application/octet-stream',
          upsert: false,
        })
```

- **What's wrong:** Server does not allowlist extensions/MIME by magic bytes. Client can send `fileType: image/svg+xml` or executable bytes labeled as PDF.  
- **Exploit:** Member uploads polyglot/SVG/HTML that later opens via signed URL in a privileged browser context.  
- **Patch:** Detect magic bytes; allowlist jpeg/png/webp/pdf (+ docx if required); reject SVG; force safe `contentType`; keep private bucket + short signed URLs (already path-scoped).

#### H-03 — Admin UI not permission-scoped (all staff roles see all admin pages)
- **OWASP:** Broken Access Control  
- **Location:** `frontend/src/components/AdminLayout.tsx` ~271–272; `RequireAdmin.tsx` (admin flag only)  

```271:272:frontend/src/components/AdminLayout.tsx
        {navSections.map((section) => {
          const items = section.items.filter((item) => !item.superadminOnly || isSuperadmin)
```

- **What's wrong:** Sidebar only filters `superadminOnly`. A `support` or `claims_reviewer` admin can navigate to `/admin/reconciliation`, `/admin/settings`, etc. Server `requirePermission` should deny — but any missing check becomes a full vertical escalation.  
- **Exploit:** Low-privilege staff probes finance/settings URLs; succeeds if an endpoint omits `requirePermission`.  
- **Patch:** Map routes → required permission; hide + hard-redirect unauthorized routes; add Playwright per-role matrix.

#### H-04 — No DB unique constraint on `members.phone`
- **OWASP:** Identification and Authentication Failures / Insecure Design  
- **Location:** Migrations index phone for search only (`idx_members_phone_trgm`); no UNIQUE (recon of `supabase/migrations`).  
- **What's wrong:** Duplicate phones allowed at DB layer; register normalizes phone but uniqueness not enforced like `id_number`.  
- **Exploit:** Two accounts share one M-Pesa phone → STK/callback attribution ambiguity and KDPA identity confusion.  
- **Patch:** Partial unique index on normalized phone (non-null); reject duplicates in register/import/profile with clear errors.

---

### Medium

#### M-01 — Most Edge inputs lack strict schema / unknown-key rejection
- **OWASP:** Insecure Design / Injection  
- **Location:** Majority of `supabase/functions/*/index.ts`; only subset use `shared/validate.ts`. Comment at `shared/validate.ts:3`: “no Zod”.  
- **What's wrong:** No `.strict()` equivalent; admin-packages PATCH and similar map body fields without typed bounds.  
- **Exploit:** Extra fields or oversized strings cause unexpected DB writes or DoS via large payloads.  
- **Patch:** Shared Zod (or expand pure-TS parsers) with allowlists + max lengths for every mutating endpoint.

#### M-02 — `exports` storage policies allow any authenticated user’s own folder
- **OWASP:** Broken Access Control  
- **Location:** Migrations `20260826000001…` / `20260921140000…` (exports insert/select/delete where path `[1]=auth.uid()`).  
- **What's wrong:** Not limited to admins; any logged-in member JWT can write under their UID folder in `exports`.  
- **Exploit:** Member stores arbitrary files in exports bucket or probes naming conventions.  
- **Patch:** Restrict policies to service_role / active admin claims; members never need direct bucket access.

#### M-03 — `financial_ledger` still has `ledger_read_own`
- **OWASP:** Broken Access Control  
- **Location:** `supabase/migrations/20260827100000_phase7_financial_ledger.sql` policy `ledger_read_own`; later phase13 comments say admin-only but policy not dropped.  
- **What's wrong:** Members can SELECT own ledger rows via PostgREST if table is exposed.  
- **Exploit:** Member enumerates fine-grained payment ledger metadata beyond intended UI.  
- **Patch:** `DROP POLICY ledger_read_own`; confirm Edge-only access.

#### M-04 — CI does not fail on High npm audit findings
- **OWASP:** Software Supply Chain Failures  
- **Location:** `.github/workflows/ci.yml` ~88–101 (Critical fails; High only warns). Scheduled workflow uses `continue-on-error: true` on audit.  
- **What's wrong:** High-severity transitive vulns can merge.  
- **Exploit:** Compromised/vulnerable dependency ships to production.  
- **Patch:** Fail CI on High (with documented exceptions file); remove continue-on-error on scheduled audit or notify.

#### M-05 — AdminReports Excel XML does not escape `<>&`
- **OWASP:** Injection (XSS / XML)  
- **Location:** `frontend/src/pages/admin/AdminReports.tsx` ~55–61, ~413–424  

```55:61:frontend/src/pages/admin/AdminReports.tsx
function escapeCSV(val: string): string {
  if (/^[=+\-@\t\r]/.test(val)) return `'${val}`
  // ... quote escaping only — no XML entity escaping
}
```

- **What's wrong:** Formula injection is neutralized for CSV, but SpreadsheetML cells use the same helper without XML escaping.  
- **Exploit:** Member name containing `</Data><script>…` breaks XML / may execute when opened in some clients.  
- **Patch:** Use shared `escapeXml` + formula sanitizer; prefer SheetJS path already used in `exports.ts`.

#### M-06 — CSV import validation is incomplete
- **OWASP:** Injection / Insecure Design  
- **Location:** `admin-members/index.ts` import loop ~361–367; client `AdminMembers.parseCSV`.  
- **What's wrong:** No email regex, phone/ID format, name length, or unknown-key rejection; Auth errors may echo to client (`authErr?.message`).  
- **Exploit:** Poisoned CSV creates bad Auth users or leaks provider error detail.  
- **Patch:** Reuse `parseRegisterBody`-class validators per row; sanitize error messages.

#### M-07 — `send-email` accepts arbitrary admin HTML
- **OWASP:** Injection / Soft Integrity  
- **Location:** `supabase/functions/send-email/index.ts` ~83–121  
- **What's wrong:** Length-checked HTML only; no sanitizer. Any admin with `members:read` can send HTML email.  
- **Exploit:** Compromised admin session phishes members via trusted Resend domain.  
- **Patch:** Restrict to superadmin/finance; template allowlist; sanitize HTML; tighter permission.

#### M-08 — Login post-auth redirect uses unvalidated `location.state.from`
- **OWASP:** Identification and Authentication Failures (open redirect class)  
- **Location:** `frontend/src/pages/Login.tsx` ~15, ~63  

```15:15:frontend/src/pages/Login.tsx
  const from = (location.state as { from?: string })?.from ?? '/dashboard'
```

- **What's wrong:** `from` is not constrained to relative same-origin paths.  
- **Exploit:** If any page sets `state.from` to an absolute URL, post-login navigates off-site.  
- **Patch:** Allow only paths matching `/^\/(?!\/)/` (relative, no protocol-relative).

#### M-09 — CSP allows `style-src 'unsafe-inline'` and broad `*.supabase.co` / Unsplash
- **OWASP:** Security Misconfiguration  
- **Location:** `frontend/vercel.json` CSP header ~17  
- **What's wrong:** Inline styles weaken XSS mitigation; image/media wildcards widen exfil surface.  
- **Exploit:** Injected inline style/CSS or unexpected media host.  
- **Patch:** Tighten on preview; prefer hashes/nonces if feasible; pin storage CDN host.

#### M-10 — Deno CI typecheck covers only 2 Edge entrypoints
- **OWASP:** Software or Data Integrity Failures  
- **Location:** `.github/workflows/ci.yml` ~146–149 (`qualify.ts`, `admin-subscriptions` only).  
- **What's wrong:** Most Edge Functions are not typechecked in CI.  
- **Exploit:** Type/auth regressions ship unnoticed.  
- **Patch:** Expand `deno check` to all `supabase/functions/*/index.ts` (or matrix).

#### M-11 — Gallery public SELECT `USING (true)`
- **OWASP:** Broken Access Control (data exposure)  
- **Location:** `20260829200000_phase13_security_hardening_v2.sql` `gallery_items_public_read`  
- **What's wrong:** Unpublished/draft gallery rows readable if inserted without publish flag (table may lack soft-publish).  
- **Exploit:** Direct PostgREST read of all gallery rows.  
- **Patch:** Align with `is_published` (like news/media) if drafts exist.

#### M-12 — Staff role vs API permission matrix not covered by E2E
- **OWASP:** Broken Access Control / Security Logging gaps in tests  
- **Location:** `e2e/` + `scripts/__tests__/rls-isolation.live.test.ts` (member A/B + admin-claims edge; not full staff role matrix).  
- **What's wrong:** Missing Playwright proofs for support/finance/claims_reviewer denied routes/APIs.  
- **Patch:** Seed roles + assert 403 + UI redirect (Stage 5).

---

### Low

#### L-01 — Auth parsers do not reject unknown keys
- **OWASP:** Insecure Design  
- **Location:** `shared/validate.ts` `parseLoginBody` / `parseRegisterBody` — read known fields only, ignore extras (no strict reject).  
- **Patch:** Reject unexpected keys.

#### L-02 — `export_admin_quotas` SELECT not scoped to calling admin
- **OWASP:** Broken Access Control  
- **Location:** `20260901100000_export_worker_hardening.sql` `export_quotas_admin_read`  
- **Patch:** `admin_id = auth.uid()` (or service_role only).

#### L-03 — Coverage job `continue-on-error: true`
- **OWASP:** Integrity  
- **Location:** `.github/workflows/ci.yml` ~200  
- **Patch:** Keep non-blocking only if explicitly documented; prefer separate informational job.

#### L-04 — Packages/tiers RLS not FORCE’d
- **OWASP:** Security Misconfiguration  
- **Location:** FORCE list omits `packages` / `package_tiers`  
- **Patch:** Add FORCE if table owners could bypass.

#### L-05 — Contact `href={c.href}` from CMS/settings
- **OWASP:** Injection  
- **Location:** `frontend/src/pages/Contact.tsx` ~194  
- **Patch:** Allowlist `tel:`, `mailto:`, `https:` only.

#### L-06 — Receipt HTML blob uses local escape helpers
- **OWASP:** XSS  
- **Location:** `frontend/src/pages/member/ReceiptsStatements.tsx`  
- **Status:** Uses `escapeHtml` / `escapeXml` — verify completeness in patch phase; prefer shared sanitizer.

#### L-07 — Health OPTIONS skips Origin allowlist reject
- **OWASP:** Security Misconfiguration  
- **Location:** `supabase/functions/health/index.ts` (recon)  
- **Patch:** Use `handleCors` consistently.

---

### Payments (read-only — **Skipped for patch**)

| ID | Severity | Note |
|----|----------|------|
| P-01 | Medium | `MPESA_CALLBACK_SECRET` via query `?secret=` may appear in access logs/proxies — prefer header-only. Evidence: `payments-callback/index.ts` header comment L13, authorize ~54+. |
| P-02 | Low | Confirm Daraja IP allowlisting / retry behavior in Supabase dashboard (manual). |
| P-03 | Info | Amount mismatch handled via RPC (`amount_mismatch`) — good integrity pattern; do not change. |

**No payment code, flags, or env vars will be modified in Stage 4 unless you explicitly override this rule.**

---

### Positive controls observed

- Member-scoped RLS + FORCE on core tables; INSERT status/amount clamps.  
- `requirePermission` + admin 2FA step-up token path.  
- PostgREST search via `buildIlikeOrFilter` (sanitized).  
- No `dangerouslySetInnerHTML` in production React.  
- CSV formula neutralization in `exports.ts` and AdminReports CSV path.  
- Claim docs stored as private paths + signed URLs (phase2 tests reference).  
- ID reveal audited (`admin-reveal-member-id` + parsers).  
- Sentry scrubbing headers in `frontend/src/lib/sentry.ts`.  
- Bundle secret scan + backend URL guard in CI build job.  
- Live RLS suite exists (skips without secrets; fails when secrets set).

---

## Stage 2G — SEO / public-site (summary)

| Check | Result |
|-------|--------|
| `useHead` title/description/OG/robots | Present (`frontend/src/lib/seo.ts`) |
| Member/admin `noindex` | Used on dashboards (`noindex: true` pattern) |
| Sitemap/robots | Generated in frontend prebuild scripts |
| News body | Text via `{n.body}` + `whitespace-pre-line` — React-escaped (good) |
| Placeholder legal | Draft banners / unresolved legal placeholders — content risk, not XSS |

Detailed SEO CI job (Stage 5) not present yet.

---

## Stage 2F — Quality snapshot (commands not re-run this stage)

Prior session: frontend typecheck/tests/build green after motion work.  
**This stage:** report-only — full lint/typecheck/unit/Playwright/build deferred to Stage 4/5 after patch approval.

Known CI soft spots: High audit non-blocking; coverage continue-on-error; RLS self-skips without secrets; Deno check incomplete.

---

## Findings → OWASP coverage table

| OWASP category | Checked? | Result |
|----------------|----------|--------|
| A01 Broken Access Control | Yes | H-01, H-03, M-02, M-03, M-11, M-12, L-02 |
| A02 Security Misconfiguration | Yes | H-02, M-09, L-04, L-07 |
| A03 Software Supply Chain | Yes | M-04, M-10, L-03 |
| A04 Cryptographic Failures | Partial | Client only publishable keys; secrets scan present — Manual verify Auth MFA/password |
| A05 Injection | Yes | H-02, M-01, M-05, M-06, M-07, L-01, L-05 |
| A06 Insecure Design | Yes | H-01, H-04, M-01 |
| A07 Authentication Failures | Yes | H-04, M-08; OTP/rate-limit present in shared modules — Manual verify dashboard |
| A08 Software/Data Integrity | Yes | M-10; payments integrity P-* (read-only) |
| A09 Logging & Alerting | Partial | Audit log on admin actions; Sentry scrub — alerting spikes Manual |
| A10 Mishandling Exceptional Conditions | Partial | `handleAdminError` fails closed on FORBIDDEN; some Auth errors echoed on import |

---

## Manual verification (cannot confirm from repo alone)

1. Supabase Auth: leaked-password protection, min password length, email confirmations **enabled** in hosted project.  
2. MFA enrollment required for all staff.  
3. Redirect URL allowlist (Google OAuth / password reset).  
4. Branch protection: required checks = typecheck, lint, test, build, e2e, security-audit.  
5. Whether CI secrets for live RLS are configured on GitHub.  
6. Production `PAYMENTS_ENABLED` / callback URL / Daraja IP controls.  
7. Resend domain authentication (SPF/DKIM).  
8. Whether `gallery_items` ever stores unpublished rows.  
9. Pentest before real member PII onboarding (KDPA).  
10. Key rotation if any historical secret exposure suspected.

---

## Skipped (payment-related — do not auto-patch)

- Any change under `payments-initiate`, `payments-callback`, `member-registration-fee` Daraja calls, `PAYMENTS_ENABLED`, M-Pesa env vars, amount/callback business logic.  
- Findings **P-01…P-03** are informational only unless you explicitly authorize payment work.

---

## Stage 3 — Summary (STOP)

### Counts by severity

| Severity | Count |
|----------|------:|
| Critical | 0 |
| High | 4 |
| Medium | 12 |
| Low | 7 |
| Payments (read-only) | 3 |

### Top 10 risks

1. H-01 Bulk import → active + email_confirm members  
2. H-02 Claim upload MIME/magic-byte trust  
3. H-03 Admin UI missing per-role route enforcement  
4. H-04 No unique phone at DB  
5. M-02 Exports bucket open to any authenticated user  
6. M-03 Ledger self-read policy residual  
7. M-01 Weak/inconsistent input schemas  
8. M-04 CI High vulns non-blocking  
9. M-05 Excel XML escaping gap  
10. M-06 Import field validation gaps  

### Proposed Stage 4 order (after your approval)

1. **Critical/High:** H-01, H-02, H-03, H-04 (+ M-02, M-03)  
2. **Shared sanitization module:** Zod/strict parsers, safe search (already), CSV/XML escape, URL allowlist, upload magic-byte helper  
3. **Medium/Low:** M-04…M-12, L-* ; CSP preview tighten  
4. **Bugs/SEO:** SEO CI script; Contact href allowlist  

### Stage 5 (after patches)

RLS expansion (staff roles + storage), Edge security regression suite, Playwright role/XSS/CSV matrix, SEO CI, OWASP CI job failing on High.

---

## Approval needed

**Reply with which finding IDs to patch** (e.g. “all High + M-02/M-03/M-05” or “everything except payments and CSP”).  

**No code will be modified until you approve.**

---

## Stage 4 — Patches applied (2026-09-21)

Approved scope: all High + M-02/M-03/M-04/M-05/M-06/M-08/M-10 + L-05; **payments excluded**.

| ID | Status | Change |
|----|--------|--------|
| H-01 | Fixed | Import → `pending_approval` + `email_confirm: false`; `parseImportMemberRow` |
| H-02 | Fixed | `shared/file-upload.ts` magic-byte allowlist in `member-claims` |
| H-03 | Fixed | `auth-me` returns `adminPermissions`; `RequirePermission` + sidebar filter |
| H-04 | Fixed | Migration `members_phone_unique` partial unique index |
| M-02 | Fixed | Drop exports `*_own` storage policies; admin-select-only |
| M-03 | Fixed | `DROP POLICY ledger_read_own` |
| M-04 | Fixed | CI fails on High npm audit; scheduled audit no longer continue-on-error |
| M-05 | Fixed | `sanitizeSpreadsheetCell` / `escapeXml` in AdminReports Excel path |
| M-06 | Fixed | Covered by H-01 validators |
| M-08 | Fixed | `safeInternalPath` on Login redirect |
| M-10 | Fixed | `deno check` all `supabase/functions/*/index.ts` |
| L-05 | Fixed | `safeHref` on Contact channel links |
| P-* | Deferred | Payments unchanged |
| M-01, M-07, M-09, M-11, M-12, L-* remaining | Deferred | Stage 5 |

Migration: `supabase/migrations/20260921220000_security_audit_stage4.sql` (apply to linked project before relying on H-04/M-02/M-03 in prod).
