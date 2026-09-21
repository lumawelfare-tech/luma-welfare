# BACKUP_RESTORE — Backups and restore drill (Phase 4)

You run the restore drill yourself; this is the checklist and how the stack is expected to behave.

## How backups work (Supabase)

| Layer | Mechanism | Typical RPO |
|-------|-----------|-------------|
| Postgres | Supabase automatic daily backups (plan-dependent); Pro adds PITR | Daily ≈ 24h; PITR ≈ minutes |
| Storage (buckets) | Stored in project; restore with DB/project recovery procedures | Tied to project backup |
| Edge Function source | Git (this repo) | Last push |
| Frontend | Vercel deployments + git | Last good deploy |

Confirm your **exact** plan features in the Supabase dashboard (Backups / Point-in-time recovery). Free-tier limits may apply.

## What we do **not** back up here

- Local `.env` / operator secrets (use a password manager)
- M-Pesa provider state (payments disabled)

## Restore overview

1. **Decide scope**: table mistake vs full project vs storage-only.
2. **Prefer forward fix** (new migration) over destructive rollback when possible.
3. **Full restore**: Supabase dashboard → Database → Backups → Restore (or support-assisted). Expect downtime.
4. **After restore**:
   - Run `scripts/verify-security-lockdown.sql` / RLS inventory
   - Redeploy Edge Functions from git if code/schema mismatch
   - Smoke: health, login, one member read, one admin read
5. **Frontend**: promote last good Vercel deploy if the outage was app-side (`RUNBOOK.md`).

## Restore drill checklist (operator)

- [ ] Note current time and choose a non-production project **or** accepted prod window
- [ ] Confirm latest backup timestamp in Supabase UI
- [ ] Document which backup / PITR target you will use
- [ ] Snapshot critical row counts (members, contributions, claims) before restore
- [ ] Perform restore (or table-level recovery if offered)
- [ ] Re-check row counts and spot-check 2–3 known records
- [ ] Run health + membership smoke (`LAUNCH_CHECKLIST.md` subset)
- [ ] Record duration (RTO) and any data gap (RPO) in an incident note
- [ ] If drill on staging: destroy/reset staging as needed; never leave drill credentials in git

## Related

- `docs/DISASTER_RECOVERY.md` — broader scenarios  
- `docs/PHASE14_DISASTER_RECOVERY.md` — extended RPO/RTO discussion
