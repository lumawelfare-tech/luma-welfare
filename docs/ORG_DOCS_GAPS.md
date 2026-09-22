# LUMA Welfare — Official Documents Gap List (Stage 1)

**Date:** 2026-09-22  
**Stage:** 1 — gaps only (no code changes in this pass)  
**Sources read in full:**
- `docs/LUMA_WELFARE_MASTER_DOCUMENT_UPDATED.pdf` (13 pages)
- `docs/LUMA_Welfare_Our_Story.pdf` (2 pages)
- `docs/LUMA_Welfare_Online_Membership_Registration_Form.pdf` (3 pages)

**Also checked:** live site `https://luma-welfare.vercel.app/` (Home, About), live Supabase `public-data?resource=packages`, and current frontend/schema/migrations.

**Rule for this file:** list only what is **genuinely absent**. Items that already exist (even with different wording) are omitted from gap sections and noted under “Already present” or “Close — needs your decision.”

---

## Already present (not gaps)

### Packages (live catalogue — 16 rows)

| Official package | Live evidence |
|------------------|---------------|
| Welfare Package / Burial Support | `welfare` — Age 0–79 KSh 100, Age 80+ KSh 400, Nuclear 300, Extended 500; no fixed wait (`waiting_period_months` empty) |
| Hospital / Outpatient | `hospital` — Outpatient Hospital Support, KSh 1200, 12 mo |
| Education | `education` — 1200 / 6 mo |
| Business, Building, Land, Farming, Wedding, Dowry/Ruracio, Disaster Relief, Youth Empowerment, Senior Citizen | Present at KSh 2000 / 12 mo |
| Mission of Mercy | Parent `mission_of_mercy` KSh 500 / 12 mo + nested children: Children’s Orphanage/Vulnerables, Widows, Single Mothers |

Schema already has `parent_package_id`, `min_age` / `max_age` on tiers (migration `20260922220000_package_nesting_age_tiers.sql`).

### Registration fields already collected

Gender, marital status, county, town/area (`location`), WhatsApp, alternative contact, family coverage (Individual / Nuclear / Extended), program interest checkboxes, emergency contact (name, relationship, phone, alt phone), Application Number generation (`LUMA-APP-YYYYMMDD-#####`), member-facing status label “Pending verification” (`ApplicationStatus.tsx`).

### About / Our Story (live `/about`)

Why LUMA Welfare; commitments Transparency / Accountability / Fairness / Community / Growth; founding 2021 Kitengela + Chairman Boss Williams; Vision / Mission; Our Story program list names; constitution/rules disclaimer.

### Claims (member + admin)

Claim type, amount requested, description, document upload/list; admin eligibility / contribution verified-by fields; approve/reject/request-info; approved amount; admin notes (reason); payout reference + paid/processed date via `payouts` + `paid_at`.

---

## 1. Packages — genuine gaps

**None.** All 13 official packages (with MoM nesting and Welfare age/family tiers) are present in the live catalogue with matching prices/waits.

---

## 2. Registration form — genuine gaps

| Gap ID | Missing item | Evidence |
|--------|--------------|----------|
| **R1** | **Family / dependant table on the application** (name, relationship, DOB, ID/birth cert) | Official online form §5. Register explicitly defers this to the member portal after approval (`Register.tsx`). |
| **R2** | **“How did you learn about LUMA Welfare?”** | Master document §20 application form. Not on `Register.tsx` / online PDF is shorter, but Master includes it. |
| **R3** | Registration fee / monthly / total on form | Fee amount now from `platform_settings` (see `docs/REGISTRATION_FEE.md`). Monthly/total formulas remain **blocked**. |
| **R4** | Application Number + Pending Verification on immediate post-submit | **Addressed:** Verify Email shows server `applicationNumber` + pending status (sessionStorage refresh). |

Not listed as gaps (already present): gender, marital, county, town, WhatsApp, alt contact, family coverage type, Application Number *generation*, Pending Verification *label elsewhere*.

---

## 3. Beneficiary / next-of-kin — genuine gaps

| Gap ID | Missing item | Evidence |
|--------|--------------|----------|
| **B1** | **Distinct beneficiary / next-of-kin step matching Master §21** (name, relationship, **ID/passport**, **phone**, **address**, **percentage/share**) as part of onboarding | Register has **emergency contact** only (aligns with online PDF §3: name, relationship, phone, alt — **no** ID, address, or %). Member `Family.tsx` later collects name, relationship, optional ID, cover tier — **no DOB, address, or percentage/share**, and it is not a registration step. |

---

## 4. Claims — genuine gaps

**None** for the fields you listed (nature≈claim type, amount, documents, admin verified-by / decision / approved amount / reason / payment ref & date).

See “Close — needs your decision” if you want label/status naming tightened.

---

## 5. About / Our Story — genuine gaps

**None** relative to the sections you listed (Why LUMA, five commitments, founding story, Our Story program list). Live About matches.

---

## 6. Overpromises / wording beyond the documents — **flag only (do not change)**

| Flag | Where | Why it may exceed / diverge from docs |
|------|--------|----------------------------------------|
| **O1** | Home package blurb: “Outpatient **cover**…” | Master warns against promising benefits outside approved schedules; “cover” can read insurance-like. Package title is already “Outpatient Hospital Support” (safer than “Hospital Insurance”). |
| **O2** | Home CTA: “Ready to Secure Your Family's Future?” | Marketing promise tone; docs emphasize mutual support under rules, not a secured “future.” |
| **O3** | Home / FAQ: **One-time KSh 300 activation fee** | Master §9 **proposed** renewal is **KSh 300 every two months** — different rule. Site uses one-time activation; not labeled as proposal. |
| **O4** | Home: “No hidden terms” | Acceptable only if package schedules/exclusions are fully published; Master says finalize schedules before benefit promises. |
| **O5** | Master governance note | Legal structure / regulated activities / insurance arrangements still framework-level — public “support” language should stay non-guaranteed. |

---

## Close — needs your decision (present, not exact; **do not change in Stage 2 unless you approve**)

| Item | Current | Official | Decision needed |
|------|---------|----------|-----------------|
| Application number format | `LUMA-APP-YYYYMMDD-#####` | Form shows `LUMA-________________` | Keep stricter format vs change prefix? |
| Status casing | “Pending verification” | “Pending Verification” | Cosmetic only? |
| Claim “nature” | Labelled “Claim Type” + description | Paper “nature of claim” | Rename label only? |
| Decision labels | Approved / Rejected / richer workflow | APPROVED / DECLINED / PENDING | Keep richer statuses? |
| MoM UX | Parent + three **joinable** child package rows | “ONE package” with nested sub-categories | Keep current nesting model? |
| About program list | “Building & Land Support” (Our Story) | Master lists Building and Land separately | Keep Our Story wording on About? |
| Welfare age × family | Separate tiers (age bands + Nuclear + Extended) | Doc lists both dimensions without cross-product rule | Confirm pricing rules when both apply |
| Family on register vs portal | Portal after approval | Table on application PDF | Approve **R1** to add on register, or keep deferred? |

---

## Needs client confirmation (proposed / not final — do not silently enforce)

| Item | Source | Recommendation until confirmed |
|------|--------|--------------------------------|
| Late-payment deadline **10th of the month** | Master §9 (“proposed… subject to final approved rules”) | Leave out of hard enforcement; optional labeled proposal copy only if you approve |
| Renewal **KSh 300 every two months** | Master §9 (“Current proposed renewal”) | Conflicts with live one-time activation — confirm which is intended |
| **Non-refund** principle | Master §9 (only if adopted, must be clear before enrollment) | Do not hard-code; confirm adoption + wording |
| Final **package benefit schedules** (payout caps, exclusions) | Master §8 | Required before stronger benefit promises on the site |
| How **Welfare age tiers and family tiers** combine | Master §8 lists both | Confirm matrix before any pricing UI change |

---

## Suggested Stage 2 approval checklist

Reply with which gap IDs to implement (additive only), e.g.:

- [ ] **R1** Family/dependant table on registration  
- [ ] **R2** How did you learn about LUMA  
- [ ] **R3** Fee / contribution / payment summary fields on registration (display only vs collect payment)  
- [ ] **R4** Show Application Number + Pending Verification on immediate post-submit screen  
- [ ] **B1** Distinct beneficiary step (ID, address, %/share)  
- [ ] Any **Close** items to adjust  
- [ ] Any **O\*** overpromise flags to address (you decide wording)  
- [ ] Any **proposed rules** to surface as labeled admin settings  

**Stop here — waiting for your go-ahead before any Stage 2 code.**
