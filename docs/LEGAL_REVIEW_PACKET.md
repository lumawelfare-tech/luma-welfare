# Legal review packet — Luma Welfare Platform

**Status:** DRAFT for Kenyan counsel · Not legal advice · Not an ODPC compliance claim  
**Privacy version:** `2026-09-21.1` · **Terms version:** `2026-09-21.1`  
**Config:** `frontend/src/config/legal.ts` (`draftPendingLegalReview=true`)

This packet summarises what the **code and schema actually do** so a lawyer can finalize Privacy Policy and Terms.

## 1. Data inventory summary

See also `docs/DATA_INVENTORY.md`.

| Category | Examples | Store |
|----------|----------|--------|
| Identity | name, email, phone, optional ID number, photo, membership # | `members`, Supabase Auth |
| Family | next-of-kin style records | `family_members` |
| Membership ops | subscriptions, qualifications, packages | related tables |
| Money ops | contributions (manual verify); payments tables exist but online M-Pesa gated off | `contributions`, `payments*` |
| Claims | claim text/status + private Storage evidence | `claims`, `claim_documents` |
| Comms | notifications, prefs, push endpoints, contact-form email | notifications / Resend |
| Rights / consent | privacy/terms timestamps + versions; deletion requests; acceptance history | `members`, `member_legal_acceptances`, `data_deletion_requests` |
| Admin | admins, RBAC, 2FA, audit_logs | admin tables |

## 2. Processors (as implemented)

| Processor | Role | When active |
|-----------|------|-------------|
| Supabase | Auth, DB, RLS, Edge Functions, Storage | Always (core) |
| Vercel | SPA hosting + `/api/cron/*` | Always (frontend) |
| Resend | Transactional email | When `RESEND_API_KEY` set |
| Sentry | Errors (+ masked session replay in browser) | When FE/Edge DSN set |
| Google OAuth | Login for existing members only | When configured |
| M-Pesa / Daraja | STK / callbacks | **Disabled** (`PAYMENTS_ENABLED` fail-closed) — do not describe as live collection |

## 3. Data flows (high level)

1. **Register** → `auth-register` creates Auth user + member (`pending_approval`) with consent timestamps/versions → OTP email → `auth-verify-email`.
2. **Sign-in** → Supabase Auth session → `auth-me` loads profile; member portal requires matching Privacy/Terms versions or re-consent via `member-profile?action=accept-legal`.
3. **Member ops** → Edge Functions with JWT + RLS for own rows; admins use elevated Edge Functions + audit logs.
4. **Export / delete request** → Profile export JSON; deletion request row for manual fulfilment.
5. **Public** → `public-data`, `contact` (Resend), marketing pages; no advertising pixels.

## 4. Retention (coded behaviour)

| Data | Coded behaviour |
|------|-----------------|
| Notifications | ~90d read / ~180d unread cleanup |
| Non-financial audit | ~2y cleanup; financial audit retained longer |
| Membership / contributions / claims | Operational / financial retention; not auto-purged on soft close |
| Deletion requests | Manual process; financial records may be retained |

Counsel should confirm statutory periods vs these engineering defaults.

## 5. Member-rights features (product)

| Right | Feature |
|-------|---------|
| Access | Profile → Download my data |
| Rectify | Profile edit |
| Erasure request | Profile → deletion request |
| Re-consent | `LegalConsentGate` when versions bump |

## 6. Admin access controls

- `admins` + roles/permissions; Edge Functions check admin role
- Optional admin 2FA step-up token for sensitive admin functions
- List APIs may mask phone/ID; detail views audited
- Service role only on server (Edge), never in `VITE_*`

## 7. Open questions for counsel / operators

1. Exact legal entity name, registration number, physical address, DPO identity/email.
2. ODPC registration requirement and number (see `ODPC_REGISTRATION_CHECKLIST.md`).
3. Confirm activation fee wording (KSh 300) and package rules as contractual vs policy.
4. Confirm governing law forum / dispute venue (placeholder in config).
5. Confirm whether Sentry session replay is acceptable under DPA; if not, disable DSN or replay rates.
6. Confirm retention for claim evidence and contribution history.
7. Children / age of majority for membership.
8. Cross-border processing wording for Supabase/Vercel/Resend/Sentry regions.
9. When `draftPendingLegalReview` can be set `false` (fill all `PLACEHOLDER_*` first — production build will fail otherwise).

## 8. Engineer checklist before go-live

- [ ] Apply migrations `20260921150000_phase3_data_protection.sql` and `20260921160000_phase3_legal_versions.sql`
- [ ] Redeploy `auth-register`, `member-profile`, and any function bundling `legal-versions.ts`
- [ ] Fill `frontend/src/config/legal.ts` placeholders; keep versions synced with `supabase/functions/shared/legal-versions.ts`
- [ ] Set `draftPendingLegalReview: false` only after counsel sign-off
- [ ] Run `npm run check:legal` and full CI
