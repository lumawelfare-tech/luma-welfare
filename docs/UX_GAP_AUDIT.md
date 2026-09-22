# Luma Welfare — UX Gap Audit (Phase 0)

**Date:** 2026-09-22 (Phases A–H complete)  
**Scope:** IMPROVE gap audit + phased fixes. Phase 0 was assessment-only; A–H are code/docs.  
**Constraint:** IMPROVE, do not redesign. Keep brand greens, logo, typography, and working layouts.  
**Payments hard rule:** Do not modify Daraja/M-Pesa logic, Edge Functions payment flags, or env vars. UI-only honesty / mock path only.  
**Status key:** `DONE` | `PARTIAL` | `MISSING`

**Sources:** Live site (`https://luma-welfare.vercel.app`), codebase inspection, prior polish commits on `main`.

---

## Summary scorecard

| # | Area | Status |
|---|------|--------|
| 1 | Payment / trust messaging | **DONE** (Phase A) |
| 2 | Contact info consistency | **DONE** (Phase A) |
| 3 | Navigation and user journey | **DONE** (Phase B) |
| 4 | Mobile UX | **DONE** (Phase E — Dashboard payments + Receipts use MobileCardTable) |
| 5 | Member portal features | **DONE** (Phase C polish) |
| 6 | Admin portal features | **DONE** (Phase D polish) |
| 7 | Loading / empty / error states | **DONE** (Phase F — public CMS + admin recon/settings/scheduled use reportLoadError; JWT/PGRST scrub) |
| 8 | Performance | **DONE** (Phase G — Framer vendor chunk + recorded sizes in `docs/LIGHTHOUSE.md`) |
| 9 | Production hardening / security verification | **PARTIAL** (Phase H docs/checklists; live secrets still operator) |
| 10 | Accessibility | **DONE** (Phase H — axe contact/register; Login password describedby; footer contrast) |

**Overall:** Product IMPROVE phases A–H complete in-repo. Remaining go-live blockers are **operator**: dedicated test Supabase secrets, `ENFORCE_LIVE_SECRETS=true`, role-matrix evidence, legal placeholders, and independent security review. Payments stay honest/disabled (no Daraja changes).

---

## 1. Payment / trust messaging

**Status: DONE** (Phase A — marketing + Dashboard lead with honest “launching soon” / admin-verify copy; STK only via mock or explicit “Try online payment”. No Daraja/Edge payment changes.)

---

### Evidence (honest)

| Surface | Quote / behavior |
|---------|------------------|
| `frontend/src/lib/paymentsUi.ts` | `"M-Pesa payments are not enabled yet… an admin can verify manual payments."` |
| `frontend/src/pages/FAQ.tsx` (Payments) | `"Currently, payment processing is being set up…"` / `"M-Pesa integration is being prepared… contributions are recorded manually…"` |
| `frontend/src/pages/Home.tsx` contributions FAQ | `"Record your payment in your account; administrators verify it."` |
| `frontend/src/pages/Privacy.tsx` | Notes online M-Pesa collection exists in code but remains disabled |
| Live home trust block | Speaks to encrypted auth / receipts / RBAC — **not** “live M-Pesa processor” |

### Evidence (overstated / misleading while M-Pesa is off)

| Surface | Issue |
|---------|--------|
| `frontend/src/pages/member/Dashboard.tsx` | Default activation / contribution UI: `"Send STK Push"`, `"M-Pesa phone"`, waiting copy implying a PIN prompt was sent — only switches to disabled after API/`paymentsDisabled` |
| `frontend/src/pages/Home.tsx` FAQ “How do I join?” | `"pay the KSh 300 activation fee"` with no “manual verify / payments launching” caveat (live home confirms this FAQ) |
| `frontend/src/pages/FAQ.tsx` Getting Started | Multiple answers say pay activation fee as if online payment is the path; Payments section is honest — **internal inconsistency** |
| Home bottom CTA | Live: `"One-time KSh 300 activation fee after registration"` — true as a fee, silent that online pay is not live |
| `JoinPackages.tsx` | Fee gate → Dashboard STK without saying admin/manual is current path |
| `Contact.tsx` (live) | `"For a payment question: the M-Pesa transaction ID"` — implies M-Pesa receipts are the normal path today |
| `VITE_PAYMENTS_UI_MOCK` | Mock can show success/waiting panels that look live (banner exists; still easy to misread) |

### Gaps (Phase A)

1. Prefer honest CTAs when payments are off (hide STK primary, or lead with disabled / “Payments launching soon” / manual-record path).
2. Align Home FAQ, FAQ Getting Started, JoinPackages, and Contact ready-list with FAQ Payments honesty.
3. Do **not** change payment Edge Functions or `PAYMENTS_ENABLED`.

---

## 2. Contact info consistency

**Status: DONE** (Phase A — Contact reads `siteConfig`; About lists the same channels; ready-list no longer assumes M-Pesa IDs.)

---

### Canonical values (aligned where shown)

| Field | Value | Sources |
|-------|-------|---------|
| Phone display | `0798 635 024` | `legal.ts` / `siteConfig` / Footer / Contact (live) |
| Email | `info@lumawelfare.or.ke` | same |
| WhatsApp | `wa.me/254798635024` | same |

### Gaps

| Gap | Evidence |
|-----|----------|
| **About has no contact channels** | `About.tsx` — no phone/email/WhatsApp block (footer excluded per scope) |
| **Contact hardcodes** | `Contact.tsx` L15–19 duplicates legal/siteConfig — drift risk |
| **Address** | `PLACEHOLDER_PHYSICAL_ADDRESS` in `legal.ts` — intentionally hidden; Contact/About show none |
| Website display | Contact shows `www.lumawelfare.or.ke` vs config `https://www.lumawelfare.or.ke` (same host, format drift) |

No conflicting phone/email found between Contact and Footer. Consistency gap is **About omission + Contact not single-sourced**.

---

## 3. Navigation and user journey

**Status: DONE** (Phase B — public nav: How It Works instead of guest Dashboard; member bottom nav “Contribute”; breadcrumbs + back on join/claims/contributions. Light chrome only.)

---

### Journey (exists)

```
Home / Packages → Join Now → /register → /verify-email → /login
  → /dashboard → activation fee → /join (packages) → contribute
  → claims when eligible
```

Live home CTAs: **Join Luma**, **View packages**, bottom **Join Luma** again; nav **Join Now**; footer **How It Works** / **FAQ** (not in primary nav).

### Gaps (Phase B)

1. **Dual pay paths:** Dashboard `"Pay now"` / STK vs Contributions `"Record Payment"` / mobile bottom nav `"Pay"` → `/contributions` — confusing while STK is off.
2. **Redundant Join CTAs** on hero, mid-page, bottom, nav, footer, package cards (works, but noisy).
3. **No UI step chrome / breadcrumbs** on join or claim submit (`PageHeader` supports breadcrumbs; Join/Claims don’t use them).
4. **How It Works / FAQ** only in footer — discoverability of the honest payment story is weak.
5. Guest **Dashboard** nav → auth gate can feel like a dead end vs Join.
6. VerifyEmail → Login hop (no direct Dashboard handoff) — extra step, not a dead end.

**Layout note:** Adding breadcrumbs/step UI is a light chrome change — confirm before implementing.

---

## 4. Mobile UX

**Status: PARTIAL**

### Evidence (done)

- Member bottom nav (`MemberLayout.tsx`) — Home / Pay / Claims / Profile; `lg:hidden`
- `MobileCardTable` + admin `DataTable` card split at `sm`
- Widespread `min-h-[44px]` / `.touch-target`; `e2e/member-mobile.spec.ts` overflow smoke

### Gaps (Phase E)

| Gap | Detail |
|-----|--------|
| MobileCardTable underused | Member **Contributions** only; Dashboard payment history + **Receipts** still horizontal scroll tables |
| Breakpoint mismatch | Shell at **`lg` (1024)**; tables at **`sm` (640)** → tablets get bottom nav + desktop tables |
| Touch targets | Receipts export strip; some admin action buttons `py-1.5` |
| Bottom nav IA | Receipts / Family / Notifications / Join only via drawer |

---

## 5. Member portal

**Status: DONE** (features present; polish only)

| Feature | Status | Evidence |
|---------|--------|----------|
| Contribution history | DONE | `/contributions` → `member-contributions` |
| Receipts view / share | DONE | `/receipts-statements`; share + PII mask |
| Receipt “PDF” | PARTIAL polish | Print-HTML blob, not binary PDF |
| Claims status | DONE | `/claims` + `ClaimTimeline` + realtime |
| Notifications + prefs | DONE | `/notifications`, `/notification-preferences` |
| Profile | DONE | `/profile` (avatar, password, export, deletion request) |
| Financial summary | DONE / light polish | Dashboard: total contributed, next due, package cards; summary `package_name` is singular amid multi-package |

**Phase C implication:** No greenfield member features required. Optional polish only if you expand C beyond “missing.”

---

## 6. Admin portal

**Status: DONE** (features present; polish only)

| Capability | Status | Evidence |
|------------|--------|----------|
| Member management | DONE | `AdminMembers.tsx` |
| Contribution monitoring | DONE | `AdminContributions.tsx` |
| Claims management | DONE | `AdminClaims.tsx` |
| Reports / export | DONE | `AdminReports.tsx`, scheduled reports, per-page exports |
| Analytics | DONE | `AdminDashboard.tsx` + Recharts (`DashboardCharts.tsx`) — already ≥3–4 charts |

**Phase D implication:** No missing admin modules. Optional: mobile table polish / touch targets only.

---

## 7. Loading / empty / error states

**Status: PARTIAL**

### Done

- Shared `Skeleton*`, `EmptyState`, `ErrorState`, `userFacingError`, Sentry PII scrub (`sentry.ts` + tests)
- Most member data views + major admin lists use `ErrorState` + `reportLoadError` on load

### Gaps (Phase F)

| Gap | Evidence |
|-----|----------|
| Public CMS raw `e.message` | `Packages.tsx`, `News.tsx`, `Gallery.tsx`, `Media.tsx` |
| Mutation toasts / banners use raw `ApiError.message` | Widespread admin + member mutations |
| Weaker ErrorState coverage | `AdminReconciliation`, `AdminScheduledReports`, `AdminSettings`, `AdminReports`, `Profile` |
| Scrub gaps | `UNSAFE_MESSAGE` does not explicitly catch JWT / PGRST strings |

Blank screens are not systemic on major dashboards.

---

## 8. Performance

**Status: DONE** (Phase G — Lighthouse scores still manual)

| Item | Status | Evidence |
|------|--------|----------|
| Route code-splitting | DONE | `App.tsx` `React.lazy` for packages/news/gallery/media + member + admin |
| Image lazy-load | DONE | Gallery/Media/admin grids `loading="lazy"`; hero `fetchPriority="high"` |
| Font | DONE | Local Inter + `font-display: swap` |
| Vendor chunks | DONE | react / framer / recharts / jspdf / html2canvas in `vite.config.ts` |
| Lighthouse recipe | DONE | `docs/LIGHTHOUSE.md`, `npm run lighthouse:smoke` |
| Recorded bundle sizes | DONE | `docs/LIGHTHOUSE.md` table (2026-09-22); `vendor-framer` ~135 kB / ~44 kB gzip |
| Recorded Lighthouse scores in CI | MISSING | Manual only by design |

---

## 9. Production hardening and security verification

**Status: PARTIAL** (docs + soft gate DONE; live proof MISSING until secrets)

| Item | Status | Evidence |
|------|--------|----------|
| RLS live suite wired | PARTIAL | `ci.yml` `npm run test:rls` — **self-skips** without secrets |
| Authenticated E2E wired | PARTIAL | Playwright env + `test.skip` without `E2E_*` |
| Live Secrets Gate | DONE soft | Canonical repo job warns; fails only if `vars.ENFORCE_LIVE_SECRETS=true` |
| Sentry (FE + Edge) + scrub | DONE | `frontend/src/lib/sentry.ts`, `supabase/functions/shared/sentry.ts` |
| Health check | DONE | `supabase/functions/health` + `AdminHealthCheck.tsx` |
| Backup / restore docs | DONE | `docs/BACKUP_RESTORE.md` (operator drills unchecked by design) |
| Role isolation evidence | PARTIAL | Specs + checklist in `docs/SECURITY_VERIFICATION.md`; **not proven green-live** until secrets populated |
| Branch protection docs | DONE | `docs/BRANCH_PROTECTION.md` (soft → hard ENFORCE path) |

---

## 10. Accessibility

**Status: DONE** (Phase H polish; full-site audit still optional)

| Item | Status | Evidence |
|------|--------|----------|
| ConfirmDialog focus trap | DONE | `useFocusTrap` in `ConfirmDialog.tsx` |
| axe smoke | DONE | `e2e/a11y.spec.ts` — home, login, contact, register (serious/critical) |
| Form ARIA (Login) | DONE | Email `Input` error id; password `aria-describedby` → `login-email-error` |
| Footer contrast | DONE | Dark footer body/links use `text-luma-100` (was 200/300/400) |
| Headings | MOSTLY DONE | Home FAQ has `aria-expanded` / `aria-controls`; not full-site audited |

---

## Ordered work list (status after A–H)

| Order | Phase | Focus | Status |
|-------|-------|-------|--------|
| 1 | **A** | Payment honesty + Contact consistency | **DONE** |
| 2 | **B** | Journey clarity | **DONE** |
| 3 | **C** | Member polish | **DONE** |
| 4 | **D** | Admin polish | **DONE** |
| 5 | **E** | MobileCardTable + 44px | **DONE** |
| 6 | **F** | reportLoadError / JWT scrub | **DONE** |
| 7 | **G** | Framer chunk + Lighthouse evidence | **DONE** |
| 8 | **H** | CI/docs + a11y polish | **DONE** (live secrets still manual) |

### Explicitly deferred / skipped

- All real M-Pesa / Daraja enablement and payment Edge Function changes
- Invented stats, testimonials, member counts, impact numbers
- Physical address / registration numbers until you supply non-placeholder values
- Full visual redesign, new palette, new fonts
- Treating CI as “secure” while secrets are unset

### Manual actions for you

1. Create/configure a **dedicated test** Supabase project; set GitHub Actions secrets (`SUPABASE_*`, `E2E_*`).
2. After secrets work: set repo variable `ENFORCE_LIVE_SECRETS=true`.
3. Complete the role matrix checklist in `docs/SECURITY_VERIFICATION.md` with CI/local evidence.
4. Approve or supply real Stories/testimonials — or approve omitting those blocks forever.
5. Independent security review before onboarding real members at scale.

---

## Final deliverables (IMPROVE complete)

| Deliverable | Location |
|-------------|----------|
| Gap audit + scorecard | `docs/UX_GAP_AUDIT.md` (this file) |
| Lighthouse + bundle evidence | `docs/LIGHTHOUSE.md` |
| Branch protection / ENFORCE gate | `docs/BRANCH_PROTECTION.md` |
| Security verification + role checklist | `docs/SECURITY_VERIFICATION.md` |
| Payment honesty helpers | `frontend/src/lib/paymentsUi.ts` |
| Framer vendor chunk | `frontend/vite.config.ts` → `vendor-framer` |
| Expanded axe smoke | `e2e/a11y.spec.ts` |

**Stop.** Phases A–H committed locally. Push / enable live secrets only when you ask.
