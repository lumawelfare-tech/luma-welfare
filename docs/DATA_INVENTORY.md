# Personal data inventory (Phase 3)

**DRAFT — for engineering and legal review. Not a compliance certification.**  
Last updated: 2026-09-21 · Kenya Data Protection Act, 2019 (ODPC) context.

M-Pesa / Daraja payment fields exist in schema and code but **payments remain disabled**; treat payment PII as collected only if/when that path is enabled.

## Controllers / processors (as implemented)

| Role | System | Notes |
|------|--------|--------|
| Platform operator | Luma Welfare | Determines purposes of membership, claims, contributions |
| Processor | Supabase | Auth, Postgres, Storage, Edge Functions |
| Processor | Vercel | Static SPA hosting / cron routes |
| Processor | Resend (optional) | Transactional email when configured |
| Processor | Sentry (optional) | Error monitoring when DSN set; session replay masks text |

## Data categories

| Category | Fields (code/schema) | Storage | Access | Retention (as coded) |
|----------|----------------------|---------|--------|----------------------|
| Account / identity | `full_name`, `email`, `phone`, `id_number`, `alt_phone`, `membership_number`, `photo_url`, `date_of_birth`, `county`, `location`, `occupation`, `status` | `members` + Supabase Auth | Member (own); admins with `members` permission | Kept while account exists; soft-delete / closed status may retain financial history |
| Auth secrets | Password hash, session JWTs, email OTP hashes | Supabase Auth / `email_verifications` | Auth subsystem only | OTP rows short-lived; sessions until logout/expiry |
| Family / next of kin | Names and linked fields on `family_members` | `family_members` | Owning member; admins via member detail | While linked to active membership |
| Packages / qualification | Subscriptions, tiers, qualification state | `subscriptions`, `qualifications`, packages tables | Member (own); admins | Operational + financial record-keeping |
| Contributions | Amount, period, status, notes, links to payments | `contributions` | Member (own); admins with permission | Financial — treat as long retention |
| Claims + evidence | Claim text/status; files in private `claim-documents` bucket | `claims`, `claim_documents`, Storage | Member (own); claims admins; **signed URLs** for downloads | Evidence retained for claim decision / dispute history |
| Notifications | In-app messages, prefs, push endpoints | `notifications`, prefs, `push_subscriptions` | Member (own); system writers | Read notifications ~90d; unread ~180d (`cleanup_old_notifications`) |
| Audit | Actor, action, resource, meta | `audit_logs` | Admins | Non-financial ~2y cleanup; financial actions retained (`cleanup_old_audit_logs`) |
| Admin accounts | Admin profile, 2FA state, RBAC | `admins`, `roles`, `permissions` | Admins / service role | While staff account active |
| Public content | News, gallery, media, org contact/stats keys | Content tables + public `media` bucket | Public read (intentional) | Editorial lifecycle |
| Deletion requests | Reason, status, timestamps | `data_deletion_requests` | Requesting member (insert/read own); admins process | Until fulfilled / closed |
| Consent timestamps | `privacy_accepted_at`, `terms_accepted_at` | `members` | Stored at registration | Same as member record |

## Minimization notes (engineering)

| Item | Status |
|------|--------|
| Optional `id_number` at signup | Collect only if provided; not required for account creation |
| Admin list views | Phone / ID masked in list API responses; full values on audited detail view |
| Edge logs | `safeLog` / `redactSensitive` redact passwords, tokens, phones, ID numbers |
| Claim evidence | Private bucket + short-lived signed URLs (Phase 2) |
| Exports / reports | May contain full PII — admin-only, audited; prefer least privilege |

## Member rights (in-app)

| Right | Mechanism |
|-------|-----------|
| Access / export | Profile → “Download my data” → `GET member-profile?action=export` |
| Correct | Profile form → `PATCH member-profile` |
| Delete (request) | Profile → deletion request → `data_deletion_requests` (manual fulfilment; financial records may be retained) |

## Manual legal / regulatory checklist

- [ ] ODPC registration (data controller) if required for Luma Welfare’s scale/activities
- [ ] Appoint / designate DPO where required
- [ ] DPIA for high-risk processing (claims evidence, ID numbers, family data)
- [ ] Legal review of Privacy Policy and Terms (pages marked DRAFT)
- [ ] Confirm retention periods with counsel vs coded cleanup jobs
- [ ] Apply migration `20260921150000_phase3_data_protection.sql` on staging/prod
- [ ] Process deletion queue in admin ops (no auto-purge of financial history)
