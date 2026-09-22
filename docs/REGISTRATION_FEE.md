# Registration fee configuration

**Current official fee:** KES **300** (one-time membership activation).

## Authoritative source

| Key | Store | Shape |
|-----|--------|--------|
| `registration_fee` | `platform_settings.value` (jsonb) | `{ "amount": 300, "currency": "KES" }` |

Edge Functions load this via `supabase/functions/shared/registration-fee.ts` (`loadRegistrationFeeConfig`).

- **Fail closed:** missing / malformed / wrong currency → registration and fee initiation return `503` / `REGISTRATION_FEE_CONFIG`. There is **no** silent fallback to `300`.
- **Client cannot set the fee:** browser-supplied fee amounts are ignored; only the settings value (or the member’s existing `registration_fees.amount` row for charge continuity) is used.
- **Historical rows:** existing `registration_fees` amounts are not rewritten when the setting changes. Admin UIs should display the amount on each fee record.
- **M-Pesa:** `PAYMENTS_ENABLED` remains `false` until Daraja go-live. Fee rows are created as `unpaid` (or `pending` when a member records intent while payments are off).

## Related migration

`supabase/migrations/20260922270000_registration_fee_platform_settings.sql`

## Out of scope (still blocked)

Full **R3** financial summary (monthly contribution + total due formulas) remains blocked pending business decisions. See `docs/ORG_DOCS_GAPS.md`.
