# Hono → Edge Function coverage (historical)

The Node/Hono API has been **removed**. This table is kept as a migration audit
trail only. Current architecture: see [ARCHITECTURE.md](./ARCHITECTURE.md).

| Former Hono route | Edge Function | Frontend caller | Status |
|---|---|---|---|
| GET /health | health | cron / monitoring | Covered |
| GET /api/packages, settings, news, gallery | public-data | `api('packages'|'settings'|…)` | Covered |
| GET/PATCH /api/member/* | member-dashboard, member-profile, member-family, member-subscriptions, member-registration-fee, member-contributions, member-claims, member-receipts, member-notifications, member-notification-prefs, member-push-subscriptions | `api('/member/…')` | Covered |
| /api/contributions | member-contributions | `api('/contributions')` | Covered |
| /api/payments/* | payments-initiate, payments-list, payments-callback | `api('/payments/…')` | Covered (PAYMENTS_ENABLED=false) |
| /api/admin/dashboard | admin-dashboard | yes | Covered |
| /api/admin/members* | admin-members | yes | Covered |
| /api/admin/packages* | admin-packages | yes | Covered |
| /api/admin/subscriptions* | admin-subscriptions | yes | Covered |
| POST /api/admin/subscriptions/:id/evaluate | admin-subscriptions `action=evaluate` | path mapped; UI optional | Ported |
| /api/admin/contributions* | admin-contributions | yes | Covered |
| /api/admin/claims* | admin-claims | yes | Covered |
| /api/admin/registration-fee* | admin-registration-fee | yes | Covered |
| /api/admin/open-questions*, audit-logs, settings | admin-settings | yes | Covered |
| Auth (register/login/me/…) | auth-* Edge Functions | yes | Covered |
| Admin CMS (news/gallery/media/reports/…) | admin-news, admin-gallery, admin-media, admin-reports, … | yes | Covered |
| POST /contact | contact | `api('/contact')` | Covered |

Former Hono helpers relocated to Edge `shared/*` (CORS, RBAC, audit, qualify).
CI enforces no leftover Hono/`VITE_API_URL`/`localhost:3001` frontend references via
`npm run guard:backend`.
