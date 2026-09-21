# ODPC registration checklist (Kenya)

**For operators / counsel — blanks intentional. Not legal advice.**

Use this when deciding whether and how to register as a data controller (and processor, if applicable) with the Office of the Data Protection Commissioner under the Data Protection Act, 2019.

## A. Entity identity

| Item | Value (fill in) |
|------|-----------------|
| Legal entity name | _______________________________ |
| Trading / brand name | Luma Welfare (confirm) |
| Registration type (company / society / NGO / other) | _______________________________ |
| Registration number | _______________________________ |
| Physical / registered address | _______________________________ |
| Postal address (if any) | _______________________________ |
| Primary contact email | _______________________________ |
| Primary contact phone | _______________________________ |

## B. Data protection contacts

| Item | Value (fill in) |
|------|-----------------|
| Data Protection Officer (if appointed) — name | _______________________________ |
| DPO email / phone | _______________________________ |
| Privacy contact (if different from DPO) | _______________________________ |
| Person responsible for ODPC filings | _______________________________ |

## C. Processing overview (attach counsel memo)

| Question | Notes / answer |
|----------|----------------|
| Purposes of processing | Membership, contributions, claims, support, security |
| Categories of data subjects | Members, family contacts, admins, website visitors (contact form) |
| Categories of personal data | See `docs/DATA_INVENTORY.md` |
| Sensitive / special categories? | ID numbers, health-related claim evidence — confirm classification |
| Recipients / processors | Supabase, Vercel, Resend, Sentry (optional), Google OAuth (optional) |
| Cross-border transfers | Confirm hosting regions for each processor |
| Retention schedule | Confirm vs coded cleanup jobs |
| Security measures summary | HTTPS, RLS, RBAC, audit logs, scrubbing |

## D. Registration artefacts

| Artefact | Status |
|----------|--------|
| ODPC registration application / certificate | ☐ Not started ☐ Submitted ☐ Issued |
| ODPC registration number | _______________________________ |
| Date issued / renewed | _______________________________ |
| DPIA completed (if required) | ☐ Yes ☐ No ☐ N/A — date: ________ |
| Internal privacy policy approved | ☐ Draft ☐ Counsel approved ☐ Published |
| Terms approved | ☐ Draft ☐ Counsel approved ☐ Published |

## E. After registration (ops)

| Task | Owner | Done |
|------|-------|------|
| Paste ODPC number into `frontend/src/config/legal.ts` | | ☐ |
| Set `draftPendingLegalReview: false` after counsel OK | | ☐ |
| Publish / notify members of final versions | | ☐ |
| Train admins on deletion-request handling | | ☐ |
| Calendar reminder for registration renewal | | ☐ |

## F. Links

- Legal review packet: `docs/LEGAL_REVIEW_PACKET.md`
- Engineering inventory: `docs/DATA_INVENTORY.md`
- Public drafts: `/privacy`, `/terms`
