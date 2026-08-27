# LUMA WELFARE — DEPLOYMENT CHECKLIST & OPERATIONS

## Pre-Deployment Checklist

### Code Quality
- [ ] TypeScript passes (`npx tsc --noEmit`)
- [ ] Lint passes (`npm run lint`)
- [ ] Build passes (`npm run build`)
- [ ] No new security warnings
- [ ] No console.log statements with sensitive data

### Database
- [ ] Migration reviewed for destructive operations
- [ ] Migration tested on staging
- [ ] Indexes verified (no unnecessary duplicates)
- [ ] RLS policies verified
- [ ] Foreign key constraints intact
- [ ] No production data loss risk

### Security
- [ ] No secrets exposed in frontend code
- [ ] RLS enabled on all new tables
- [ ] Service role key not exposed to client
- [ ] M-Pesa credentials not logged
- [ ] Authentication flow tested
- [ ] Authorization checks verified

### Financial
- [ ] Payment flow tested end-to-end
- [ ] Idempotency verified (no duplicate credits)
- [ ] Callback handling tested
- [ ] Reconciliation logic verified

### Testing
- [ ] Login flow tested
- [ ] Member dashboard tested
- [ ] Admin dashboard tested
- [ ] Claims workflow tested
- [ ] Contribution recording tested
- [ ] Export functionality tested
- [ ] Mobile responsive verified

---

## Deployment Steps

### 1. Frontend (Vercel)
```bash
# Vercel auto-deploys on push to main
# Or manually:
vercel --prod
```

### 2. Database Migrations
```bash
# Apply migrations
supabase db push

# Or via Supabase Dashboard → SQL Editor
```

### 3. Edge Functions
```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy member-dashboard
```

### 4. Post-Deployment Verification
```bash
# Health check
curl https://<project>.supabase.co/functions/v1/health?detail=true

# Admin monitoring
curl -H "Authorization: Bearer <token>" https://<project>.supabase.co/functions/v1/admin-monitoring
```

---

## Rollback Procedures

### Frontend Rollback (Vercel)
1. Go to Vercel Dashboard → Project → Deployments
2. Find the last working deployment
3. Click "..." → "Promote to Production"

### Edge Function Rollback
1. Revert the function file to previous version
2. Deploy: `supabase functions deploy <function-name>`
3. Verify function works

### Database Rollback
1. **NEVER** delete migration files
2. Create a new migration that reverses the change
3. Test on staging first
4. Apply to production

---

## SLO Definitions

### Availability
| Service | Target | Measurement |
|---------|--------|-------------|
| Member Dashboard | 99.9% | Uptime / month |
| Admin Dashboard | 99.5% | Uptime / month |
| Payment Processing | 99.9% | Successful callbacks |
| Export System | 99.0% | Jobs eventually complete |

### Latency
| Endpoint | P50 Target | P95 Target | P99 Target |
|----------|-----------|-----------|-----------|
| member-dashboard | <200ms | <500ms | <1s |
| admin-dashboard | <300ms | <800ms | <2s |
| admin-members (search) | <150ms | <400ms | <800ms |
| admin-contributions | <150ms | <400ms | <800ms |
| admin-claims | <150ms | <400ms | <800ms |
| payments-initiate | <500ms | <1s | <2s |
| payments-callback | <300ms | <800ms | <2s |

### Error Rate
| Category | Target |
|----------|--------|
| Application errors (5xx) | <1% |
| Payment failures | <5% |
| Export failures | <2% |
| Authentication failures | <1% |

### Financial Integrity
| Metric | Target |
|--------|--------|
| Duplicate payments | 0 |
| Missing contributions after payment | 0 |
| Reconciliation exceptions | <0.1% |

---

## 500K Operations Model

### At 100K Users
| Resource | Expected | Action |
|----------|----------|--------|
| Database size | ~2GB | Monitor growth |
| Monthly active | 20K | Baseline |
| Daily active | 3K | Baseline |
| Peak concurrent | 150 | Monitor |
| Peak RPS | ~12 | Monitor |
| Notifications/month | ~200K | Monitor |
| Exports/month | ~500 | Monitor |

### At 250K Users
| Resource | Expected | Action |
|----------|----------|--------|
| Database size | ~5GB | Review indexes |
| Monthly active | 50K | Monitor |
| Daily active | 7.5K | Monitor |
| Peak concurrent | 375 | Monitor |
| Peak RPS | ~30 | Monitor |
| Notifications/month | ~500K | Consider retention |
| Exports/month | ~1K | Monitor worker |

### At 500K Users
| Resource | Expected | Action |
|----------|----------|--------|
| Database size | ~10GB | Review partitioning |
| Monthly active | 100K | Monitor |
| Daily active | 15K | Monitor |
| Peak concurrent | 750 | Monitor connections |
| Peak RPS | ~60 | Monitor Edge Functions |
| Notifications/month | ~1M | Implement retention |
| Exports/month | ~2K | Monitor worker capacity |

### Infrastructure Thresholds
| Threshold | Trigger | Action |
|-----------|---------|--------|
| Database > 10GB | At ~500K users | Review partitioning |
| Notifications > 2M | At ~500K users | Implement retention |
| Audit logs > 5M | At ~500K users | Implement archival |
| Export queue > 50 | Any time | Scale worker |
| Payment failure rate > 5% | Any time | Investigate immediately |
| Error rate > 1% | Any time | Investigate immediately |

---

## Monitoring Schedule

### Daily (Automated)
- [ ] Health endpoint check
- [ ] Payment success rate
- [ ] Export worker status
- [ ] Error rate

### Weekly (Manual)
- [ ] Review audit logs for anomalies
- [ ] Check reconciliation exceptions
- [ ] Review SLO compliance
- [ ] Database growth trend

### Monthly (Manual)
- [ ] Review index usage
- [ ] Check notification retention
- [ ] Review export storage
- [ ] Cost monitoring review

---

## Emergency Contacts

| Role | Contact | Availability |
|------|---------|-------------|
| Supabase Support | support@supabase.com | 24/7 (Pro tier) |
| Vercel Support | support@vercel.com | 24/7 |
| M-Pesa Support | Safaricom portal | Business hours |
| Luma Welfare Admin | [Internal] | Business hours |

---

## Incident Response

### Severity Levels
| Level | Description | Response Time |
|-------|-------------|---------------|
| P0 | Financial corruption, security breach, total outage | Immediate |
| P1 | Major feature unavailable | <1 hour |
| P2 | Limited functionality affected | <4 hours |
| P3 | Non-critical issue | <24 hours |

### Response Procedure
1. **Detect** — Monitoring alert or user report
2. **Classify** — Determine severity level
3. **Investigate** — Check logs, metrics, database
4. **Contain** — Minimize impact (disable feature, not whole app)
5. **Recover** — Fix the issue
6. **Verify** — Confirm system is healthy
7. **Document** — Record timeline, cause, fix
