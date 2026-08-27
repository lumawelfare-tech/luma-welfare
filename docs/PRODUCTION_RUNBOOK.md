# LUMA WELFARE — PRODUCTION RUNBOOK

## Quick Reference

| Issue                    | Section |
|--------------------------|---------|
| Application outage       | §1      |
| Database issue           | §2      |
| Payment failure          | §3      |
| Export worker failure    | §4      |
| Storage issue            | §5      |
| Authentication issue     | §6      |
| Security incident        | §7      |
| Deployment rollback      | §8      |

---

## §1. Application Outage

### Symptoms
- Frontend returns 500/503
- Edge Functions timing out
- Users report "Something went wrong"

### Diagnosis
1. Check health endpoint: `GET /functions/v1/health`
2. Check Supabase dashboard → Edge Functions → Logs
3. Check Vercel dashboard → Deployments → Function Logs
4. Check database status in Supabase dashboard

### Common Causes
- **Edge Function cold start:** Normal after deploy. Wait 30s.
- **Database connection limit:** Check `get_connection_stats()` in database.
- **Memory limit exceeded:** Check Edge Function logs for OOM errors.
- **Deployment failure:** Check Vercel deployment status.

### Resolution
1. If cold start: Wait 30s, then re-test
2. If DB connection issue: Restart the project from Supabase dashboard
3. If OOM: Check for large payloads, reduce batch sizes
4. If deployment: Rollback to previous deployment (§8)

---

## §2. Database Issue

### Symptoms
- Queries timing out
- "Connection pool exhausted" errors
- Slow dashboard loads

### Diagnosis
1. Run `SELECT * FROM get_performance_summary();`
2. Run `SELECT * FROM get_connection_stats();`
3. Run `SELECT * FROM get_slow_queries();`
4. Check Supabase dashboard → Database → Query Performance

### Common Causes
- **Lock contention:** Long-running transactions blocking writes
- **Missing indexes:** Sequential scans on large tables
- **Connection pressure:** Too many concurrent requests
- **Bloat:** Dead tuples accumulating

### Resolution
1. **Lock contention:** Identify blocking query, consider `pg_terminate_backend()`
2. **Missing indexes:** Run `SELECT * FROM get_index_usage();` to find unused indexes
3. **Connection pressure:** Reduce concurrent requests, check rate limiting
4. **Bloat:** Run `VACUUM ANALYZE` on affected tables

---

## §3. Payment Failure

### Symptoms
- Members report payment not reflected
- M-Pesa callback not received
- Duplicate contribution records

### Diagnosis
1. Check `payments` table for the transaction:
   ```sql
   SELECT * FROM payments WHERE checkout_request_id = '...'
   ```
2. Check `webhook_events` table:
   ```sql
   SELECT * FROM webhook_events WHERE event_id LIKE '%...%' ORDER BY created_at DESC
   ```
3. Check `contributions` table for duplicates:
   ```sql
   SELECT subscription_id, period, COUNT(*)
   FROM contributions
   WHERE member_id = '...'
   GROUP BY subscription_id, period
   HAVING COUNT(*) > 1
   ```

### Common Causes
- **Callback not received:** M-Pesa network issue, check callback URL
- **Callback processed but contribution not created:** Check `process_payment_callback` result
- **Duplicate contribution:** Race condition (should be prevented by atomic function)

### Resolution
1. **Missing callback:** Manually verify payment via M-Pesa portal, update status
2. **Callback failed:** Check webhook_events for error, retry manually if needed
3. **Duplicate contribution:** Remove duplicate, log audit entry

---

## §4. Export Worker Failure

### Symptoms
- Export jobs stuck in "processing" state
- Export jobs failing repeatedly
- Worker not picking up new jobs

### Diagnosis
1. Check export job status:
   ```sql
   SELECT * FROM export_jobs WHERE status IN ('pending', 'processing') ORDER BY created_at
   ```
2. Check for stale jobs (processing > 10 minutes):
   ```sql
   SELECT * FROM export_jobs
   WHERE status = 'processing'
   AND started_at < now() - interval '10 minutes'
   ```
3. Check worker logs in Supabase Edge Function logs

### Resolution
1. **Stale jobs:** Run `SELECT recover_stale_export_jobs();`
2. **Failed jobs:** Check error_message, fix issue, reset status to 'pending'
3. **Worker not running:** Trigger worker manually via cron or HTTP request

---

## §5. Storage Issue

### Symptoms
- File uploads failing
- Download URLs not working
- Storage quota exceeded

### Diagnosis
1. Check Supabase dashboard → Storage
2. Check bucket policies
3. Check file sizes and counts

### Resolution
1. **Upload failure:** Check bucket policies, verify file size limits
2. **Download failure:** Check signed URL expiry, regenerate if needed
3. **Quota exceeded:** Clean up old exports, increase quota if needed

---

## §6. Authentication Issue

### Symptoms
- Users cannot log in
- Session expired errors
- 2FA issues

### Diagnosis
1. Check Supabase dashboard → Authentication → Users
2. Check Edge Function logs for auth errors
3. Verify JWT expiry settings

### Resolution
1. **Login failure:** Check user status, verify credentials
2. **Session expired:** Check JWT expiry, refresh token rotation
3. **2FA issues:** Verify TOTP secret, check recovery codes

---

## §7. Security Incident

### Immediate Response
1. **DO NOT** panic or make hasty changes
2. **Document** what you observe (timestamps, affected users, actions taken)
3. **Isolate** if possible (disable affected feature, not the whole app)

### Investigation
1. Check audit logs:
   ```sql
   SELECT * FROM audit_logs
   WHERE created_at > now() - interval '24 hours'
   ORDER BY created_at DESC
   ```
2. Check for unauthorized access:
   ```sql
   SELECT * FROM audit_logs
   WHERE action LIKE '%admin%' OR action LIKE '%role%' OR action LIKE '%delete%'
   ORDER BY created_at DESC
   ```
3. Check for financial anomalies:
   ```sql
   SELECT * FROM payments WHERE status = 'Completed'
   AND created_at > now() - interval '24 hours'
   ORDER BY created_at DESC
   ```

### Containment
1. If compromised admin: Disable admin account immediately
2. If payment manipulation: Freeze affected payments
3. If data breach: Notify affected users, document scope

### Recovery
1. Rotate all secrets (API keys, service role key)
2. Review and fix vulnerability
3. Restore from backup if data corrupted
4. Update security measures

---

## §8. Deployment Rollback

### Vercel Frontend
1. Go to Vercel dashboard → Project → Deployments
2. Find the last working deployment
3. Click "..." → "Promote to Production"

### Supabase Edge Functions
1. Revert the function file to previous version
2. Deploy: `supabase functions deploy <function-name>`
3. Verify function works correctly

### Database Migration Rollback
1. **NEVER** drop a migration file
2. Create a new migration that reverses the change
3. Test the rollback migration on staging first
4. Apply to production

---

## Monitoring Checklist (Daily)

- [ ] Check health endpoint: `GET /functions/v1/health?detail=true`
- [ ] Check admin monitoring: `GET /functions/v1/admin-monitoring`
- [ ] Review error logs in Supabase dashboard
- [ ] Check export job status
- [ ] Verify payment processing
- [ ] Review audit logs for anomalies

---

## Emergency Contacts

| Role              | Contact                    |
|-------------------|----------------------------|
| Supabase Support  | support@supabase.com       |
| Vercel Support    | support@vercel.com         |
| M-Pesa Support    | Via Safaricom portal       |
| Luma Welfare Admin| [Internal contact]         |

---

## Backup & Recovery

### Supabase Backups
- **Automatic backups:** Daily, retained for 7 days (Free tier)
- **Point-in-time recovery:** Available on Pro tier and above
- **Manual backup:** Use `pg_dump` via Supabase CLI

### Recovery Procedure
1. Identify the backup to restore from
2. Contact Supabase support for restore (if needed)
3. Verify data integrity after restore
4. Test all critical functionality
5. Monitor for issues

### RPO (Recovery Point Objective)
- With daily backups: Maximum 24 hours data loss
- With PITR (Pro tier): Maximum 5 minutes data loss

### RTO (Recovery Time Objective)
- Edge Functions: < 5 minutes (auto-recover)
- Database: < 30 minutes (Supabase restore)
- Full application: < 1 hour
