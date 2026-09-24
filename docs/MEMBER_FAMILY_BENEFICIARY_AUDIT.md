# Member profile, family & beneficiary — Phase 1 audit

**Date:** 24 Sep 2026  
**Rule:** Do not rebuild Luma. Payments / Daraja stay frozen (`PAYMENTS_ENABLED` must remain false).  
**Do not invent welfare eligibility rules.** Nuclear vs extended already exists as `family_members.tier` and package tiers.

---

## 1. Current architecture

| Need | Actual |
|------|--------|
| Profile | `members` (`id` = `auth.users.id`). No `profiles` table. |
| Family / beneficiaries | `family_members` only. No `beneficiaries` table. UI already calls them beneficiaries. |
| Contributions | `contributions` + `contribution_instalments` on the **principal** `member_id` / subscription. |
| Ledger | `financial_ledger` (members cannot read via RLS). |
| Org documents | `kb_documents` + private `kb-documents` bucket. |
| Claim evidence | `claim_documents` + private `claim-documents`. |
| Identity / KRA files | **Missing.** |
| KRA PIN | **Missing.** ID number is plaintext on `members.id_number`. |
| Notifications / audit / admins | Existing tables. |

Staff RBAC: `roles` / `permissions`. `members:read`, `members:reveal`, `documents:read|approve`. No `family` permission.

## 2. Reuse

- `member-profile`, `member-family`, `admin-members`, `admin-reveal-member-id`
- Magic-byte uploads (`shared/file-upload.ts`)
- 15-minute signed URLs (`shared/storage-signed.ts`)
- `IdRevealCell` + `maskIdNumberLast4`
- `StatusBadge`, Empty/Error states
- `sendNotification`, `logAudit`
- Existing `/contributions` + admin contribution verify (manual path while M-Pesa is off)
- `family_members.relationship` + `tier` (`nuclear` \| `extended`)

## 3. Missing

- National ID PDF + verification workflow
- KRA PIN (masked) + optional KRA certificate PDF
- Private `member-documents` bucket + metadata table
- Document versioning (supersede)
- Family POST field-name mismatch (`full_name` UI vs `fullName` API)
- Family edit, DOB, masked IDs, beneficiary status
- Admin member detail: identity docs, verify/reject, signed view, family IDs
- Per-beneficiary invoices — **not in current financial model** (cover is the member’s package)

## 4. Database changes

- `members.kra_pin` (nullable text)
- `family_members.beneficiary_status` (`pending` \| `active` \| `inactive` \| `rejected`)
- `family_members.phone` (optional)
- New `member_documents` (not a second KB or claims table)

No new `contributions` / `payments` tables.

## 5. Storage

- Private bucket `member-documents` (10MB, PDF only for identity)
- Service-role writes only; short-lived signed URLs
- Path `{member_id}/identity|tax|family/{uuid}.pdf`

## 6. RLS / security

- FORCE RLS on `member_documents`
- Member SELECT/INSERT own rows; cannot set verification fields
- Admin access via Edge + `requirePermission` (not a public policy)
- Mask `kra_pin` on admin lists; full PIN only via `members:reveal`
- Member A cannot read Member B documents (RLS + path ownership)

## 7. UI (member)

- Profile: ID PDF, KRA PIN (masked after save), KRA certificate, DOB, statuses
- Family: camelCase API, nuclear/extended groups, DOB, mask IDs, beneficiary status
- Family payments: **existing** contribution history (covers the member’s package / dependants). No Daraja.

## 8. Admin

- Member detail: family (tier + masked IDs), identity docs, verify/reject with reason
- View document → signed URL + `view_member_document` audit
- Contributions already on the detail drawer

## 9. Payments

**No Daraja / STK enablement.**  
“Pay for beneficiary” = pay the member’s own subscription (existing `/contributions`). Cover is nuclear/extended package, not a per-person invoice. Do not mark Paid from the client.

## 10. Testing

- Parser + mask unit tests
- Offline contracts for bucket / RLS / JWT
- Live RLS isolation when secrets exist
- No exploit PoCs

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Duplicate financial system | Reuse contributions only |
| Public document URLs | Private bucket + signed TTL |
| Support seeing full KRA | `members:reveal` + mask |
| Invented eligibility | Reuse existing relationship + tier values |
| Family POST silently drops names | Accept snake_case and camelCase |

## 12. Implementation phases (this increment = 2–8, 11)

1. Audit (this document)  
2–4. Migration, RLS, storage  
5. Profile ID + KRA  
6. Family management fix/enhance  
7–8. Beneficiary status + beneficiary docs  
11. Admin visibility + verify  
9–10. Payment **tracking UI only** (existing records)  
12–15. Notifications on verify/reject; tests; polish  

Daraja remains a separate GO.
