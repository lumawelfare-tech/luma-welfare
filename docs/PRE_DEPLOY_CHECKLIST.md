# Luma Welfare — 5-point pre-deploy checklist

**Date:** 25 Sep 2026  
**Mode:** In-repo remediations applied in `20260925160000_pre_deploy_hardening.sql` plus Edge rate-limit / ingest caps. Live `supabase db push` and an OpenAI dashboard spend cap are still out of band.  
**Evidence basis:** SQL in `supabase/migrations/` plus `docs/legacy-backend-sql/schema.sql` (original catalog), Edge Function source, `frontend/src/`, `frontend/.env.example`, `.gitignore`, and a scan of the existing `frontend/dist` bundle.  
**Not a live `pg_class` / Storage probe.** Recent migrations on `origin/main` (KRA column revoke, family unique index) are **not confirmed applied** on the hosted project. CI does not run `supabase db push`.

Verdict key: **Confirmed** = control exists in git as specified · **Partial** = present but incomplete or bypassable · **Missing** = not present where it is needed.

---

## 1. Row Level Security is ON — everywhere it needs to be

**Verdict: ⚠️ Partial**

RLS is **enabled** on every `public` table found in the schema and later migrations. No table in this inventory has RLS left off. Several sensitive tables are **not FORCED**, so the table owner (and roles that bypass RLS unless FORCE is on) can still read/write without policies. A few `USING (true)` policies are broader than “public catalog only.” The anon/publishable key is therefore **not fully isolated** until FORCE gaps and the unpublished-gallery read are closed, and until the KRA revoke is confirmed live.

### How this inventory was built

- Original tables: `docs/legacy-backend-sql/schema.sql` (`ENABLE ROW LEVEL SECURITY` + policies).
- Later tables: `CREATE TABLE` + `ENABLE` / `FORCE` in `supabase/migrations/`.
- FORCE batch: `20260921140000_phase2_security_verification.sql` (loop over a fixed name list).
- Additional FORCE: per-table `ALTER TABLE … FORCE ROW LEVEL SECURITY` in later migrations.

### Tables with ENABLE + FORCE

| Table | FORCE source | Client-facing policies (names) |
|-------|----------------|--------------------------------|
| `members` | `20260921140000` | `members_read_own`, `members_update_own` |
| `family_members` | `20260921140000` | `family_read_own`, `family_write_own`, `family_update_own`, `family_delete_own` |
| `subscriptions` | `20260921140000` | `subscriptions_read_own`, `subscriptions_insert_own` (`status = 'pending'`) |
| `contributions` | `20260921140000` | `contributions_read_own`, `contributions_insert_own` (`status = 'Pending'`) |
| `payments` | `20260921140000` | `payments_read_own`, `payments_insert_own` (`status = 'Pending'`) |
| `claims` | `20260921140000` | `claims_read_own`, `claims_insert_own`, `claims_update_own_draft` |
| `claim_documents` | `20260921140000` | `claim_documents_read_own` (via owning claim) |
| `qualifications` | `20260921140000` | `qualifications_read_own` |
| `notifications` | `20260921140000` | `notifications_read_own` |
| `registration_fees` | `20260921140000` | `registration_fees_read_own`, `registration_fees_insert_own` |
| `push_subscriptions` | `20260921140000` | own-row (created in `20260831000000`) |
| `audit_logs` | `20260921140000` | no member policies (service-role / admin EF) |
| `admins` | `20260921140000` | no member policies |
| `roles` | `20260921140000` | no member policies |
| `permissions` | `20260921140000` | no member policies |
| `export_jobs` | `20260921140000` | `export_jobs_admin_read` / `_insert` / `_update` (active admin) |
| `financial_ledger` | `20260921140000` | no member policies (`ledger_read_own` dropped in `20260921220000`) |
| `payment_timeline` | `20260921140000` | no member policies |
| `reconciliation_exceptions` | `20260921140000` | no member policies |
| `webhook_events` | `20260921140000` | no member policies |
| `rate_limit_buckets` | `20260921140000` | no client policies (RPC `consume_rate_limit`) |
| `system_webhooks` | `20260921140000` | `Service role only` **TO `service_role` `USING (true)`** |
| `health_check_history` | `20260921140000` | `Service role only` **TO `service_role` `USING (true)`** |
| `data_deletion_requests` | `20260921150000` | `deletion_requests_select_own`, `deletion_requests_insert_own` |
| `member_legal_acceptances` | `20260921160000` | `legal_acceptances_select_own` (writes via service role) |
| `complaints` | `20260922180000` | `complaints_select_own`, `complaints_insert_own` |
| `community_support_records` | `20260922180000` | `community_support_admin_read` (active admin) |
| `kb_documents` | `20260922200000` | `kb_documents_public_metadata_read` (`status = 'approved' AND access_level = 'public'`), `kb_documents_member_metadata_read` (approved public+member) |
| `kb_chunks` | `20260922210000` | `kb_chunks_admin_read` (active admin SELECT only) |
| `contribution_instalments` | `20260923090000` | `instalments_select_own`, `instalments_insert_own_pending` |
| `member_documents` | `20260924120000` | `member_docs_select_own`, `member_docs_insert_own`, `member_docs_no_update` / `member_docs_no_delete` (`USING (false)`) |

`system_webhooks` / `health_check_history` `USING (true)` is **not** an open table: the policy is `TO service_role` only (`20260902100000`, `20260902000000`). Documented as intentional in `20260921140000`.

### Tables with ENABLE but no FORCE in git

These have RLS on for `anon` / `authenticated`. The **table owner** (and other bypass roles) is not forced through policies.

| Table | ENABLE source | Policies / notes |
|-------|---------------|------------------|
| `packages` | `docs/legacy-backend-sql/schema.sql` | `packages_public_read` — `USING (is_active = true)`. Not in the phase-2 FORCE list. |
| `package_tiers` | same | `package_tiers_public_read` — `USING (is_active = true)`. |
| `package_rules` | `20260919160000` ENABLE | `package_rules_public_read` — **`FOR SELECT USING (true)`**. Writes revoked from `anon`/`authenticated`. |
| `news_events` | `20260829200000` | `news_events_public_read` — `USING (is_published = true)` (not `true`). |
| `gallery_items` | `20260829200000` | `gallery_items_public_read` — **`FOR SELECT USING (true)`** — unpublished rows are readable. |
| `platform_settings` | `20260829200000` | Originally `USING (true)`; replaced in `20260918091409` by `USING (key IN ('org_contact', 'stats'))`. |
| `media_items` | `20260904000000` | `media_items_public_read` — `USING (is_published = true)`. Phase-2 comment that this is `USING (true)` is **stale**. |
| `notification_preferences` | `20260827200000` | `notification_pref_read_own` / `_upsert_own` / `_update_own`. |
| `email_verifications` | `20260906000000` | **No policies** (service-role only). OTP hashes. |
| `announcements` | `20260919220000` | `announcements_admin_read` (active admin). |
| `export_admin_quotas` | `20260901100000` | `export_quotas_admin_read` — any active admin can SELECT all quota rows. |
| `scheduled_reports` | `20260922140000` / phase13 | No member/anon policies. |
| `report_history` | same | No member/anon policies. |
| `saved_reports` | `20260922140000` | ENABLE only; no FORCE; no policies in that migration. |
| `payouts` | `20260918091409` | **ENABLE only. No policies in git.** Deny-by-default for `anon`/`authenticated`. |
| `open_questions` | `20260918091409` | **ENABLE only. No policies in git.** Same deny-by-default. |

### Tables with RLS disabled

**None found.** Every table above has an `ENABLE ROW LEVEL SECURITY` (legacy schema or a later migration). Phase 2 also re-`ENABLE`s its FORCE list if the relation exists.

### `USING (true)` that is effectively unrestricted (for that command + role)

| Policy | Table | Role | Assessment |
|--------|-------|------|------------|
| `package_rules_public_read` | `package_rules` | default (all) | Full catalog of qualification rules, including rows for inactive packages. Content, not member PII. |
| `gallery_items_public_read` | `gallery_items` | default | **All gallery rows**, including unpublished. Content leak, not PII. |
| `Service role only` | `system_webhooks`, `health_check_history` | `service_role` only | Acceptable; not a client bypass. |

`packages_public_read` / `package_tiers_public_read` / `news_events_public_read` / `media_items_public_read` / `platform_settings_public_read` / `kb_documents_*` are **not** `USING (true)`.

### Recent-session tables / columns

| Change | File | Lockdown in git |
|--------|------|-----------------|
| `members.kra_pin` added | `20260924120000_member_identity_documents.sql` | Column added as normal `text`. |
| KRA SELECT revoke | `20260924180000_revoke_members_kra_pin_select.sql` | `REVOKE SELECT (kra_pin) ON public.members FROM PUBLIC, anon, authenticated`. **No `REVOKE UPDATE (kra_pin)`.** `members_update_own` still allows a member JWT to UPDATE their row; `prevent_member_privileged_column_self_update` (`20260919160000`) does **not** list `kra_pin` or `status` (status is a separate trigger in `20260906000000`). |
| `family_members` phone / `beneficiary_status` | `20260924120000` | Own-row policies + FORCE already on the table. |
| Family ID unique | `20260924181000_family_members_id_number_unique.sql` | Integrity index, not an RLS change. **Stops** if live duplicate active `(member_id, id_number)` groups exist. |
| `registration_fees` | `20260825120000` + lockdown | FORCE. `registration_fees_insert_own` requires `status IN ('unpaid', 'pending') AND amount = 300` (`20260919160000`). `registration_fees_update_own` **dropped** (`20260825130000`). |
| `member_documents` | `20260924120000` | **ENABLE + FORCE.** SELECT/INSERT own + pending-only insert checks. UPDATE/DELETE `USING (false)` for `authenticated`. |

**Live apply:** KRA revoke and family unique index are in git; this pass could not query `supabase_migrations` on the hosted DB. If `20260924180000` is unapplied, `authenticated` can still `SELECT members.kra_pin` through PostgREST.

### What a fix would involve (not implemented)

1. `ALTER TABLE … FORCE ROW LEVEL SECURITY` on the ENABLE-only list above — especially `email_verifications`, `payouts`, `open_questions`, `export_admin_quotas`, `notification_preferences`, report tables, `packages` / `package_tiers` / `package_rules`.
2. Tighten `gallery_items_public_read` to `is_published = true` (same shape as news/media).
3. Optionally restrict `package_rules_public_read` to rules whose package is active.
4. `REVOKE UPDATE (kra_pin)` from `anon`/`authenticated`, and add `kra_pin` to `prevent_member_privileged_column_self_update`.
5. Confirm `20260924180000` and `20260924181000` are in the live `supabase_migrations` table (do not auto-merge family duplicates).
6. Add `saved_reports` policies (admin-own or service-role-only) if that table is used from PostgREST.

---

## 2. No keys in the frontend

**Verdict: ⚠️ Partial**

The SPA source and the **current `frontend/dist` bundle** do not contain a service-role key, Daraja secrets, or `CRON_SECRET` literals. The only Supabase key the browser is written to use is the publishable/anon key. That key is **only as safe as item 1**; item 1 is Partial, so this item cannot be fully Confirmed.

### Client source

| Location | What appears |
|----------|----------------|
| `frontend/src/lib/supabase.ts` | `import.meta.env.VITE_SUPABASE_URL`, `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` only. Throws if either is missing. |
| `frontend/src/lib/api.ts` | Same publishable key as `apikey` header to Edge Functions. |
| `frontend/src/lib/mpesaConfig.ts` | Public hostnames `https://sandbox.safaricom.co.ke` / `https://api.safaricom.co.ke` and `MPESA_ENV` **parsing**. Comment: “No secrets. Never used to call Daraja from the browser.” |
| `frontend/src/pages/admin/AdminSettings.tsx` | **UI labels** (`passkey`, `consumer_secret`, …) for an admin settings form. Not secret values. |
| `frontend/src/lib/__tests__/otp-secret.test.ts` | Fake `SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_should_never_be_otp_pepper'` in a unit test (not shipped in the production bundle). |

No `VITE_SUPABASE_SERVICE_ROLE_KEY` (or any `VITE_*` secret) is defined for the SPA.

Daraja secrets are Edge-only: `REQUIRED_MPESA_SECRET_NAMES` in `supabase/functions/shared/mpesa-config.ts` (`MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, plus consumer key / shortcode). Read via `Deno.env.get`, not `import.meta.env`.

### Built bundle (`frontend/dist`)

- `scripts/scan-client-bundle.ts` patterns: `service_role`, `SUPABASE_SERVICE_ROLE`, JWT payload hint `role":"service_role"`, `MPESA_CONSUMER_SECRET` / `MPESA_PASSKEY`, `CRON_SECRET` literal assignment.
- This pass: **`Bundle scan OK (77 files, no secret patterns)`**.
- Ripgrep of `frontend/dist` for those strings: **no matches**.
- CI job `🏗️ Build` in `.github/workflows/ci.yml` runs `npm run build` then `npm run scan:bundle` (line ~322). The scan is **not** a substitute for “RLS makes the anon key safe.”

### Server files under `frontend/api/` (not the SPA)

`frontend/api/cron/health-check.ts` and `frontend/api/cron/cleanup.ts` read `process.env.SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `CRON_SECRET`. These are **Vercel serverless** cron routes. They must not be copied into the Vite graph; the dist scan did not find those identifiers. Treat a future Vite import of these files as a leak.

### `.env` handling

| Check | Evidence |
|-------|----------|
| Real `.env` committed? | `git ls-files` for `.env*` returned **only** `frontend/.env.example`. |
| Root `.gitignore` | `.env`, `.env.*`, `!.env.example`, `frontend/.env`, then again `.env*`. |
| `frontend/.gitignore` | `.env`, `!.env.example`, and `.env*`. |
| Example file | `frontend/.env.example` — placeholders `https://your-project.supabase.co` and `sb_publishable_xxxxxxxxxxxx`. Line 17: “Never put service-role / secret keys in VITE_* variables.” Optional `VITE_SENTRY_DSN` is a **public** client DSN if enabled. |
| Root `.env.example` | **Missing** (not required if frontend example is the only Vite env). |

`git check-ignore` reports `.env`, `frontend/.env`, `.env.local`, `.env.production` as ignored.

### What a fix would involve (not implemented)

1. Close item 1 gaps so the public anon/publishable key cannot read unpublished gallery rows, owner-bypassed tables, or `kra_pin` via UPDATE/unapplied REVOKE.
2. Keep `scan:bundle` in CI (already there). Do not import `frontend/api/cron/*` from `frontend/src`.
3. Optional: add a root `.env.example` that lists Edge/Vercel secret **names only** (no values), so operators do not invent `VITE_` prefixes for Daraja / service-role.

---

## 3. Storage rules locked

**Verdict: ⚠️ Partial**

Private buckets used for member/KB/export files are `public = false` and, except claim evidence and admin export listing, have **no authenticated object policies** — bytes go through service-role Edge Functions and short-lived signed URLs (`PRIVATE_SIGNED_URL_TTL_SECONDS = 15 * 60` in `supabase/functions/shared/storage-signed.ts`). The **`media` bucket is public** by design. **`claim-documents` still allows authenticated INSERT/SELECT** on own claim paths, so bucket MIME/size is the only server check on a direct Storage upload (magic-byte checks live in the Edge Function).

### Buckets defined in git

| Bucket | `public` | Size / MIME (migration) | Object policies that remain |
|--------|----------|-------------------------|-----------------------------|
| `member-documents` | **false** | 10MB, `application/pdf` only (`20260924120000`) | **None for authenticated.** Comment: service-role upload + signed URLs only. |
| `kb-documents` | **false** | 20MB; jpeg/png/webp/pdf/doc/docx (`20260922200000`) | **None for authenticated.** `kb_documents_public_read` **dropped** in `20260923180000`. |
| `claim-documents` | **false** | 10MB; jpeg/png/webp/pdf/doc/docx (`20260825140000`) | **`claim_docs_insert_own`**, **`claim_docs_read_own`** still active. Path first segment = `claims.id`; must be `claims.member_id = auth.uid()`. `claim_docs_update_own` / `claim_docs_delete_own` **dropped** in `20260923180000`. |
| `exports` | **false** | 50MB; csv/pdf/xlsx/xls/json (`20260921140000`) | **`exports_admin_select_own`** — authenticated **active admin**, folder `[1] = auth.uid()`. Insert/delete own-folder policies dropped (`20260921220000`, re-asserted `20260923180000`). Public-read dropped. |
| `report-files` | **false** | 50MB; xlsx/xls/csv/pdf/json (`20260922140000`) | No public policies in that migration. `report_files_public_read` **dropped** in `20260923180000`. |
| `media` | **true** | no size/MIME on insert (`20260904000000`) | **`media_storage_public_read`**: `FOR SELECT USING (bucket_id = 'media')`. Authenticated INSERT/UPDATE/DELETE policies **dropped** (`20260919160000`, `20260923180000`). Writes are service-role. |

No `gallery` / `news` / `avatars` bucket `INSERT` appears in migrations; public images are expected to live in `media` or as stored URLs.

### Guessing a URL / listing

- **Private buckets without a SELECT policy** (`member-documents`, `kb-documents`, `report-files`): anon/authenticated cannot download by path and cannot list. Path guess (`/object/public/…`) fails because `public = false`.
- **`member-documents` object names** from `member-identity-docs`: `{user.id}/{identity\|tax\|family}/{uuid}.pdf`. UUID is not enumerable; listing is denied.
- **`claim-documents`**: path `{claim_uuid}/…`. Knowing another member’s claim UUID is not enough — policy requires that claim’s `member_id = auth.uid()`. Listing is scoped the same way. Residual: a member can read **their own** objects without a signed URL (direct Storage API).
- **`exports`**: an active admin JWT can SELECT objects under **their** `auth.uid()` folder without a signed URL.
- **`media`**: public bucket + `SELECT USING (bucket_id = 'media')`. Anyone who knows or lists an object path can fetch it. Paths are as guessable as the admin upload naming scheme. This is intentional for the public media library.

### Upload validation (type / size)

| Path | Server-side | Client-only? |
|------|-------------|--------------|
| `member-identity-docs` POST | `MAX_DOCUMENT_BYTES` = 5MB (`shared/upload-limits.ts`). `detectAllowedUpload` magic bytes; **PDF only**. Storage upload via `createAdminClient()`. | No — members have no object INSERT policy. |
| `member-claims` upload | Same 5MB + `detectAllowedUpload` + `looksLikeScriptableMarkup`. | **Bypass:** authenticated user can `storage.from('claim-documents').upload` if they own the claim id. Bucket allows **10MB** and MIME allowlist (including doc/docx) **without** magic-byte checks. |
| `admin-documents` (KB) | 5MB + `detectAllowedUpload` / markup check via service role into `kb-documents`. | Bucket allows **20MB** if something used the Storage API with service role and skipped the EF. No authenticated object policies. |
| `media` | Admin EF uses `detectAllowedPublicMedia` (images + mp4/webm). | Public **read**; writes service-role only after lockdown. |

`member_documents.size_bytes` CHECK is `<= 10485760` (10MB) while the Edge cap is 5MB — DB would accept a larger row if service role inserted it.

### What a fix would involve (not implemented)

1. Drop `claim_docs_insert_own` / `claim_docs_read_own` and serve claim files the same way as `member-documents` (service-role + signed URL only), **or** keep them and accept Storage-API bypass of magic bytes (then align bucket `file_size_limit` to 5MB).
2. Drop or further restrict `exports_admin_select_own` if signed URLs are the only intended download path.
3. Align `kb-documents` / `member-documents` bucket byte limits with `MAX_DOCUMENT_BYTES`.
4. Leave `media` public only if unpublished drafts never land in that bucket (pair with item 1 gallery unpublished-read fix).
5. Confirm live Storage policies match these migrations (dashboard drift is possible).

---

## 4. Spend cap + rate limiting

**Verdict: ⚠️ Partial** (public forms have limits; AI spend cap is **missing**; AI rate limits are the generic default and are **not** fail-closed)

Do not read this as full coverage. Rate limiting exists for registration / contact / login. There is **no provider budget, no in-repo OpenAI spend cap, and no dedicated tighter limit** on the two functions that call OpenAI.

### Public-facing forms (present)

Defined in `supabase/functions/shared/rate-limit.ts` `ENDPOINT_LIMITS` and used by the named functions. These identifiers **are** in `FAIL_CLOSED_IDENTIFIERS` (`shared/rate-limit-core.ts`): if `consume_rate_limit` is unavailable, the request gets **503**, not a per-isolate memory fallback.

| Identifier | Limit | Call site |
|------------|-------|-----------|
| `login` | 10 / 60s | `auth-login/index.ts` |
| `register` | 5 / 300s | `auth-register/index.ts` |
| `contact` | 5 / 600s | `contact/index.ts` |
| `auth-verify-email` | 10 / 60s | `auth-verify-email` |
| `auth-verify-email-resend` | 5 / 60s | same |
| `auth-forgot-password` | 5 / 300s | `auth-forgot-password` |

Subject: `user:<id>` if authenticated, else `cf-connecting-ip`, else shared `ip:untrusted` (no spoofable `X-Forwarded-For`).

### AI / metered external APIs

| Function | External API | In `ENDPOINT_LIMITS`? | In `FAIL_CLOSED_IDENTIFIERS`? | Effective limit |
|----------|--------------|----------------------|-------------------------------|-----------------|
| `member-assistant` | OpenAI embeddings + `gpt-4o-mini` chat when `OPENAI_API_KEY` is set | **No** | **No** | Default **60 / 60s**, memory fallback if RPC fails |
| `admin-kb-ingest` | `extractPdfText` (local unpdf) + optional `embedTexts` (OpenAI `text-embedding-3-small`, batch 32) | **No** | **No** | Default **60 / 60s**, memory fallback if RPC fails |

Gates that are **not** a spend cap:

- Kill switch: `AI_ASSISTANT_ENABLED === 'true'` (`shared/faq-knowledge.ts`).
- `member-assistant`: authenticated member, status `active` or `pending_approval`, query 3–500 chars.
- `admin-kb-ingest`: staff session + `documents.approve`; one POST rebuilds **all** FAQ + approved public/member KB chunks and may embed **every** chunk.
- Per-call `max_tokens: 700` on chat (`shared/kb-rag.ts`) — a single-response cap, not a monthly budget.

**Provider-level spend cap / budget alert:** **not in this repo.** No OpenAI organization project, usage limit, or alerting config is checked out. This pass cannot see the OpenAI dashboard. Treat spend cap as **Missing** unless someone confirms it out of band.

No other Edge Function calls Anthropic or a second LLM. `OPENAI_API_KEY` is the only paid model secret referenced.

### What a fix would involve (not implemented)

1. Add `member-assistant` and `admin-kb-ingest` to `ENDPOINT_LIMITS` with a **low** max (and to `FAIL_CLOSED_IDENTIFIERS`).
2. Cap ingest: max documents / max bytes / max embedding batches per run; refuse if `rows.length` exceeds a budget.
3. Set an OpenAI **usage limit / budget alert** on the project that owns `OPENAI_API_KEY` (out of band). Leave `AI_ASSISTANT_ENABLED` false until that is done.
4. Optional: per-day token counter in `rate_limit_buckets` or a dedicated table, fail closed when exceeded.

---

## 5. Model input = untrusted

**Verdict: ✅ Confirmed** (for “AI output does not drive queries, paths, admin actions, or raw HTML”)  
Residual (not a ❌): a malicious **approved** KB PDF can still steer the assistant’s **wording**. That is misleading-advice risk, not prompt-injection-to-action.

### Every user/AI input path

| Source | Enters AI / PDF pipe? | Where |
|--------|----------------------|--------|
| Registration fields | **No** | `auth-register` → `members` only. |
| Claim descriptions / evidence | **No** | `member-claims`. Assistant source explicitly does not `.from('claims')` / `.from('payments')`. |
| Member identity PDFs (`member-documents`) | **No** | Stored; never passed to `extractPdfText`. |
| Member assistant question | **Yes** | `sanitizeQuery`: strip C0 controls, trim, **max 500**. Then FAQ, `embedTexts([query])`, `search_kb_chunks(p_query)`, `generateRagAnswer(query, contexts)`. |
| Admin-approved KB PDF | **Yes** | `admin-kb-ingest` downloads from `kb-documents`, `extractPdfText` → `normalizeKbText` → `chunkKbText` → insert `kb_chunks.content`. Optional `embedTexts`. Only `status = 'approved'` and `access_level IN ('public','member')`. |
| FAQ / About | **Yes** (trusted staff constants) | `FAQ_KNOWLEDGE`, `ABOUT_BLURB` in `shared/faq-knowledge.ts`. |

`extractPdfText` (`shared/kb-rag.ts`): `unpdf@1.8.1` `getDocumentProxy` + `extractText({ mergePages: true })`, then `normalizeKbText` (strip NUL, collapse whitespace). **No `eval`, `Function`, `Deno.run`, or dynamic `import` of extracted text.** Text is stored as `kb_chunks.content` (`CHECK char_length <= 8000`).

### Where AI output goes

| Output | Sink | Dangerous use? |
|--------|------|----------------|
| `generateRagAnswer` string | JSON `{ answer, sources, mode }` from `member-assistant` | **No.** |
| Same string in UI | `frontend/src/pages/member/MemberAssistant.tsx`: `<p className="… whitespace-pre-wrap …">{answer}</p>` | **No `dangerouslySetInnerHTML`.** React text escape. |
| `formatGroundedExcerpt` | Same JSON/UI path when no key or chat fails | **No.** |
| Embeddings | `kb_chunks.embedding` or `match_kb_chunks` query vector | Numeric vectors; not executed. |
| Ingest warnings | JSON `warnings` + audit `meta` | **No** admin action automation. |

`search_kb_chunks` / `match_kb_chunks` are `SECURITY DEFINER` with `REVOKE ALL … FROM PUBLIC` and `GRANT EXECUTE … TO service_role` only (`20260922210000`, `20260922280000`). The LLM string is **not** concatenated into those calls. `p_query` is the **member’s** sanitized question (trigram / `ILIKE`), bound as a `text` variable — not LLM output.

`toSafeContexts` drops any chunk whose `access_level` is not `public` or `member`.

### What a fix would involve (not implemented)

Only if you want defense in depth beyond “no action from the model”:

1. Treat approved PDF text as hostile in the chat prompt (delimiter / “retrieved text may be untrusted” instruction) — wording only; it does not create a spend cap.
2. Do not ingest member-uploaded identity/claim PDFs into `kb_chunks` (already true; keep it that way).
3. Optionally strip HTML-looking tokens from `answer` before respond, even though the UI already escapes.

---

## Summary

| # | Item | Verdict |
|---|------|---------|
| 1 | RLS on everywhere it needs to be | ⚠️ Partial — enabled everywhere found; FORCE incomplete; `gallery_items` + `package_rules` `USING (true)`; KRA UPDATE / live REVOKE gaps |
| 2 | No keys in the frontend | ⚠️ Partial — source + `frontend/dist` clean; anon key safety blocked by item 1 |
| 3 | Storage rules locked | ⚠️ Partial — private identity/KB/report buckets locked; `media` public; claim-documents still has authenticated insert/read |
| 4 | Spend cap + rate limiting | ⚠️ Partial — public forms limited and fail-closed; **no AI spend cap**; assistant/ingest use default 60/min and are not fail-closed |
| 5 | Model input = untrusted | ✅ Confirmed — PDF text is data; model output is displayed text only |

Nothing in this document was changed in application code. Wait for an explicit approval before implementing any of the “what a fix would involve” lists.
