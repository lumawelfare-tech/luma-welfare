# SECRETS_ROTATION — Safe rotation order (Phase 4)

Never paste secret values into tickets, chat, or git. Confirm names with `supabase secrets list` / Vercel env UI only.

## Inventory (membership-only)

| Secret | Where | Notes |
|--------|-------|--------|
| Supabase **anon / publishable** key | Vercel `VITE_SUPABASE_PUBLISHABLE_KEY`, client | Public by design; still rotate if leaked in unexpected places |
| Supabase **service role** / secret key | Edge only (`SUPABASE_SERVICE_ROLE_KEY` / secret) | Highest impact — rotate carefully |
| `CRON_SECRET` | Edge + Vercel cron callers | Protects health `?detail=true`, workers |
| `OTP_HASH_SECRET` | Edge | Email OTP hashing |
| `RESEND_API_KEY`, `EMAIL_FROM` | Edge | Transactional email |
| `CORS_ALLOWED_ORIGIN` | Edge | Exact origins, comma-separated |
| `ADMIN_2FA_STEPUP_SECRET` | Edge | Admin step-up tokens |
| `MPESA_CALLBACK_SECRET` | Edge | Keep set even while payments off |
| `PAYMENTS_ENABLED` | Edge | Must stay `false` / unset |
| `SENTRY_DSN` | Edge (optional) | Server errors |
| `VITE_SENTRY_DSN` | Vercel / frontend build | Client errors (PII scrubbed) |

Daraja / M-Pesa consumer keys: leave unset while payments are disabled.

## Rotation order (recommended)

1. **Schedule a maintenance window** if rotating service role (brief Edge disruptions possible).
2. **Generate new secret** in the provider (Supabase / Resend / Sentry / random for cron).
3. **Set new value in Supabase Edge secrets** (`supabase secrets set KEY=...`) *before* revoking old where dual-read is impossible.
4. **Update Vercel** Production (+ Preview if used) for any `VITE_*` or cron caller secrets; **redeploy** frontend if Vite env changed.
5. **Redeploy Edge Functions** that cache env at boot (usually automatic on secret change for new isolates; force redeploy if unsure).
6. **Verify**:
   - `GET /functions/v1/health` → 200
   - Member login + one admin read
   - Cron job with new `CRON_SECRET` once
7. **Revoke / delete the old secret** in the provider.
8. **Audit**: check `audit_logs` and Sentry for anomalous auth after rotation.

## Service role specifically

1. Create new key in Supabase dashboard (if available) or rotate project API keys per Supabase docs.
2. Update Edge secret immediately.
3. Confirm no client bundle contains service role (`npm run build && npm run scan:bundle`).
4. Invalidate old key only after health + smoke pass.

## If a secret leaked

1. Rotate that secret first (this doc).
2. Review `audit_logs` for abuse window.
3. Force sign-out / revoke sessions if Auth keys compromised (Supabase Auth settings).
4. Follow `RUNBOOK.md` security incident section.
