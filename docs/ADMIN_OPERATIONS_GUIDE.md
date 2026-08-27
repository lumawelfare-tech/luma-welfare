# LUMA WELFARE — ADMIN OPERATIONS GUIDE

## Overview

This guide covers daily operations for Luma Welfare administrators. It is designed for staff who manage members, subscriptions, contributions, claims, and system health.

---

## 1. System Health Monitoring

### Quick Health Check

Access the admin dashboard at `https://luma-welfare.vercel.app/admin` to see:

- **System Status**: Overall health indicator
- **Database**: Table row counts
- **Payments**: Success rate, pending, failed
- **Exports**: Queue status, stale jobs
- **Security**: Failed auth, high-risk actions

### Health States

| State | Meaning | Action |
|-------|---------|--------|
| 🟢 Healthy | All systems operating normally | No action needed |
| 🟡 Warning | Degraded performance | Investigate, monitor |
| 🔴 Critical | Immediate action required | Follow incident runbook |

---

## 2. Member Management

### Viewing Members

Navigate to **Admin → Members** to:

- Search by name, email, phone, or membership number
- Filter by status (active, inactive, suspended, closed)
- View member details including subscriptions and contributions

### Member Status Actions

| Action | When to Use | Audit Logged |
|--------|-------------|:------------:|
| Activate | Member paid registration fee | ✅ |
| Suspend | Policy violation, investigation | ✅ |
| Close | Member requested termination | ✅ |
| Reactivate | Suspended member cleared | ✅ |

### Important Rules

- **Never delete member records** — use soft-delete (status = 'closed')
- **Always log audit entries** for status changes
- **Verify identity** before making sensitive changes
- **Check contribution history** before closing an account

---

## 3. Subscription Management

### Viewing Subscriptions

Navigate to **Admin → Subscriptions** to:

- View all active subscriptions
- Filter by package, status, or date
- See subscription history for individual members

### Subscription Lifecycle

```
Pending → Active → Expired
                → Cancelled
```

### Common Operations

| Operation | Steps |
|-----------|-------|
| View subscription | Click subscription row |
| Check status | Review status badge |
| View contributions | Click "Contributions" link |
| View claim history | Click "Claims" link |

---

## 4. Contribution Management

### Viewing Contributions

Navigate to **Admin → Contributions** to:

- Search by member, package, or period
- Filter by status (paid, pending, failed)
- Export contribution data

### Contribution Verification

When a payment is received:

1. Payment callback creates payment record
2. `process_payment_callback` RPC creates contribution
3. Contribution status set to "Paid"
4. Financial ledger entry created

### Reconciliation

If a contribution appears missing:

1. Check `admin-reconciliation?action=orphan-payments`
2. Check `admin-reconciliation?action=stale-pending`
3. Link orphan payments manually if needed
4. Always log audit entry for manual changes

---

## 5. Claims Management

### Viewing Claims

Navigate to **Admin → Claims** to:

- View all claims by status
- Filter by member, package, or date
- See claim documents

### Claim Lifecycle

```
Submitted → Under Review → Approved → Paid
                          → Rejected
                          → Info Needed
```

### Processing a Claim

1. **Review**: Check claim details, documents, member eligibility
2. **Decision**: Approve, reject, or request more information
3. **Record**: Log decision with reason
4. **Notify**: System sends notification to member

### Important Rules

- **Always verify eligibility** before approving
- **Check waiting period** has been met
- **Verify contribution history** meets requirements
- **Log all decisions** with clear reasoning
- **Never approve claims for suspended members**

---

## 6. Payment Monitoring

### Payment Statuses

| Status | Meaning |
|--------|---------|
| Pending | STK push initiated, awaiting callback |
| Completed | Payment verified and recorded |
| Failed | Payment failed or was rejected |
| Reversed | Payment was reversed |

### Common Issues

| Issue | Diagnosis | Resolution |
|-------|-----------|------------|
| Payment pending >30 min | Check callback logs | Mark as failed or wait |
| Payment not reflected | Check `payments` table | Verify with M-Pesa portal |
| Duplicate payment | Check `mpesa_receipt` uniqueness | System prevents duplicates |

### Reconciliation Queue

Access via **Admin → Reconciliation**:

- **Orphan Payments**: Completed payments without contributions
- **Unmatched Contributions**: Contributions without linked payments
- **Stale Pending**: Pending payments >30 minutes
- **Exceptions**: Items requiring manual review

---

## 7. Package Management

### Viewing Packages

Navigate to **Admin → Packages` to:

- View all welfare packages
- See subscription counts per package
- View package rules and pricing

### Package Lifecycle

```
Draft → Active → Inactive
```

### Common Operations

| Operation | Steps |
|-----------|-------|
| Create package | Fill form with name, pricing, rules |
| Edit package | Modify pricing, rules, description |
| Deactivate | Set status to inactive (existing subscriptions continue) |

---

## 8. Reports & Exports

### Available Reports

| Report | Purpose |
|--------|---------|
| Member Growth | New members over time |
| Contribution Summary | Total contributions by period |
| Claims Report | Claims by status and amount |
| Financial Summary | Income, expenses, balance |
| Package Performance | Subscriptions and contributions per package |

### Generating Exports

1. Navigate to **Admin → Exports**
2. Select report type and parameters
3. Click "Generate Export"
4. Wait for processing (check queue status)
5. Download when complete

### Export Limits

- Maximum concurrent exports: 2 per admin
- Maximum exports per hour: 10 per admin
- Maximum global concurrent: 10

---

## 9. Notification Management

### Sending Notifications

Navigate to **Admin → Notifications** to:

- Send announcements to all members
- Send targeted notifications to specific members
- View notification history

### Notification Types

| Type | Delivery |
|------|----------|
| In-app | Always delivered (member cannot disable) |
| Email | Only if member has email enabled |
| SMS | Only if member has SMS enabled (future) |

---

## 10. Audit Logs

### Viewing Audit Logs

Navigate to **Admin → Audit Logs` to:

- See all system actions with timestamps
- Filter by actor, action, resource, or date
- View action details and metadata

### Important Actions Logged

| Category | Actions |
|----------|---------|
| Authentication | login, logout, registered |
| Member | created, updated, suspended, closed |
| Subscription | created, activated, expired, cancelled |
| Contribution | verified, rejected |
| Claim | submitted, approved, rejected, paid |
| Payment | initiated, completed, failed, marked_failed |
| Package | created, updated, activated, deactivated |
| Settings | updated |

### What is NOT Logged

- Passwords
- API keys
- Tokens
- Personal financial details

---

## 11. Security Operations

### Daily Security Checks

1. Review `admin-monitoring?action=security`
2. Check for unusual failed auth attempts
3. Review high-risk admin actions
4. Verify no unauthorized access

### If You Suspect a Security Issue

1. **Do not panic** — follow the incident runbook
2. **Document** what you observe
3. **Isolate** the affected feature if possible
4. **Escalate** to technical lead immediately
5. **Preserve** audit logs — do not delete anything

---

## 12. Daily Operations Checklist

### Morning (Start of Day)

- [ ] Check system health dashboard
- [ ] Review overnight payment status
- [ ] Check reconciliation exceptions
- [ ] Review export queue
- [ ] Check for failed notifications

### During Day

- [ ] Monitor claim submissions
- [ ] Process pending approvals
- [ ] Review member inquiries
- [ ] Check payment callbacks

### End of Day

- [ ] Review daily summary
- [ ] Check for stale jobs
- [ ] Verify exports completed
- [ ] Note any issues for tomorrow

---

## 13. Emergency Procedures

### System Down

1. Check health endpoint
2. Check Supabase dashboard
3. Check Vercel dashboard
4. Follow §1 in PRODUCTION_RUNBOOK.md

### Payment Issue

1. Check payment status in database
2. Verify with M-Pesa portal if needed
3. Follow §3 in PRODUCTION_RUNBOOK.md

### Security Incident

1. Do not make hasty changes
2. Document everything
3. Follow §7 in PRODUCTION_RUNBOOK.md
4. Escalate immediately

---

## 14. Contact Information

| Role | Contact |
|------|---------|
| Technical Lead | [Internal contact] |
| Supabase Support | support@supabase.com |
| Vercel Support | support@vercel.com |
| M-Pesa Support | Via Safaricom portal |

---

## 15. Additional Resources

| Document | Purpose |
|----------|---------|
| PRODUCTION_RUNBOOK.md | Incident response procedures |
| PHASE14_DISASTER_RECOVERY.md | Disaster recovery plan |
| MEMBER_SUPPORT_GUIDE.md | Member-facing help documentation |
| DEPLOYMENT_CHECKLIST.md | Deployment procedures |
