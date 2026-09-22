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

## Notes

- Gallery / Media images use `loading="lazy"`; hero keeps `fetchPriority="high"`.
- PWA install prompt is UI-only (`beforeinstallprompt`); Lighthouse PWA checks still need HTTPS + valid manifest/icons in deployed env.
