# LUMA Welfare — Official Documents vs Live Site Audit

**Stage:** 1 (audit only)  
**Date:** 2026-09-22  
**Sources read in full:**
- `docs/LUMA_WELFARE_MASTER_DOCUMENT_UPDATED.pdf` (13 pages)
- `docs/LUMA_Welfare_Our_Story.pdf` (2 pages)
- `docs/LUMA_Welfare_Online_Membership_Registration_Form.pdf` (3 pages)

**Code / schema evidence:** `docs/legacy-backend-sql/schema.sql`, `docs/legacy-backend-sql/seed.sql`, frontend pages, Edge Functions, Phase 2–7 migrations.  
**No code, content, or database rows were modified in this pass.**

---

## 0. PDF presence in the repo

| File | In `/docs` on disk | Tracked in git (`git ls-files`) |
|------|--------------------|----------------------------------|
| `LUMA_WELFARE_MASTER_DOCUMENT_UPDATED.pdf` | Yes | Yes |
| `LUMA_Welfare_Our_Story.pdf` | Yes | Yes |
| `LUMA_Welfare_Online_Membership_Registration_Form.pdf` | Yes | Yes |

All three official PDFs are committed under `docs/`. Safe for other developers.

---

## 1. Packages catalog

**Schema note (affects how gaps should be fixed):**  
`packages` + `package_tiers` + `package_rules` already exist. Tiers today are **named contribution options** (e.g. Individual / Nuclear Family / Extended Family) with a flat `amount` — **no** `parent_package_id`, **no** `min_age` / `max_age`. Age is stored on `members.date_of_birth` (collected at registration) but **not** used to resolve package price.

**Seed inventory** (`docs/legacy-backend-sql/seed.sql`): 12 packages. **Mission of Mercy is absent.**  
User reported Admin > Packages currently shows only five live names (Hospital, Education, Business, Building, Welfare). That implies **production may diverge from seed** (inactive/missing rows). Confirm live DB with Admin Packages before seeding changes.

| Official package | Official terms | Current site / seed | Status | Evidence |
|------------------|----------------|---------------------|--------|----------|
| Welfare Package / Burial Support | No waiting period; **age 79− KSh 100**, **age 80+ KSh 400**; Nuclear KSh 300; Extended KSh 500; contributions current | Seed: no waiting period; tiers **Individual 100 / Nuclear 300 / Extended 500** only — **no age tiers** | **Mismatch** | Master §8; `seed.sql` welfare tiers |
| Hospital Insurance (Outpatient) | KSh 1,200; 12 months | Seed: 1200 / 12 | Match (in seed) | `seed.sql` hospital |
| Education Support | KSh 1,200; 6 months | Seed: 1200 / 6 | Match (in seed) | `seed.sql` education |
| Business Support | KSh 2,000; 12 months | Seed: 2000 / 12 | Match (in seed) | `seed.sql` business |
| Building Support | KSh 2,000; 12 months | Seed: 2000 / 12 | Match (in seed) | `seed.sql` building |
| Land Purchase Support | KSh 2,000; 12 months | Seed: separate `land` package 2000 / 12 | Match as separate package (seed) | `seed.sql` land |
| Farming Support | KSh 2,000; 12 months | Seed: 2000 / 12 | Match (in seed) | `seed.sql` farming |
| Wedding Support | KSh 2,000; 12 months | Seed: 2000 / 12 | Match (in seed) | `seed.sql` wedding |
| Dowry/Ruracio Support | KSh 2,000; 12 months | Seed: 2000 / 12 | Match (in seed) | `seed.sql` dowry |
| Disaster Relief Support | KSh 2,000; 12 months | Seed: 2000 / 12 | Match (in seed) | `seed.sql` disaster |
| Youth Empowerment Support | KSh 2,000; 12 months | Seed: 2000 / 12 | Match (in seed) | `seed.sql` youth |
| Senior Citizen Support | KSh 2,000; 12 months | Seed: 2000 / 12 | Match (in seed) | `seed.sql` senior |
| **Mission of Mercy** | **KSh 500; 12 months; ONE package with 3 nested sub-categories** (Children’s Orphanage/Vulnerables, Widows, Single Mothers) | **Missing** from seed and schema (no nesting). Admin Community page is outreach ops only — not a joinable package | **Missing** | Master §8; no `mission` code in seed; `AdminCommunity.tsx` |

### Mission of Mercy structure

| Question | Finding |
|----------|---------|
| Structured as ONE package with three nested sub-categories? | **No** — package missing entirely; `packages` has no parent/child FK |
| Welfare: age tiers AND family-coverage tiers? | Official doc requires **both**. Site/seed has **family coverage only**. Age tiers **not implemented** |

### Proposed fix direction (not implemented)

- Prefer **extend** `package_tiers` (add nullable `min_age` / `max_age`) + optional `packages.parent_package_id` — **do not** invent a parallel `package_price_tiers` / `luma_documents` duplicate.
- Client must confirm how **age × family** combine for Welfare (e.g. age sets Individual base, Nuclear/Extended stay overlays — or full matrix). Official text lists both dimensions without a cross-product rule.

---

## 2. Registration / join flow

Official form: personal → contact → emergency/next of kin → programs + family coverage → family/dependant table → membership payment → declaration → portal shows Application Number + Pending Verification.

| Item | Official | Current site | Status | Evidence |
|------|----------|--------------|--------|----------|
| Full name, ID/passport, DOB, gender, marital, county, town/area, residential address | Required | Collected | Match | `Register.tsx`, `parseRegisterBody` |
| Mobile, WhatsApp, email, alternative contact | Required | Collected (`phone`, `whatsappPhone`, `email`, `altPhone`) | Match | `Register.tsx` |
| Emergency contact name, relationship, phone, alt phone | Required | Collected | Match | `Register.tsx` |
| Program checkboxes (Welfare, Outpatient, Education, Business, Building & Land, Farming, Senior, Other) | Required | Same option set (codes WELFARE…OTHER) | Match (interest codes) | `PROGRAM_OPTIONS` in `Register.tsx` |
| Family coverage Individual / Nuclear / Extended | Required | Collected (`familyCoverage`) | Match | `Register.tsx` |
| Family / dependant table on application | Name, relationship, DOB, ID on same form | **Not on register** — dependents via later `/family` after membership | Missing on application | `Register.tsx` vs `Family.tsx` |
| Registration fee + selected monthly contribution + payment method on form | On application PDF | Separated: post-verify **KSh 300 activation**, then join packages / contributions | Mismatch (flow split) | Master form §6; `Home.tsx` / Dashboard fee UX |
| Application Number `LUMA-…` | Displayed after submit | `LUMA-APP-YYYYMMDD-#####` via `generate_application_number` | Match (stricter prefix) | Migration `20260922160000_…` |
| Status “Pending Verification” | On form | Status enum `pending_approval` (email OTP then admin approve → membership #) | Partial match (naming / two-step) | `auth-register`, `RequireMember` |
| Password / account creation | Not on paper form | Required (digital auth) | Extra (necessary) | `Register.tsx` |
| Constitution + privacy/terms + self-submission confirm | Constitution + data consent | Privacy, Terms, Constitution, self-submission | Match / slightly stronger | `Register.tsx` |

---

## 3. Claims flow

| Item | Official (Master §10 + claim form) | Current site | Status | Evidence |
|------|-------------------------------------|--------------|--------|----------|
| Report event → claim form → documents | Required | Member claims UI + document upload to private `claim-documents` | Match (digital) | `member-claims`, Claims page |
| Membership / contribution check | Officer verifies | Admin checklist: docs / membership / contributions before approve | Match | `admin-claims` checklist gate |
| Review vs package terms | Required | Qualification engine + admin review; no free-text “package schedule” attach | Partial | qualify + AdminClaims |
| Decision APPROVED / DECLINED / PENDING | Form office use | Statuses: Draft → Submitted → Under Review → Additional Info → Approved / Rejected → Paid | Match (richer set) | Schema `claim_status` |
| “Contribution status verified by” / “Eligibility verified by” named fields | On paper form | Checklist booleans + `checklist_updated_by` — not separate named officer fields | Partial | Phase 5 checklist columns |
| Payment recorded + receipt | Required | Manual payout record + notify (M-Pesa not live) | Partial (honest manual path) | admin-claims payout action |
| Amount requested on claim | On form | Claim description / type; amount handling product-dependent | Review | Claims UI |

---

## 4. About / Our Story

| Item | Official (Our Story.pdf) | Current `/about` | Status | Evidence |
|------|--------------------------|------------------|--------|----------|
| Tagline “Together We Are Stronger” | Primary | Not on About page | Missing | `About.tsx` |
| Why LUMA + program list (Welfare, Outpatient, Education, Business, Building & Land, Farming, Senior, other) | Present | Generic “twelve support packages” blurb | Partial / Missing list | `About.tsx` |
| Commitments: Transparency, Accountability, Fairness, Community, Growth | Five commitments | Values: Integrity, Compassion, Teamwork, Transparency, Accountability, Excellence | Mismatch (different set) | `About.tsx` values array |
| Vision / Mission wording | Specific Our Story + Master variants | Different mission copy; no Our Story vision block | Mismatch | `About.tsx` vs Our Story.pdf |
| Chairman / Kitengela / 2021 | Master branding | Not on About | Missing (not misstated) | `About.tsx` |
| Disclaimer: programs subject to constitution/rules | Explicit in PDF | Not mirrored near programs list | Missing | Our Story.pdf footer |

---

## 5. Homepage / public content (overpromise check)

| Item | Risk | Current state | Status | Evidence |
|------|------|---------------|--------|----------|
| “Hospital Insurance” naming | Sounds regulated / insurance product; Master still uses that label but governance note says finalize legal/insurance status before launch | Package name uses “Hospital Insurance (Outpatient)” | Needs client/legal confirmation | `seed.sql`, Packages page |
| Specific guaranteed payout amounts | Master: do not promise benefits outside approved schedules | Site generally avoids fixed claim payout promises; qualification language used | Mostly OK | Home / FAQ / Terms |
| “No hidden terms” / transparent operations | Acceptable if accurate | Home feature copy | OK if rules are visible | `Home.tsx` |
| KSh 300 activation framed as membership fee | Official form has registration fee line; Master renewal “KSh 300 every two months” is **proposed** | Site treats KSh 300 as one-time activation — **different rule** | Mismatch vs proposed renewal; confirm which is intended | Home, FAQ, Terms |
| Insurance-style “cover” language | Common on site | Present (waiting period / cover current) | Watch — align with approved schedules | Packages, HowItWorks |

---

## 6. Contribution & renewal rules

| Item | Official | Current site | Status | Evidence |
|------|----------|--------------|--------|----------|
| Late-payment deadline **10th of month** | Explicitly **proposed**, subject to final rules | Not enforced or stated as hard rule | Missing (and correctly not hard-coded yet) | Master §9 |
| Renewal **KSh 300 every two months** | Explicitly **proposed** | Not implemented; KSh 300 used as one-time activation | Missing / different use | Master §9 vs registration_fees |
| Non-refund principle | Only if adopted, must be clear before enrollment | Not prominently stated as adopted | Needs client confirmation | Master §9 |
| Contributions recorded per membership # / package | Required | Contributions + subscriptions per package | Match | schema + Contributions UI |

---

## 7. Branding

| Item | Official | Current site | Status | Evidence |
|------|----------|--------------|--------|----------|
| Chairman Boss Williams | Master cover + message | Not shown on public About/Home (not contradicted) | Absent | About, Home |
| Founded 2021, Kitengela | Master | Not shown publicly | Absent | About |
| “Standing with everyone through the Mission of Mercy” | Master tagline | Not primary marketing copy | Absent | About, Home |
| “Together We Are Stronger” / “One community, one heart, one purpose” | Master / Our Story | Sparse / missing on About | Missing | About |
| Closing Master line “Together We Care…” | Document control | Not used | Absent | — |

---

## Prioritized implementation plan (proposals only)

### Critical (factually wrong or incomplete vs approved package schedule for members)

1. **Welfare age pricing missing** — add age-aware tier resolution using `members.date_of_birth`; reconcile with existing Nuclear/Extended family tiers (needs client matrix).
2. **Mission of Mercy package missing** — add package + 12-month wait + KSh 500; decide nesting (`parent_package_id` vs descriptive tags).
3. **Confirm live Admin package list** — if production only has 5 active packages, missing catalog items (Land, Farming, Wedding, etc.) are live gaps even if seed is complete.
4. **Hospital “Insurance” wording / benefit promises** — legal confirmation before treating as launched insurance product.

### Important (data collection / claims correctness)

5. Optional: collect initial dependants on registration (or keep post-approval Family step — document intentional split).
6. Align application status label “Pending Verification” in member-facing copy with `pending_approval`.
7. Claims office-use named verifier fields if paper parity required (beyond checklist booleans).
8. Align registration program interest codes with joinable package codes (BUILDING vs building+land; OTHER → Mission/Wedding/etc.).

### Nice to have

9. Rewrite `/about` from Our Story.pdf (tagline, vision/mission, five commitments, program list, disclaimer).
10. Add founding year/location/chairman where branding policy allows.
11. Contribution FAQ: state 10th / bi-monthly renewal only after client adopts them.

---

## Needs client confirmation (not yet hard rules)

Master document itself marks these as **proposed / subject to final approval**:

| Topic | Master language | Recommendation |
|-------|-----------------|----------------|
| Late payment by **10th** of month | “proposed … subject to final approved rules” | Do **not** enforce until constitution/package schedule signed |
| Renewal **KSh 300 / 2 months** | “Current proposed renewal” | Confirm vs today’s one-time KSh 300 activation fee |
| Non-refund principle | “If the organization adopts…” | Confirm adoption before enrollment copy |
| Package benefit amounts / insurance arrangements | Must finalize before public launch; comply with Kenyan law | Legal/ops review |
| Welfare **age × family** price matrix | Listed as separate lines, not a grid | Confirm resolution algorithm |
| Mission of Mercy: price on parent only vs each sub-category | “single package … nested sub-categories” | Default engineering assumption: selectable sub-categories each KSh 500 — **confirm** |
| Mission of Mercy description text | High-level only | Provide final marketing/description before go-live |

---

## Appendix A — Packages “Step 1” investigation (no code)

### A1. Schema / nesting

| Capability | Exists? |
|------------|---------|
| `packages` table | Yes |
| Nested / child packages (`parent_package_id`) | **No** |
| `package_tiers` (name + amount) | **Yes** — family/flat contribution options |
| Age columns on tiers | **No** |
| Separate `package_price_tiers` | **No** (and should not be added as a duplicate) |

**Smallest schema change (proposed, not applied):**  
1. `ALTER TABLE packages ADD COLUMN parent_package_id uuid NULL REFERENCES packages(id);`  
2. Extend `package_tiers` with nullable `min_age int`, `max_age int` (+ overlap exclusion constraint / validation in Edge Function).  
**Do not** create a second pricing table.

### A2. Price storage & age

- Price path today: `subscriptions.package_tier_id` → `package_tiers.amount` (used in contributions, admin subscriptions, receipts/reports via joined `packages` / `package_tiers`).
- Age: `members.date_of_birth` (date). No computed age column; resolve at selection/billing time.
- Missing DOB: must block Welfare age-tier selection (per your Step 5 rule) — not implemented yet.

### A3. Admin Packages UI

- List: flat cards with tier chips `name: KSh amount`; JSON rules editor.  
- Create form: code, name, description, waiting period — **no** parent selector, **no** tier editor for age.  
- Cannot represent parent/children today.

### A4. Call sites reading package price/name

| Surface | Path |
|---------|------|
| Public packages | `frontend/src/pages/Packages.tsx` ← `public-data` |
| Member join | `JoinPackages.tsx` |
| Contributions | `Contributions.tsx` (tier amount default) |
| Member dashboard | `Dashboard.tsx` (`monthly_amount`) |
| Admin packages | `AdminPackages.tsx` / `admin-packages` |
| Admin subscriptions / contributions / claims / reports | respective admin pages + Edge Functions |
| Qualification | `package_rules` + qualify engine |

---

## Appendix B — Document storage foundation audit (no new bucket/table yet)

| Question | Finding |
|----------|---------|
| Equivalent system already exists? | **Yes** — Phase 6: private bucket `kb-documents` + table `kb_documents` + admin/member document EFs + signed URLs |
| `luma_documents` table? | **Does not exist** — **do not create**; extend `kb_documents` |
| `luma-documents` bucket? | **Does not exist** — **do not create**; use `kb-documents` |
| Access levels | `public` \| `member` \| `staff` \| `admin` \| `restricted` (lowercase) |
| Status | `draft` \| `approved` \| `archived` — **no `under_review` yet** (add if required) |
| Category | Free-text today — can constrain to ORGANIZATIONAL / PUBLIC_CONTENT / MEMBERSHIP / … |
| PDFs in repo `/docs` | Yes (all three committed) |
| PDFs uploaded to Supabase Storage? | **Not verified / not part of this audit pass** — upload only after you approve extending `kb_documents` |
| RAG / chunks | Phase 7 `kb_chunks` exists but **out of scope** for “storage foundation only”; do not re-ingest until docs APPROVED |

**Recommended foundation approach (awaiting your GO):** extend `kb_documents` (+ optional `under_review` status, category check, version string, effective_date), seed three **UNDER_REVIEW**/`under_review` metadata rows with STAFF/PUBLIC/STAFF access as specified, upload PDFs to `kb-documents/{organizational|public-content|membership}/…` via existing `admin-documents` service-role path — **no new public pages, no RAG in that step**.

---

## Manual actions for you

1. Confirm live Supabase package rows vs seed (screenshot or export Admin Packages).  
2. Confirm Welfare **age × family** pricing matrix.  
3. Confirm Mission of Mercy nesting + whether each sub-category is independently joinable at KSh 500.  
4. Confirm Mission of Mercy public description text.  
5. Confirm whether proposed **10th** / **KSh 300 bi-monthly renewal** should become site rules or stay draft.  
6. Approve which workstream to implement first:
   - Org content / About alignment  
   - Packages nesting + age tiers  
   - Document metadata + Storage upload of the three PDFs (extend `kb_documents`, not new tables)

---

## STOP

Audit complete. **No migrations applied. No UI changes. No uploads. No RAG.**  
Await your ordered implementation instructions.
