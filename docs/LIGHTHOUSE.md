# Lighthouse smoke (local)

Manual performance / a11y / SEO check against a production build preview. Not run in CI (Chrome + network cost); run before release candidates.

## Prerequisites

```bash
npm ci
npm run build -w frontend
npm run preview -w frontend
# preview listens on http://127.0.0.1:4173 by default
```

## Smoke command

From repo root (separate terminal while preview is up):

```bash
npm run lighthouse:smoke
```

This runs Lighthouse headless for Performance, Accessibility, Best Practices, and SEO, writing `lighthouse-report.json` at the repo root (gitignored).

## Interpreting results

| Category | Soft target |
|----------|-------------|
| Performance | ≥ 85 on desktop preview (mobile may be lower offline) |
| Accessibility | ≥ 90 |
| Best Practices | ≥ 90 |
| SEO | ≥ 90 |

Record scores in the PR / release notes. Do not invent homepage stats or stories to chase scores.

## Bundle evidence (Phase G)

Vendor / heavy chunks are split via `frontend/vite.config.ts` `manualChunks`:

| Chunk | Purpose |
|-------|---------|
| `vendor-react` | React, React DOM, React Router |
| `vendor-framer` | Framer Motion (eager Home/Layout motion) |
| `vendor-recharts` | Admin charts (lazy admin routes) |
| `vendor-jspdf` / `vendor-html2canvas` | PDF/export helpers |

After `npm run build -w frontend`, inspect `frontend/dist/assets/` sizes (gzip column in the Vite build summary). Re-record here when lockfile or major deps change:

| Artifact (2026-09-22 build) | Size | gzip |
|-----------------------------|------|------|
| `index-*.js` (app shell) | ~451 kB | ~115 kB |
| `vendor-react-*.js` | ~220 kB | ~70 kB |
| `vendor-framer-*.js` | ~135 kB | ~44 kB |
| `vendor-recharts-*.js` | ~407 kB | ~115 kB |
| `Dashboard-*.js` | ~51 kB | ~11 kB |
| `AdminDashboard-*.js` | ~48 kB | ~10 kB |

Framer is isolated from the main index chunk via `manualChunks` → `vendor-framer`. Lighthouse category scores remain manual (`npm run lighthouse:smoke` against preview).

## Notes

- Gallery / Media images use `loading="lazy"`; hero keeps `fetchPriority="high"`.
- PWA install prompt is UI-only (`beforeinstallprompt`); Lighthouse PWA checks still need HTTPS + valid manifest/icons in deployed env.
- Route-level `React.lazy` covers packages, news, gallery, media, and all member/admin pages (`App.tsx`).
