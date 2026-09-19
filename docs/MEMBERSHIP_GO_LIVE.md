# Membership-only production configuration

External steps required after merging `cursor/phase1-security-containment-7c08`.
Do **not** set `PAYMENTS_ENABLED=true`.

## 1. Apply database migrations

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

Verify with `scripts/verify-security-lockdown.sql` in the Supabase SQL editor.
Expect migration `20260919160000_production_security_lockdown` present, `package_rules.relrowsecurity = true`, and cleanup/export RPCs not executable by `anon`/`authenticated`.

Status: **NEEDS PRODUCTION VERIFICATION**

## 2. Supabase Edge Function secrets

Dashboard → Project Settings → Edge Functions → Secrets (or `supabase secrets set`):

| Secret | Required for membership launch | Fail-closed if missing |
|--------|--------------------------------|------------------------|
| `CRON_SECRET` | Yes (cron + health detail + workers) | Yes |
| `OTP_HASH_SECRET` | Yes (email OTP) | Falls back to service role (avoid) |
| `RESEND_API_KEY` | Yes (email) | Yes |
| `EMAIL_FROM` | Yes | Depends |
| `CORS_ALLOWED_ORIGIN` | Yes (prod domain(s), comma-separated OK) | Defaults to vercel.app |
| `ADMIN_2FA_STEPUP_SECRET` | Recommended | Falls back to OTP/service role |
| `MPESA_CALLBACK_SECRET` | Yes even while payments off | Callback rejects (503) |
| `PAYMENTS_ENABLED` | Must be `false` / unset | Initiate blocked |
| M-Pesa Daraja keys | No (keep unset) | N/A |

Verify without printing values:

```bash
supabase secrets list
# Confirm names exist; never dump values into logs/tickets.
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer wrong" \
  "$SUPABASE_URL/functions/v1/health?detail=true"
# Expect 401
```

## 3. Vercel

**Root Directory:** Prefer monorepo `.` **or** keep `frontend/` (both supported after this change).

With Root Directory = `frontend/`:

- Uses `frontend/vercel.json` (crons + CSP + api rewrite exclusion)
- Deploys `frontend/api/cron/*`

Environment variables on the Vercel project:

| Variable | Notes |
|----------|--------|
| `CRON_SECRET` | Same value as Supabase `CRON_SECRET` |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Service role for cron RPCs |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend build |
| `VITE_SENTRY_DSN` | Optional but recommended |
| `RESEND_API_KEY` / `HEALTH_ALERT_EMAIL` | Optional health alerts |

Verify cron:

1. Vercel → Project → Settings → Cron Jobs — both schedules visible
2. Trigger once; logs show auth success
3. Unauthorized call without Bearer returns 401

## 4. Smoke tests (membership-only)

- [ ] Register → OTP verify → pending/active path
- [ ] Login / logout
- [ ] Suspended member blocked
- [ ] Member dashboard / packages (no live STK)
- [ ] Admin login + 2FA step-up + member approve
- [ ] Claims: ineligible blocked; eligible draft/submit
- [ ] Export requires admin
- [ ] `PAYMENTS_ENABLED` still false; initiate returns payments disabled
- [ ] CSP response header: `script-src 'self'` without `unsafe-inline`
