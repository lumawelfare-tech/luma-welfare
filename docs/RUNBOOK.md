# RUNBOOK — Incident response (Phase 4)

Concise production playbook. Longer detail: `PRODUCTION_RUNBOOK.md`, `ADMIN_OPERATIONS_GUIDE.md`.

**Payments / M-Pesa stay disabled.** Do not set `PAYMENTS_ENABLED=true`.

## Who to alert

| Severity | Contact |
|----------|---------|
| Site down / auth broken | On-call operator + project owner |
| Suspected data breach | Owner + legal/privacy contact; preserve logs |
| Supabase platform outage | Monitor [status.supabase.com](https://status.supabase.com); notify members if prolonged |
| Vercel outage | Monitor [vercel.com/status](https://www.vercel-status.com) |

## 1. Triage (5 minutes)

1. Hit public health: `GET {SUPABASE_URL}/functions/v1/health` → expect `200` + `"status":"healthy"|"degraded"`.
2. Detailed (ops only): same URL with `?detail=true` + header `x-cron-secret: $CRON_SECRET`.
3. Check Vercel → Deployments (frontend) and Supabase → Edge Functions → Logs.
4. Note `X-Request-ID` from failing API responses for log correlation.

## 2. Roll back a bad Vercel deploy

1. Vercel → Project → **Deployments**.
2. Open the last known-good production deployment.
3. **… → Promote to Production**.
4. Hard-refresh the site; re-check `/` and `/login`.
5. If preview env vars differ, confirm Production env still has `VITE_SUPABASE_*` and optional `VITE_SENTRY_DSN`.

## 3. Disable a broken Edge Function

Supabase has no “pause” toggle per function. Options:

1. **Redeploy previous source** from git:  
   `supabase functions deploy <name> --project-ref <ref>`
2. **Fail closed with a secret gate** (already used for cron/workers): ensure `CRON_SECRET` / callback secrets reject bad traffic.
3. **Emergency**: deploy a stub that returns `503` with `{ "message": "Temporarily unavailable" }` for that function only, then fix and redeploy.
4. Never delete production functions without a rollback plan.

## 4. Common incidents

| Symptom | First action |
|---------|----------------|
| 5xx on all APIs | Health + Supabase status; check service role / DB |
| Login fails for everyone | Auth logs; rate-limit buckets; OTP/email secrets |
| Admin 403 after deploy | RBAC / 2FA step-up secret; admin permissions |
| Claim docs 403 | Private bucket + signed URL path (Phase 2) |
| Sentry silent | Confirm `VITE_SENTRY_DSN` (FE) / `SENTRY_DSN` (Edge) set; no-op if unset is expected |

## 5. After action

- Write a short timeline (detect → contain → recover).
- Rotate secrets if credentials leaked (`SECRETS_ROTATION.md`).
- Open follow-up tickets for root cause.
