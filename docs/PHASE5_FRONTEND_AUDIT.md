# LUMA WELFARE — PHASE 5: FRONTEND PERFORMANCE AUDIT

## Bundle Analysis

### Production Build Output (from `npm run build`)

| Chunk                          | Size      | Gzipped   | Type           |
|--------------------------------|----------:|----------:|----------------|
| index-BKsKDIhQ.js             | 375.28 KB |  90.34 KB | Main bundle    |
| vendor-jspdf-42qPBona.js      | 430.90 KB | 139.73 KB | PDF generation |
| vendor-recharts-D60a3j6p.js   | 407.15 KB | 115.29 KB | Charts         |
| vendor-react-Csgqb1cr.js      | 227.79 KB |  72.94 KB | React          |
| index.es-3APqC-tZ.js          | 151.44 KB |  48.92 KB | Shared utils   |
| purify.es-ChwZkWde.js         |  26.81 KB |  10.65 KB | DOMPurify      |
| AdminScheduledReports          |  39.92 KB |   8.52 KB | Lazy chunk     |
| AdminDashboard                 |  40.68 KB |   8.94 KB | Lazy chunk     |
| AdminClaims                    |  19.22 KB |   4.30 KB | Lazy chunk     |
| AdminReports                   |  22.62 KB |   5.97 KB | Lazy chunk     |

**Total JS transferred (first load):** ~550 KB gzipped
**Total JS transferred (full app):** ~600 KB gzipped (lazy chunks loaded on demand)

### Key Observations

1. **jspdf is the largest vendor dependency** (430 KB / 140 KB gzipped). It's used for PDF receipt generation on the member receipts page. Consider:
   - Lazy-loading jspdf only when the receipts page is accessed
   - Using server-side PDF generation instead (export worker already exists)

2. **recharts is the second largest** (407 KB / 115 KB gzipped). Used on admin dashboard and reports. Already lazy-loaded.

3. **Main bundle includes shared utilities** that are needed on every page. This is acceptable.

4. **All admin pages are lazy-loaded** via React Router. Good pattern — admin bundle doesn't load for member users.

## API Waterfall Analysis

### Member Dashboard Load Sequence

```
Page Load
├── auth/me (session validation)         ~200ms
├── member/dashboard (dashboard data)    ~300ms
│   ├── RPC: build_member_dashboard      ~150ms
│   └── registration_fees check          ~50ms
└── member/notifications?unread=true     ~100ms (optional, non-blocking)

Total: ~500ms (2 sequential requests)
```

**Assessment:** ✅ Good. Only 2 sequential requests. Dashboard RPC returns all data in one call.

### Admin Dashboard Load Sequence

```
Page Load
├── auth/me (session validation)         ~200ms
└── admin/dashboard (all dashboard data) ~400ms
    ├── RPC: get_admin_dashboard_summary ~50ms
    ├── RPC: get_admin_contributions_by_month ~30ms
    ├── RPC: get_admin_package_breakdown ~20ms
    ├── RPC: get_admin_claims_by_status  ~20ms
    ├── RPC: get_admin_report_analytics  ~30ms
    └── platform_settings               ~20ms

Total: ~600ms (2 sequential requests, server-side parallelism)
```

**Assessment:** ✅ Good. All heavy queries run server-side in parallel via Edge Function.

### Admin Members Search

```
Search Input
├── admin/members?q=search&page=1       ~250ms
│   ├── COUNT(*) with trigram index     ~50ms
│   └── SELECT with trigram index       ~100ms
└── (debounced 300ms)

Total: ~350ms (debounced, indexed)
```

**Assessment:** ✅ Good. pg_trgm indexes handle search efficiently.

## Duplicate Request Analysis

### Identified Patterns

1. **Member notifications bell** — Polls `member-notifications?unread=true` on interval
   - Current: Every 30 seconds
   - Recommendation: Increase to 60 seconds, or use Websocket/SSE if real-time is needed

2. **Admin notification bell** — Polls `admin-notifications?unread=true` on interval
   - Current: Every 30 seconds
   - Recommendation: Same as above

3. **No duplicate requests detected** — Each page makes one request per data type.

## Large Response Analysis

### Endpoints Returning > 10KB

| Endpoint                | Est. Size | Notes                              |
|------------------------|----------:|-------------------------------------|
| admin/dashboard        | ~5-15 KB  | Depends on date range and data      |
| admin/members?page=1   | ~10 KB    | 50 members × ~200 bytes each       |
| member/dashboard       | ~2-5 KB   | Subscription cards                  |
| member/contributions   | ~5-20 KB  | Depends on history length           |

**Assessment:** ✅ Acceptable. No endpoints return massive payloads.

## Mobile Performance Considerations

1. **Bundle size is moderate** — ~550 KB gzipped first load. Acceptable for 3G/4G.
2. **All images are lazy-loaded** via Supabase Storage CDN.
3. **No client-side rendering of large datasets** — all aggregation is server-side.
4. **Pagination is implemented** on all list pages (50 items per page).

## Recommendations

### P1 (Should Do)
1. **Lazy-load jspdf** — Only import when PDF generation is triggered
2. **Reduce notification polling interval** — 60s instead of 30s
3. **Add Service Worker** for offline caching of static assets

### P2 (Nice to Have)
4. **Implement stale-while-revalidate** for dashboard data
5. **Add preload hints** for critical CSS/JS on auth pages
6. **Consider server-side rendering** for public pages (SEO + faster first paint)

### P3 (Future)
7. **Migrate PDF generation to server-side** (eliminate 430 KB client bundle)
8. **Implement Websocket** for real-time notifications
