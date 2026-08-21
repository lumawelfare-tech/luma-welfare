# Open items for Luma (build spec Section 9)

Luma's own printed materials disagree with each other. Nothing on this list was
silently resolved. The platform is built to be configurable enough to absorb
whichever version turns out correct. These same items are surfaced in the admin
dashboard under "Open questions for Luma" (`open_questions` table).

## 1. Package count

Flyers list 12, 13 or 14 packages depending on the sheet. Some add: Pastors
Support, Event Launch, Initiation Ceremony, Water Drilling, Baby Shower,
Ordination Ceremony, Toilets, Mandatory Welfare for 18+.

**Decision taken:** build against the confirmed 12-package table from the spec.
The admin panel can add or retire packages without a redeploy, so the extra
packages can be added in minutes once confirmed.

## 2. Payout structure

Two different benefit models appear in print:

- Flat KSh 100,000 for every package after six months, regardless of how much
  was contributed.
- Tied to amount paid in: KSh 1,000 → 20,000, KSh 2,000 → 40,000, KSh 5,000 →
  100,000.

**Decision taken:** neither is implemented. Payout calculation is a
configurable per-package rule (`packages.payout_rule`, JSONB). Either model can
be dropped in by editing the rule. Until Luma confirms, no payout figure is
published anywhere.

## 3. Renewal terms

Some flyers mention "renew every 2 months with 300" with no equivalent on the
detailed package sheet.

**Decision taken:** unimplemented, pending confirmation.

## 4. Contact details

Older flyers show phone 0700 000 000 and a `.org` email domain.

**Decision taken:** the current set from the spec is used (0798635024,
info@lumawelfare.or.ke, P.O. Box 12345 – 00100 Nairobi,
www.lumawelfare.or.ke). Contact details live in `platform_settings.org_contact`
and can be updated without a redeploy once Luma confirms.

## 5. Membership and claims figures

Marketing materials claim 12,000+ members and 10,000+ claims against a
confirmed 150 members.

**Decision taken:** the confirmed 150 is used everywhere. `successful_claims`
and `lives_touched` in `platform_settings.stats` are `null` until Luma
confirms real numbers. The stats bar renders them as "awaiting confirmation"
rather than inventing figures. Any future "lives touched" figure should be
derived from actual data, not marketing copy.

## Status

All items are `open` in the `open_questions` table. Resolve them in the admin
panel (`/admin` → open questions) as Luma answers.