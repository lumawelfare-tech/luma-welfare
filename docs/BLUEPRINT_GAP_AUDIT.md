# Luma Welfare — Blueprint Implementation Gap Audit

**Date:** 2026-09-22  
**Mode:** Audit only — **no product code changes** in this document’s creation.  
**Constraint:** Do not rebuild. Preserve branding, architecture, and working modules. Extend existing tables before creating duplicates.  
**Payments:** Keep M-Pesa/`PAYMENTS_ENABLED` gated unless explicitly approved later.  
**Interactive canvas:** open beside chat — `blueprint-gap-audit.canvas.tsx` in the workspace canvases folder.

---

## Required first response (§23)

### 1. Current architecture

Vite 8 + React 19 SPA (`frontend/`), React Router 7, Tailwind 4, Framer Motion, optional Sentry. Hosted on Vercel (static + optional `/api/cron/*`). Browser talks **only** to Supabase Auth, Storage, and Edge Functions via `frontend/src/lib/api.ts`. No separate Node/Hono API (`docs/ARCHITECTURE.md`).

### 2. Current database schema (reuse map)

| Concept | Existing | Blueprint action |
|---------|----------|------------------|
| Members | `members` | **EXTEND** — never `luma_members` |
| Family / dependants | `family_members` | **EXTEND** (beneficiaries) |
| Programs | `packages`, `package_tiers`, `package_rules`, `subscriptions` | Reuse |
| Contributions | `contributions` (`Pending` → `Verified` / `Failed`) | Reuse |
| Payments | `payments`, `payment_timeline`, `webhook_events` | Reuse; keep disabled |
| Fees | `registration_fees` | Reuse |
| Claims | `claims`, `claim_documents` | Extend workflow metadata |
| Qualification | `qualifications` + `shared/qualify.ts` | Reuse |
| Notifications | `notifications`, prefs, push, `announcements` | Reuse |
| Admin RBAC | `admins`, `roles`, `permissions`, `audit_logs` | Reuse |
| CMS | `news_events`, `gallery_items`, `media_items` | Reuse |
| Ledger | `financial_ledger`, `reconciliation_exceptions` | Reuse |
| Exports | `export_jobs` | Reuse |
| Legal / deletion | `member_legal_acceptances`, `data_deletion_requests` | Reuse |
| Membership applications | *(no dedicated entity)* | **NEW or extend `members`** |
| Document KB + ACL | *(missing)* | **NEW** |
| Complaints | *(missing)* | **NEW** |
| Community / Mission of Mercy | marketing copy only | **NEW or CMS** |
| Vectors / embeddings | *(missing)* | **NEW (Phase 7)** |

Authoritative migrations: `supabase/migrations/`. Base tables largely predate this repo’s migration set; later migrations alter/harden them.

### 3. Current routes / pages

**Public:** `/`, `/about`, `/packages`, `/how-it-works`, `/faq`, `/privacy`, `/terms`, `/contact`, `/news`, `/gallery`, `/media`, `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`.

**Member** (`RequireMember` + legal consent): `/dashboard`, `/contributions`, `/join`, `/profile`, `/family`, `/receipts-statements`, `/claims`, `/notifications`, `/notification-preferences`.

**Admin** (`RequireAdmin` + `RequirePermission`; staff-roles = superadmin): dashboard, members, registration-fees, packages, contributions, claims, subscriptions, news, gallery, media, reports, scheduled-reports, settings, audit-logs, reconciliation, health, staff-roles.

### 4. Current authentication

Supabase Auth email/password; Edge `auth-register` / `auth-verify-email` / `auth-login` / `auth-me`; Google OAuth helpers; password reset. Member statuses: `pending_approval` | `active` | `suspended` | `closed`. Admin 2FA + step-up on sensitive APIs. Client route guards are UX-only; Edge Functions enforce authorization.

### 5. Current RLS

RLS (+ FORCE RLS on sensitive tables) via phase1/phase2 security migrations. Live suite: `scripts/__tests__/rls-isolation.live.test.ts` (self-skips without secrets). Soft `Live Secrets Gate` until `ENFORCE_LIVE_SECRETS=true`. Intentional public reads: package rules, news/gallery, limited settings, public `media` bucket.

### 6. Current storage

| Bucket | Model |
|--------|--------|
| `claim-documents` | Private; signed URLs |
| `exports` | Private; admin-oriented (own-folder policies removed) |
| `media` | Public read (CMS) |
| `report-files` | Admin report downloads |

### 7. Current payment implementation

- **Manual:** member records contribution as `Pending`; admin `verify`/`reject` server-side (`admin-contributions`). Registration fees confirmed by admin.
- **M-Pesa:** `payments-initiate` / `payments-callback` / `payments-list` exist; gated by `PAYMENTS_ENABLED` (keep false). UI honesty via `paymentsUi.ts`. Client transaction reference must **not** auto-verify.

### 8. Current admin functionality

Members (incl. import/pending filters), registration fees, packages, contribution verification, claim decisions (approve/reject/request-info), subscriptions, CMS (news/gallery/media), reports + scheduled exports, reconciliation, settings, audit logs, health check, staff roles/RBAC.

### 9. Current member functionality

Dashboard, profile (export + deletion request), join packages, contributions, receipts/statements, family/dependants, claims + document upload, notifications + preferences/push.

### 10. Current AI functionality

**None.** No OpenAI/Anthropic clients, embeddings, pgvector, assistant UI, or AI Edge Functions. Org “knowledge” is static FAQ/About copy.

---

## Gap report

### A. Already implemented

Public site; auth + OTP; member portal; packages/programs; contributions + admin verify; receipts; family/dependants; claims submit + admin decide + qualification engine; private claim evidence; notifications; reporting/exports; audit logging; admin RBAC; health/Sentry hardening patterns.

### B. Partially implemented

| Item | Gap |
|------|-----|
| Membership workflow | Register → `pending_approval`; **no `application_number`**; incomplete Application → fee verify → membership number UX |
| Claims pipeline | Eligibility + admin decision exist; no explicit document/membership/contribution **checklist stages**; payout-after-approve partial |
| Beneficiaries | `family_members` ≈ dependants; no payout-beneficiary concept |
| Announcements / community | `announcements` + news; no Mission of Mercy module |
| Documents | Claim + public media only; no ACL KB lifecycle |
| Prod hardening | Live RLS/E2E soft-skip without secrets; legal DRAFT |
| Duplicate payment protection | Stronger on STK path; review manual refs when enabling pay |

### C. Missing

Formal membership applications entity/admin Applications queue; application numbers; complaints; document management with Public/Member/Staff/Admin/Restricted + Draft→Approved→Archived; knowledge base; RAG/embeddings; hybrid AI router; AI assistant UI.

### D. Security gaps

| Area | Notes |
|------|--------|
| Live RLS proof | Suites exist; need test Supabase secrets + ENFORCE |
| Staff role matrix E2E | Partial vs all permission pairs |
| Input validation | Shared `validate.ts` uneven across admin bodies |
| Payments | Must stay disabled until dedicated go-live audit |
| AI (future) | Must never RAG private member data; no AI claim/payment approval |
| Legal | Placeholders / ODPC checklist open |
| Schema drift | **Addressed** — `get_membership_funnel` uses `auth.users.email_confirmed_at` (`20260922140000_phase1_schema_foundation.sql`) |
| Ops DDL gaps | **Addressed in migrations** — `scheduled_reports` / `report_history` / `saved_reports` + `report-files` bucket (idempotent) |

(Many High findings in `docs/SECURITY_AUDIT.md` Stage 4 were patched; residual = ops proof + remaining Medium items.)

### E. Database gaps

Extend `members` / `family_members` / claims before inventing parallel tables. Bootstrap core DDL lives in `docs/legacy-backend-sql/schema.sql`; migrations harden/extend.

Also present and reusable (not previously emphasized): `payouts` (claim payout execution), `open_questions` (internal tracker — not a complaints product).

New tables likely only for: applications (if not folded into members), documents + ACL + versions, complaints, later embeddings/chunks, optional community programs.

### F. RAG readiness

**Not ready.** No classified documents, approval status, access levels, or vector store. Block RAG until Phase 6.

**Related stubs (not RAG):** Web Push subscribe CRUD exists; delivery loop in `shared/notifications.ts` is a stub (no real web-push send). SMS/WhatsApp are placeholders. `auth-oauth-provision` is disabled (410); Google is login-only for existing members.

---

## Implementation plan (approve before coding)

| Phase | Focus | Reuse | New | Tests / rollback |
|-------|--------|-------|-----|------------------|
| **0** | Audit (this doc) | — | — | N/A |
| **1** | DB + security foundation | RLS, CI, audit_logs | **DONE in-repo** (`20260922140000_phase1_schema_foundation.sql`); live ENFORCE still operator | live RLS; reverse migration |
| **2** | Membership application | `members`, fees, auth-register, AdminMembers | **DONE in-repo** — form fields + APP# + pending after email verify + admin approve issues membership # | E2E register→approve; feature-flag |
| **3** | Member portal gaps | existing member pages | **DONE in-repo** — Programs nav, Family & beneficiaries, `/documents` inbox, profile membership summary | member E2E; hide routes |
| **4** | Admin operations | AdminLayout, RBAC | **DONE in-repo** — Applications nav/detail polish, complaints, community support records | permission E2E; drop routes |
| **5** | Claims & welfare ops | qualify, claims EFs | checklist stages; payout notify | claims E2E; ignore new cols |
| **6** | Documents + KB | storage-signed patterns | ACL docs + lifecycle | storage RLS; private default |
| **7** | RAG / hybrid AI | auth + member query EFs | ingest, embeddings, assistant | AI security tests; kill switch |
| **8** | Testing + hardening | Playwright, CI | ENFORCE gate, preview→prod | full suite |

**Per phase:** typecheck, lint, unit, qualify, build, migration check, RLS (when secrets), critical E2E. Preview before production.

---

## STOP

**Phases 1–4** landed in-repo (schema foundation, membership application, member portal gaps, admin ops). Phase 4: complaints + community tables, Applications polish.

Await approval before **Phase 5** (claims & welfare ops: checklist stages, payout notify).
