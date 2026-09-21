# Legacy SQL archive (pre–Supabase-migrations)

These files are **reference-only**. They are not applied automatically.

**Authoritative schema source:** `supabase/migrations/`

| File | Notes |
|------|--------|
| `schema.sql` | Historical full-schema bootstrap used before timestamped migrations |
| `seed.sql` | Historical seed for packages, roles, rules, settings — use only for greenfield recovery if migrations alone do not seed data |
| Other `phase*.sql` / load-test SQL | Ops / load-test helpers from earlier phases |

Do not run these against production without reviewing against current migrations first.
