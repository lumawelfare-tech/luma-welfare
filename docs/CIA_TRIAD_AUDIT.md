# Luma Welfare — CIA Triad audit

**Date:** 25 Sep 2026  
**Mode:** Report only. No remediations in this pass.  
**Stack:** Vite/React SPA (Vercel) + Supabase (Postgres / RLS / Auth / Storage) + Deno Edge Functions.  
**Prior sources:** `docs/SECURITY_AUDIT.md` (23 Sep 2026, OWASP Stages 1–5), `docs/PHASE18_SECURITY_AUDIT.md` (treat as stale where it conflicts), `docs/DEPLOYMENT_CHECKLIST.md` and `docs/LAUNCH_CHECKLIST.md` (there is **no** `docs/PRE_DEPLOY_CHECKLIST.md`), `docs/PHASE14_DISASTER_RECOVERY.md`, `docs/BACKUP_RESTORE.md`.  
**There was no prior `docs/CIA_TRIAD_AUDIT.md`.** This is the first dedicated CIA document.

Tags:

| Tag | Meaning |
|-----|---------|
| `[CODE]` | Enforced in this repo (Edge Functions, RLS SQL, SPA guards) |
| `[INFRA]` | Hosted platform / GitHub / Vercel / Supabase project settings |
| `[ORG DECISION]` | Needs an explicit owner decision or an out-of-band apply/test |

---

## Pending items from the last security session

These were written in git and **are on `origin/main`**. That is not the same as applied on the live project.

| Item | In git / pushed to `main` | Applied / deployed on live |
|------|---------------------------|----------------------------|
| `20260924180000_revoke_members_kra_pin_select.sql` | Yes (`8a18989`, 24 Sep) | **Not confirmed.** This session had no service-role env to query `supabase_migrations`. Prior session: written, not applied. CI does **not** run `supabase db push`. Latest Supabase Preview failed on **function bundle**, not SQL — so Preview did not prove this ran. |
| `20260924181000_family_members_id_number_unique.sql` | Yes (same push set) | **Not confirmed**, same reasons. File still **stops** if live duplicate active `(member_id, id_number)` groups exist — do not auto-merge. |
| Session revocation (`shared/session-invalidate.ts`, used by `manage-user-role` + `admin-members` suspend/close) | Yes (`8a18989`) | **Not confirmed on the live Edge bundle.** Latest CI job `🚀 Deploy Edge Functions` **failed** because `SUPABASE_ACCESS_TOKEN` was empty. A later local/manual deploy after `8a18989` would make it live; this pass cannot prove that. |

**Implication if KRA revoke is still unapplied:** `members.kra_pin` was added as a normal column (`20260924120000`). Until the REVOKE migration runs, `authenticated` / `anon` can still `SELECT` that column through PostgREST if table grants allow it. National-ID **files** are a different path (`member_documents` + private bucket). The column itself is the PostgREST exposure.

---

## Confidentiality

### 1. Phishing-resistant MFA

**Status: OFF for every role. `[CODE]` + `[ORG DECISION]`**

What is on today:

- Staff/admin APIs use **TOTP** (RFC 6238, HMAC-SHA1, 6 digits, 30s) implemented in `admin-2fa`. Not WebAuthn / FIDO2 / passkeys. TOTP is **phishable**.
- `loadAdminSession` **requires** setup: if `admins.two_factor_enabled` is not true → `{ status: '2fa_setup_required' }`. If enabled but no valid `x-admin-2fa-token` → `{ status: '2fa_required' }`. Admin UI is gated the same way (`RequireAdmin`).
- Members: email/password (and optional Google OAuth). **No** member MFA in this codebase.

`docs/PHASE18_SECURITY_AUDIT.md` still says staff 2FA is “optional per admin”. That is **wrong** relative to current `loadAdminSession`. `docs/SECURITY_AUDIT.md` (23 Sep) is closer: “Staff 2FA required.”

Phishing-resistant MFA (passkeys / hardware keys) is **not enabled for any account**. Enabling it is an `[ORG DECISION]`.

### 2. Least-privilege access (RLS re-check)

**Status: generally least-privilege in code; two live-apply gaps. `[CODE]` / `[INFRA]`**

| Surface | Current code |
|---------|----------------|
| `member_documents` | RLS + **FORCE RLS**. SELECT own (`member_id = auth.uid()`). INSERT own, pending-only, `uploaded_by = auth.uid()`. UPDATE/DELETE for `authenticated` are `USING (false)`. Writes/verify go through Edge (service role). Storage bucket `member-documents` is **private**; comment: no authenticated object policies — service-role upload + signed URLs. |
| `members.kra_pin` | Mask helpers in Edge/UI. **Column REVOKE** exists only in `20260924180000` (see pending table). Until applied, PostgREST may still expose the raw column. |
| `audit_logs` | RLS + FORCE RLS (Phase 2). Members have no read policy. UPDATE blocked (`prevent_audit_log_update`). DELETE blocked. Inserts via service role / `logAudit`. |
| Admin APIs | JWT → `loadAdminSession` (2FA) → `requirePermission`. Client nav is UX-only. |
| Member APIs | JWT `member_id = auth.uid()`. |

`member_documents` was **not** in the Phase 13 table list (it did not exist then). The current policies match the later identity-docs work and are least-privilege **in SQL in git**. Confirm FORCE RLS / policies on the **live** project when applying remaining migrations.

### 3. Encryption at rest + in transit

**Status: TLS yes; column encryption no; KRA revoke apply unconfirmed. `[INFRA]` / `[CODE]` / `[ORG DECISION]`**

- **In transit:** Vercel sets HSTS (`max-age=63072000; includeSubDomains; preload`) and CSP `upgrade-insecure-requests`. SPA `connect-src` is `https://*.supabase.co` / `wss://*.supabase.co`. Supabase API is HTTPS. Cloudflare checklist exists but is **optional / not verified as live** (`docs/CLOUDFLARE_DEPLOYMENT_CHECKLIST.md`).
- **At rest:** Postgres and Storage are Supabase-managed disk encryption. **No** application-level column encryption for national ID, DOB, phones, or KRA PIN (`SECURITY_AUDIT.md` A02 / O-08 still deferred).
- **KRA-PIN-revoke on live DB:** **not confirmed applied** (see pending table). Treat PostgREST KRA SELECT as **still an open confidentiality hole** until someone verifies the REVOKE on the live project.

### 4. Data classification

**Status: ad hoc, not a classification scheme. `[CODE]` / `[ORG DECISION]`**

What exists:

- Shared mask helpers (`frontend/src/lib/pii.ts`, Edge `shared/pii.ts`): phone, national ID, KRA PIN, email.
- Admin list vs reveal paths; some audit on reveal.
- Sentry scrub for phones/tokens.
- Column **comments** on `kra_pin`; no Postgres labels, no sensitivity enum, no uniform handling of DOB vs ordinary profile fields.

Financial rows use RLS + service-role writes, not a “classified field” marker. A formal classification (Public / Internal / Restricted / National-ID) is still an `[ORG DECISION]`.

---

## Integrity

### 1. Cryptographic hashing (passwords)

**Status: hashed by Supabase Auth. `[CODE]` + `[INFRA]`**

- Registration uses `auth.admin.createUser({ email, password, ... })` in `auth-register`. Login goes through `auth-login` → Supabase Auth.
- This repo does **not** store password hashes in `public.members` or any app table.
- GoTrue (Supabase Auth) hashes passwords with bcrypt by default. No custom hash in this codebase. No plaintext password logging found in the register/login path.

### 2. Integrity monitoring (audit coverage)

**Status: good on role/status/packages; fee *amount change* is weak; confirm-fix is auditable in git, deploy unconfirmed. `[CODE]` / `[INFRA]`**

| Event | Audited? |
|-------|----------|
| Role grant / change / revoke | Yes. `staff.granted`, `staff.role_changed`, `staff.revoked` with previous/new role in `manage-user-role`. Incomplete session revoke: `staff.session_invalidate_incomplete`. |
| Member status (approve / suspend / close) | Yes. `application_approved` / `application_rejected` / `member_${status}` in `admin-members`. Suspend/close also `member.session_invalidate_incomplete` if sign-out fails. |
| Registration fee **confirm** | Yes. `registration_fee_confirmed` with `meta.amount` (the 25 Sep `.select('status, amount')` fix). That amount is the **stored row**, not a newly written amount. Confirm still does **not** UPDATE `registration_fees.amount`. |
| Registration fee **amount change** | Platform setting `registration_fee` goes through `admin-settings` → `updated_setting` with `resource_id = key`. Historical `registration_fees.amount` rows are **not** rewritten. Audit does **not** snapshot old/new numeric fee in meta. |
| Package / pricing | Yes. `created_package`, `updated_package`, `added_package_tier`, `replaced_package_tiers`, `updated_package_rules`, `retired_package`. Meta usually **does not** include old vs new prices. |

The 25 Sep fee SELECT fix is **in git** (`57d7a86`). Because CI Edge deploy failed, **live `admin-registration-fee` may still log `amount: null`.**

Audit log is append-only in SQL (no member UPDATE/DELETE).

### 3. Digital signatures / signed software updates

**Status: not applicable. `[ORG DECISION]` if you later add native apps.**

SPA + Vercel + Supabase Edge: no code-signing pipeline, no app-store artifacts. Do not force this on the current stack. Supply-chain integrity here is CI + lockfile + `npm audit --omit=dev --audit-level=high` (after `unpdf@1.8.1`, that audit is intended to be clean).

---

## Availability

### 1. Redundancy, backups, failover, restore test

**Status: documented defaults; restore drill still unchecked. `[INFRA]` / `[ORG DECISION]`**

No evidence in this pass that backup **plan** or a completed restore changed since `docs/PHASE14_DISASTER_RECOVERY.md` / `docs/BACKUP_RESTORE.md`:

- Postgres: Supabase automatic backups (plan-dependent). Docs still describe Free ≈ daily / 7-day vs Pro PITR ≈ minutes.
- Storage: tied to project backup; no separate app-level bucket export job in this repo.
- `docs/BACKUP_RESTORE.md` is an **operator checklist**. Boxes are intentionally unchecked. `docs/UX_GAP_AUDIT.md` says restore drills are unchecked by design.
- This session did **not** read the live Supabase plan or a restore log.

**`[ORG DECISION]`:** confirm live plan (Free vs Pro/PITR), run (or record) a restore drill, decide RPO/RTO owners. Nothing in git proves a restore has ever been tested.

### 2. DDoS + rate limiting

**Status: app rate limits on public auth/contact; AI ingest uses defaults and is not fail-closed. Platform DDoS is `[INFRA]`. `[CODE]`**

| Path | Limit in code | Fail-closed if RPC down? |
|------|----------------|--------------------------|
| `contact` | 5 / 10 min | Yes (`FAIL_CLOSED_IDENTIFIERS`) |
| `auth-register` | 5 / 5 min | Yes |
| `auth-login` | 10 / min | Yes |
| `auth-forgot-password` | 5 / 5 min | Yes |
| `member-assistant` (LLM) | **Not in `ENDPOINT_LIMITS`** → default **60 / min** | **No** |
| `admin-kb-ingest` | Same default 60 / min | **No** |

`DEPLOYMENT_CHECKLIST.md` / `LAUNCH_CHECKLIST.md` do **not** enumerate these AI limits. Phase 18’s function table is incomplete vs current identifiers.

DDoS: Vercel + Supabase edge. Optional Cloudflare WAF is a checklist, not verified on. No in-repo WAF rules are active.

---

## What changed since the last security write-up (23–24 Sep)

| Change | CIA impact | Live? |
|--------|------------|-------|
| KRA PIN PostgREST REVOKE migration in git | Confidentiality | Apply unconfirmed |
| Family ID uniqueness migration (fail closed on duplicates) | Integrity | Apply unconfirmed |
| Shared session invalidation on role change + suspend/close | Confidentiality / integrity | Edge deploy unconfirmed |
| `admin-registration-fee` now SELECTs `amount` for audit/notify | Integrity of audit text | Git yes; Edge deploy unconfirmed |
| CI gates Edge deploy on typecheck/lint/tests; ungated workflow removed | Integrity of release | Job **failed** — missing `SUPABASE_ACCESS_TOKEN` |
| `unpdf` 0.12.1 → 1.8.1 (intended) | Components / audit | In working tree / follow-up commit; not part of this report’s apply check |

---

## Highest-priority unresolved (no fix in this pass)

1. **`[INFRA]`** Apply or explicitly verify `20260924180000` on the live DB. Until then, assume KRA PIN is still selectable via PostgREST.
2. **`[INFRA]`** Apply `20260924181000` only after reporting (not auto-fixing) any duplicate active family IDs.
3. **`[INFRA]`** Put `SUPABASE_ACCESS_TOKEN` on the `production` GitHub environment (or repo secrets) so gated Edge deploys actually run — including session-revoke and fee-amount audit.
4. **`[ORG DECISION]`** Phishing-resistant MFA (passkeys) — currently **off**.
5. **`[ORG DECISION]`** Backup plan confirmation + a recorded restore drill.
)
