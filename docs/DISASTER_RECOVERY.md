# LUMA WELFARE — DISASTER RECOVERY PLAN

## Overview

This document outlines the disaster recovery procedures for Luma Welfare.
It covers database outages, storage failures, payment provider outages, and application deployment failures.

---

## Scenario 1: Database Outage

### Impact
- All user-facing features unavailable
- No data loss (if backup is current)
- Payment processing suspended

### Response Procedure
1. **Immediate (0-5 min)**
   - Check Supabase status page: status.supabase.com
   - Verify database connectivity from multiple points
   - Check if issue is project-specific or Supabase-wide

2. **Short-term (5-30 min)**
   - If Supabase-wide: Monitor status page, notify users
   - If project-specific: Contact Supabase support
   - Enable maintenance mode on frontend if prolonged

3. **Recovery (30 min - 2 hours)**
   - Supabase restores from automatic backup
   - Verify data integrity post-restore
   - Test all critical functionality
   - Resume normal operations

4. **Post-incident**
   - Document timeline and impact
   - Review backup freshness
   - Consider upgrading to Pro tier for PITR

### Data Loss Risk
- With daily backups: Maximum 24 hours data loss
- With PITR (Pro tier): Maximum 5 minutes data loss

---

## Scenario 2: Storage Failure

### Impact
- File uploads unavailable
- Existing file downloads may fail
- Export functionality affected

### Response Procedure
1. **Immediate (0-5 min)**
   - Check Supabase Storage status
   - Verify bucket policies
   - Check storage quotas

2. **Short-term (5-30 min)**
   - If temporary: Wait for recovery
   - If persistent: Contact Supabase support
   - Disable file upload features if needed

3. **Recovery**
   - Supabase restores storage from backup
   - Verify file integrity
   - Re-upload any failed uploads
   - Regenerate signed URLs if needed

### Prevention
- Regular backup of critical files
- Monitor storage usage
- Implement file size limits

---

## Scenario 3: Payment Provider (M-Pesa) Outage

### Impact
- New payments cannot be initiated
- Existing payments still process normally
- No data loss

### Response Procedure
1. **Immediate (0-5 min)**
   - Check M-Pesa/Daraja API status
   - Verify callback endpoint is reachable
   - Check if issue is sandbox or production

2. **Short-term (5-30 min)**
   - If M-Pesa-wide: Notify users of temporary issue
   - If configuration issue: Verify credentials and settings
   - Enable graceful degradation

3. **Graceful Degradation**
   - Users can still log in and view data
   - Users can view contribution history
   - Users can view packages
   - Only payment initiation is affected

4. **Recovery**
   - Monitor M-Pesa status
   - When available, resume normal operations
   - Process any pending payments

### Prevention
- Implement payment retry mechanism
- Monitor payment success rates
- Maintain M-Pesa sandbox for testing

---

## Scenario 4: Application Deployment Failure

### Impact
- Frontend may be unavailable or broken
- Edge Functions may be affected
- No data loss

### Response Procedure
1. **Immediate (0-5 min)**
   - Check Vercel deployment status
   - Check Supabase Edge Function deployment status
   - Identify which component failed

2. **Rollback (5-15 min)**
   - **Vercel Frontend:**
     1. Go to Vercel dashboard → Deployments
     2. Find last working deployment
     3. Click "..." → "Promote to Production"
   - **Edge Functions:**
     1. Revert function file to previous version
     2. Run `supabase functions deploy <function-name>`
     3. Verify function works

3. **Database Migration Rollback**
   - If migration caused issue:
     1. Create reverse migration
     2. Test on staging first
     3. Apply to production
   - **NEVER** delete migration files

4. **Verification**
   - Test all critical user journeys
   - Verify payment processing
   - Check admin functionality

### Prevention
- Test all changes on staging first
- Use feature flags for risky changes
- Implement rollback procedures before deployment

---

## Scenario 5: Security Incident

### Impact
- Potential data breach
- Financial loss
- Reputation damage

### Response Procedure
1. **Immediate (0-15 min)**
   - **DO NOT** panic or make hasty changes
   - Document what you observe
   - Isolate affected systems if possible

2. **Containment (15-60 min)**
   - Disable compromised accounts
   - Freeze affected financial transactions
   - Block suspicious IP addresses
   - Enable maintenance mode if needed

3. **Investigation (1-24 hours)**
   - Review audit logs
   - Check for unauthorized access
   - Identify scope of breach
   - Preserve evidence

4. **Recovery (24-72 hours)**
   - Rotate all secrets and credentials
   - Restore from clean backup if needed
   - Fix vulnerability
   - Notify affected users
   - Update security measures

5. **Post-incident**
   - Document timeline and impact
   - Conduct security review
   - Implement additional safeguards
   - Update incident response plan

### Prevention
- Regular security audits
- Keep dependencies updated
- Implement rate limiting
- Monitor for suspicious activity

---

## Contact Information

| Role              | Contact                    |
|-------------------|----------------------------|
| Supabase Support  | support@supabase.com       |
| Vercel Support    | support@vercel.com         |
| M-Pesa Support    | Via Safaricom portal       |
| Luma Welfare Admin| [Internal contact]         |

---

## Testing Schedule

| Test                    | Frequency | Last Tested |
|-------------------------|-----------|-------------|
| Backup restore          | Monthly   | [Date]      |
| Rollback procedure      | Quarterly | [Date]      |
| Security incident drill | Annually  | [Date]      |
| Payment failure drill   | Quarterly | [Date]      |

---

## RPO/RTO Targets

| Metric                          | Target    |
|---------------------------------|-----------|
| Recovery Point Objective (RPO)  | 24 hours  |
| Recovery Time Objective (RTO)   | 2 hours   |
| Maximum Tolerable Downtime (MTD)| 4 hours   |

### Notes
- RPO can be improved to 5 minutes with Supabase Pro tier (PITR)
- RTO depends on Supabase restore speed and issue complexity
- MTD is based on business impact assessment
