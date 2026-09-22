# Luma Welfare — UX Gap Audit (Phase 0)

**Date:** 2026-09-22  
**Scope:** Gap assessment only — **no product code changes** in this phase.  
**Visual identity constraint:** Keep existing brand greens (`luma-*`), glass surfaces, Inter/system stack, and working page layouts unless a later phase finds a specific defect (and layout changes require explicit approval).  
**Status key:** `DONE` | `PARTIAL` | `MISSING`

---

## Summary scorecard

| # | Area | Status |
|---|------|--------|
| 1 | Design tokens | PARTIAL |
| 2 | Shared UI kit | PARTIAL |
| 3 | Motion system | PARTIAL |
| 4 | Homepage structure | PARTIAL |
| 5 | Trust & transparency | PARTIAL |
| 6 | Loading / empty / error | PARTIAL |
| 7 | Mobile experience | PARTIAL |
| 8 | Accessibility | PARTIAL |
| 9 | Performance | PARTIAL |
| 10 | Observability | PARTIAL |
| 11 | Receipts | PARTIAL |
| 12 | Admin search / charts | DONE |
| 13 | Footer / SEO / social | DONE (brand asset gap) |
| 14 | PWA | PARTIAL |
| 15 | Live security verification in CI | PARTIAL |

**Overall polish estimate:** ~7.5/10 — strong foundation (central motion tokens, SEO plumbing, admin search/charts, skeletons, RLS/E2E wiring); gaps are shared Button/Input adoption, state coverage, mobile member chrome, receipt share/masking, PWA install/icons, and verified CI secrets / Lighthouse.

_Sources: primary repo inspection plus cross-checks from [Audit design tokens and UI kit](8e44fb31-27f1-46c2-b944-49554041de64), [Audit homepage mobile a11y perf](c0be674d-71b3-4b04-aca0-0a30c385b996), and [Audit receipts SEO PWA security](c06b8437-8ebd-45aa-b43c-bdb024e69e8e)._

---

## 1. Design tokens

**Status: PARTIAL**

**Evidence**
- Brand palette and semantics live in `frontend/src/index.css` `@theme`: `--color-luma-50…950`, `--color-brand-blue*`, gold, welfare muted, `--color-status-*`, `--radius-card` / `--radius-control`, `--shadow-card`, glass tokens, motion CSS vars.
- Font: `--font-sans: 'Inter', …` with `font-display: swap` local `@font-face`.
- Motion tokens synced with `frontend/src/lib/lumaMotion.ts` (`150/200/300/450/600/1000ms`).

**Gaps**
- No documented full spacing scale (4/8/12/16/24/32/48/64) as named tokens — pages use ad-hoc Tailwind (`p-7`, `gap-5`, `py-16`).
- `--radius-card` / `--radius-control` / `--shadow-card` are **defined but barely referenced** in TSX; glass helpers hard-code rem radii.
- `--color-status-*` unused by `StatusBadge` (still Tailwind emerald/amber/red).
- Hard-coded hex still in CSS body background and several files (`#f3f8f5`, `#1f2937`; ~80+ `#…` matches). Charts/admin often use **`#6D9B3A`**, not `luma-700` `#006B2E`.
- `manifest.json` `theme_color` `#6D9B3A` ≠ primary `luma-700`.
- Arbitrary utilities (`min-h-[44px]`, etc.) ~200+ hits — many intentional touch targets.
- No `docs/DESIGN_SYSTEM.md`.

**Note:** Extract tokens **from current styles** in Phase A — do not invent a new palette.

---

## 2. Shared UI kit

**Status: PARTIAL**

| Component | Status | Evidence |
|-----------|--------|----------|
| Button | PARTIAL | CSS `.luma-btn` / `.luma-btn-primary` exist; **no** `Button.tsx`; used sparsely (`HomeHero`, Dashboard); most screens raw classes |
| Input | PARTIAL | `fieldClass` in `PageHero.tsx`; glass-input CSS; admin forms often inline borders; no shared error/label API |
| Card | PARTIAL | `.glass-card` / `.glass-panel` / `.luma-card-interactive`; no `Card.tsx` variant API |
| Badge | PARTIAL | `StatusBadge.tsx` (~10 importers); many hand-rolled pills remain |
| Table | PARTIAL | `DataTable.tsx` (admin); `MobileCardTable.tsx` (**only** member Contributions) |
| Modal / Dialog | PARTIAL | `ConfirmDialog`, `ExportDialog`, ad-hoc overlays (e.g. pay UI); no generic Modal |
| Toast | DONE | `Toast.tsx` + `lumaToast` |
| Skeleton | PARTIAL | Component set good; many screens still `animate-pulse` / `"Loading…"` |
| EmptyState | PARTIAL | ~10 pages; Family/Notifications/most admin lists custom |
| ErrorState | PARTIAL | Retry API exists; **only** Claims, Contributions, JoinPackages |

**Note:** Highest leverage = React `Button`/`Input` wrapping existing `.luma-btn`/`fieldClass` + migrate ErrorState/EmptyState/Skeleton onto remaining data views.

---

## 3. Motion system

**Status: PARTIAL** (central system strong; adoption uneven — not a rebuild)

**Evidence**
- Central `frontend/src/lib/lumaMotion.ts` + CSS `--motion-*` / `--luma-ease-out` (150/200/300/450/600/1000ms).
- Primitives: `MotionSection`, `MotionReveal`, `MotionPage`, `MotionFade`, `MotionList`, `MotionItem`, `MotionImage`, `MotionCard`.
- `PageTransition` on public `Layout` + `MemberLayout` — **not** on `AdminLayout`.
- StatBar count-up, ProgressBar, Toast/ConfirmDialog Framer presets; reduced-motion CSS + `useReducedMotion`.
- Unit tests: `lumaMotion.test.ts`.

**Gaps**
- Framer consumers concentrated on marketing/public; admin mostly static.
- Widespread `animate-spin` / `animate-pulse` (~28 files) outside luma durations.
- Buttons often `transition-colors` without `duration-[var(--motion-*)]`.
- Framer Motion already installed — **reuse; do not add another animation library**.

**Phase B scope:** cleanup/adoption only, not a new motion architecture.

---

## 4. Homepage structure

**Status: PARTIAL**

**Evidence (`Home.tsx`, `HomeHero.tsx`)**
| Section | Present? |
|---------|----------|
| Hero (what / who / CTA) | Yes — brand, headline, copy, Join + packages |
| Stats | Yes — `StatBar` (confirmed numbers only; nulls omitted) |
| Programs / packages | Yes — “What We Offer” grid |
| How it works | Yes — four steps |
| Why Luma | Yes |
| Trust & security | Yes |
| FAQ teaser | Yes |
| Closing CTA | Yes |
| Stories | **No dedicated homepage stories block** (News/Gallery are separate routes) |

**Gaps**
- Hero is strong; trust copy is capability-based (good). Split 2-column hero (not full-bleed) — keep unless approved to change layout.
- Home “What We Offer” shows **6** packages while copy cites **12** — consistency gap (link to `/packages` for full set).
- No “stories” section on home — omit or empty-state only if CMS content exists (do not invent).
- Keep existing sections; Phase E may only refine gaps, not remove working blocks.

---

## 5. Trust and transparency

**Status: PARTIAL**

**Evidence**
- Home trust section: account security, audit trail, data protection, verified claims (`trustFeatures` in `Home.tsx`) — grounded in real product capabilities.
- FAQ/About reinforce encryption, audit logs, Privacy Policy.
- Receipts mentioned in FAQ; not heavily linked from trust cards.

**Gaps**
- Trust section does not explicitly call out **contribution receipts** or **role-based staff access** as user-facing bullets (capabilities exist in product).
- Avoid absolute claims (“100% secure”) — current copy is appropriately cautious.

---

## 6. Loading / empty / error states

**Status: PARTIAL**

**Evidence**
- Skeletons: packages, news, gallery, media, admin dashboard chunks, StatBar, member receipts list.
- EmptyState on Packages, News, Gallery, Media, Claims, Contributions, JoinPackages, Receipts, several admin CMS pages.
- ErrorState + Retry on member Claims / Contributions / JoinPackages.
- Toasts for many failures; `ErrorBoundary` present.

**Gaps**
- Widespread `animate-pulse` / `"Loading…"` vs layout-matched skeletons (Dashboard, Notifications, Family, many admin lists).
- Admin data views rarely use `ErrorState` (raw toast / inline text common).
- Widespread `e.message` / `ApiError.message` into banners — needs user-safe mapping + Sentry for real errors.
- Not every data view has Retry.

---

## 7. Mobile experience

**Status: PARTIAL**

**Evidence**
- `min-h-11` / 44px patterns in layouts and ErrorState.
- `pt-safe` / `safe-area-inset` on public + member headers (`Layout.tsx`, `MemberLayout.tsx`).
- Member: collapsible drawer nav (not bottom tabs).
- `MobileCardTable` used on member Contributions; admin relies on `DataTable` (desktop-oriented).
- Public nav has mobile menu with focus trap.

**Gaps**
- **No member bottom tab bar** (Home / Contributions / Claims / Profile).
- Admin tables not systematically card-ified at ≤640px.
- Member dashboard still dense “desktop-ish” in places.
- Horizontal overflow risks need QA sweep at 320–414px (NOT VERIFIED this pass).

---

## 8. Accessibility

**Status: PARTIAL**

**Evidence**
- Skip link in `Layout.tsx`.
- `useFocusTrap` on mobile drawers; ConfirmDialog Escape + focus.
- `aria-expanded`, `role="alert"`, `aria-modal` on key components.
- Reduced motion support for motion system.

**Gaps**
- No automated axe Playwright suite found.
- `ConfirmDialog` has Escape + initial focus but **no `useFocusTrap`** (Tab can leave dialog).
- Form error ↔ `aria-describedby` / `aria-invalid` inconsistent across auth and admin forms.
- Soft text (`text-white/70`, `text-gray-400` on glass) — WCAG AA contrast NOT VERIFIED.
- Heading hierarchy / `aria-controls` on home FAQ accordion incomplete.

---

## 9. Performance

**Status: PARTIAL**

**Evidence**
- Route-level `React.lazy` for packages, news, gallery, media, all member + admin pages (`App.tsx`).
- Framer Motion / Recharts / jsPDF code-split into vendor chunks.
- StatBar / images: MotionImage + lazy patterns on media pages.
- Font: local Inter + `font-display: swap`.

**Build-size snapshot (local `frontend/dist`, may be stale vs latest lockfile)**
- Assets total ≈ **3.0 MB** uncompressed hashed files.
- Largest: main index ~432 KB, jspdf ~421 KB, (stale) xlsx chunk ~414 KB, recharts ~398 KB, react ~223 KB.
- **Lighthouse scores: NOT VERIFIED** in this audit (no Lighthouse run this phase).

**Gaps**
- Almost no `loading="lazy"` on images (hero correctly uses `fetchPriority="high"`).
- Heavy admin PDF/chart bundles; keep lazy imports.
- Rebuild dist after xlsx removal to confirm stale chunk gone.
- Lighthouse before/after still required in Phase I.

---

## 10. Observability

**Status: PARTIAL**

**Evidence**
- Frontend Sentry + PII scrubbing: `frontend/src/lib/sentry.ts` (+ tests).
- Edge Sentry/logging: `supabase/functions/shared/sentry.ts`, `logging.ts`, `observability.ts` (`withTiming`).
- Health: `health` Edge Function, cron health-check, `AdminHealthCheck.tsx`, `health_check_history`.
- Admin monitoring: `admin-monitoring` SLO / security status consumption.

**Gaps**
- `get_security_status()` / monitoring query `auth_failed`, but **no Edge writer of `auth_failed`** found under `supabase/functions/` — failed-auth security events incomplete.
- Alerting runbooks for error / auth-failure spikes may be incomplete.
- Pair ErrorState migration with scrubbed Sentry capture on every user-facing catch.

---

## 11. Receipts

**Status: PARTIAL**

**Evidence**
- `ReceiptsStatements.tsx` + `member-receipts` Edge Function; numbers `RF-…` / `CTR-…`.
- View + “Download PDF” (HTML blob + `window.open`, not jsPDF binary).

**Gaps**
- **Share** missing (`navigator.share` absent).
- **Masking missing** — full email/phone in modal/PDF; `frontend/src/lib/pii.ts` not applied on receipts.
- Polish PDF branding optional; numbering backend is DONE.

---

## 12. Admin search / filters / dashboard charts

**Status: DONE**

**Evidence**
- Members / Contributions / Claims: `FilterBar` + `SearchInput` + debounced `q`.
- `DashboardCharts.tsx` (pie / funnel / area / bar) on `AdminDashboard`.
- Shared `FilterBar.tsx`, `SearchInput.tsx`.

**Optional polish (not blocking DONE)**
- Chart empty/skeleton consistency; keep at ≤4 charts; confirm all filters stay server-side + injection-safe.

---

## 13. Footer / SEO / social

**Status: DONE** (content asset gap noted)

**Evidence**
- `SiteFooter` + tests; `useHead` / `seo.ts` (title, description, canonical, OG, Twitter, noindex, breadcrumbs).
- `OrganizationJsonLd`; sitemap/robots generators; prerender; `og-default.png` present.

**Gaps (content, not plumbing)**
- Referenced `luma-logo.jpeg` / `luma-icon.jpeg` may be absent under `public/brand/` — fix assets in Phase I/J, not SEO rewrite.
- Live WhatsApp/Facebook preview QA NOT VERIFIED.

---

## 14. PWA

**Status: PARTIAL**

**Evidence**
- Manifest + `sw.js` + `pwa.ts` + `SWUpdateBanner`.
- Icons intended via `vite-plugin-pwa-icons.ts` at build; financial paths `networkOnly` in SW.

**Gaps**
- **Install prompt MISSING** (no `beforeinstallprompt` UI).
- Manifest `theme_color` / `start_url` review; ensure icon source assets exist for CI builds.
- Never imply offline payment success (policy OK in SW comments; needs QA).

---

## 15. Live security verification (CI)

**Status: PARTIAL**

**Evidence (`.github/workflows/ci.yml`)**
- `test:rls` + E2E secrets wired; suites **self-skip** when secrets empty; scheduled-security workflow also has RLS job.

**Gaps**
- Live verification only when GitHub secrets are set — otherwise green-via-skip.
- Coverage step uses `continue-on-error: true` (informational only).
- Manual: populate test-project secrets (never production).

**Payments note:** `PAYMENTS_ENABLED` fail-closed on `payments-initiate` / `payments-callback` / `member-registration-fee`. Phase G = UI mocks only.

---

## Ordered work list (PARTIAL + MISSING only)

Preserve identity; extract tokens from current CSS; keep homepage sections.

| Order | Phase | Focus | Why |
|-------|-------|-------|-----|
| 1 | **A** | Design system: document tokens from `index.css`; wire radius/shadow/status; React **Button**/`Input` on `.luma-btn`/`fieldClass`; `docs/DESIGN_SYSTEM.md` | Consistency without redesign |
| 2 | **B** | Motion cleanup: pulse→skeleton, token durations, optional AdminLayout PageTransition | System exists — adoption only |
| 3 | **C** | States: Skeleton/Empty/Error + safe errors + Sentry on all major data views | Highest UX gap |
| 4 | **D** | Mobile: bottom nav **if approved**, MobileCardTable ≤640px, dashboard density | Mobile first-class |
| 5 | **E** | Homepage: keep sections; fix 6-vs-12 copy; trust bullets for receipts/RBAC; stories only if real data | No section removal |
| 6 | **F** | Receipts share + `pii` masking; light chart empty-state polish | Trust |
| 7 | **G** | Payment UI states only behind flag / mocks | No Daraja changes |
| 8 | **H** | A11y: ConfirmDialog focus trap, forms ARIA, axe Playwright, contrast soft spots | AA path |
| 9 | **I** | Perf (Lighthouse, lazy images) + observability (`auth_failed` writer) + brand assets | Evidence |
| 10 | **J** | CI secrets enforcement + SEO/PWA install QA | Production readiness |

**Explicitly deferred / skipped**
- Payment backend, M-Pesa enablement, schema/RLS rewrites.
- Full visual redesign / new color palette / new font.
- Inventing impact stats or testimonials.

---

## Manual actions for product owner (later)

1. Confirm GitHub Actions secrets for a **dedicated test** Supabase project.
2. Approve or supply real OG image and social URLs.
3. Provide real stories/impact numbers **or** approve omitting those blocks.
4. Approve member bottom-nav IA before Phase D implements it.
5. Independent security review before real member onboarding.

---

## Phase 0 gate

**STOP — awaiting approval to proceed.**

Suggested next step after approval: **Phase A (design system gaps only)**, then Phase B motion cleanup; pause again after A+B per “stop every two phases.”
