# LAUNCH_CHECKLIST — Membership go-live (Phase 4)

Use before real members onboard. **Do not enable M-Pesa** (`PAYMENTS_ENABLED` must stay false/unset).

## Pre-flight (repo / CI)

- [ ] `main` green: lint, typecheck, unit tests, build, security audit
- [ ] Phase 2 migration applied (`FORCE RLS`, private `exports`)
- [ ] Phase 3 migration applied (consent columns + `data_deletion_requests`)
- [ ] `npm run scan:bundle` clean after production build

## Supabase

- [ ] Migrations pushed to production project
- [ ] Edge secrets set (see `MEMBERSHIP_GO_LIVE.md` / `SECRETS_ROTATION.md`)
- [ ] `CORS_ALLOWED_ORIGIN` includes production origin only (exact hosts)
- [ ] Functions deployed (`supabase functions deploy` or CI path you use)
- [ ] `GET /functions/v1/health` → 200
- [ ] Optional: `?detail=true` with `CRON_SECRET` → database/auth/storage checks

## Vercel

- [ ] Production env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] Optional: `VITE_SENTRY_DSN` (client); Edge `SENTRY_DSN` separately in Supabase
- [ ] CSP headers present (`vercel.json` / `frontend/vercel.json`)
- [ ] Cron routes authenticated with `CRON_SECRET` where applicable

## Product smoke (membership-only)

- [ ] Register with Privacy + Terms consent → verify email OTP
- [ ] Login → dashboard loads own data only
- [ ] Profile: edit fields; **Download my data** works
- [ ] Family / claims / contributions (non-payment paths) as designed
- [ ] Admin: list shows **masked** phone; detail view audited
- [ ] Member cannot open `/admin/*`
- [ ] Payment initiate remains blocked / unavailable

## Privacy / legal hangings

- [ ] Privacy & Terms reviewed by counsel (pages still marked DRAFT until then)
- [ ] ODPC / DPO / DPIA items from `DATA_INVENTORY.md` tracked
- [ ] Deletion-request ops owner assigned

## Observability

- [ ] Uptime monitor on `/functions/v1/health` (see `RUNBOOK.md` §1)
- [ ] Sentry project receiving a test event (or consciously left unset = no-op)
- [ ] Know how to roll back Vercel and redeploy one Edge Function

## Sign-off

| Role | Name | Date |
|------|------|------|
| Engineering | | |
| Ops / owner | | |
| Privacy/legal (if required) | | |
