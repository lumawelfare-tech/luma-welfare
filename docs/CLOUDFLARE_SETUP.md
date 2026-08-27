# Cloudflare WAF, CDN & DDoS Protection — Setup Guide

## Overview

This guide configures Cloudflare as a reverse proxy for Luma Welfare, providing:
- **DDoS mitigation** — Automatic L3/L4/L7 DDoS protection
- **WAF (Web Application Firewall)** — OWASP Top 10 rule sets
- **Bot protection** — Mitigates credential stuffing, scraping, spam
- **CDN** — Global edge caching for static assets
- **SSL/TLS** — Free SSL certificate, HTTPS enforcement
- **Rate limiting** — Edge-level rate limiting before requests reach the origin

---

## 1. DNS Setup

### Add DNS Records

In Cloudflare Dashboard → DNS → Records:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|:-----:|-----|
| A | @ | Vercel IP (from Vercel dashboard) | ✅ Proxied | Auto |
| CNAME | www | luma-welfare.vercel.app | ✅ Proxied | Auto |
| CNAME | @ | luma-welfare.vercel.app | ✅ Proxied | Auto |

**Important:** Enable the orange cloud (Proxied) for all records that should go through Cloudflare.

### Update Vercel Domain

1. Vercel Dashboard → Project → Settings → Domains
2. Add `luma-welfare.vercel.app` (already configured)
3. Add custom domain if using one (e.g., `lumawelfare.or.ke`)
4. Vercel will auto-provision SSL

---

## 2. SSL/TLS Configuration

In Cloudflare Dashboard → SSL/TLS:

| Setting | Value |
|---------|-------|
| Encryption mode | **Full (Strict)** |
| Always Use HTTPS | **On** |
| HTTP Strict Transport Security (HSTS) | **On** — max-age=63072000 |
| TLS 1.3 | **On** |
| Automatic HTTPS Rewrites | **On** |
| Certificate | **Origin Server** (Vercel provides) |

---

## 3. Security Headers (Cloudflare Transform Rules)

In Cloudflare Dashboard → Rules → Transform Rules → Modify Response:

### Rule 1: Security Headers
**When:** `(http.host eq "luma-welfare.vercel.app")`

**Then:**
| Header | Value |
|--------|-------|
| X-Content-Type-Options | nosniff |
| X-Frame-Options | DENY |
| X-XSS-Protection | 0 |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload |

---

## 4. WAF Custom Rules

In Cloudflare Dashboard → Security → WAF → Custom Rules:

### Rule 1: Block Known Bad Bots
**Expression:**
```
(cf.bot_management.score lt 10)
and not cf.bot_management.verified_bot
and not cf.bot_management.static_resource
and http.request.uri.path ne "/health"
```
**Action:** Block

### Rule 2: Protect Payment Endpoints
**Expression:**
```
(http.request.uri.path contains "/functions/v1/payments-")
and not http.request.uri.path contains "/functions/v1/payments-callback"
and cf.threat_score gt 5
```
**Action:** Managed Challenge (CAPTCHA)

### Rule 3: Protect Auth Endpoints
**Expression:**
```
(http.request.uri.path contains "/functions/v1/auth-")
and (cf.threat_score gt 10 or http.request.rate.src.avg gt 15)
```
**Action:** Managed Challenge

### Rule 4: Block SQL Injection Attempts
**Expression:**
```
(cf.waf.sql_injection.score gt 5)
or (cf.waf.xss.score gt 5)
```
**Action:** Block

### Rule 5: Protect Admin Endpoints
**Expression:**
```
(http.request.uri.path contains "/functions/v1/admin-")
and not cf.bot_management.verified_bot
and cf.threat_score gt 3
```
**Action:** Managed Challenge

---

## 5. Rate Limiting Rules

In Cloudflare Dashboard → Security → WAF → Rate Limiting Rules:

### Rule 1: Login Brute Force Protection
**Expression:**
```
(http.request.uri.path contains "/functions/v1/auth-login")
and http.request.method eq "POST"
```
**Rate:** 10 requests / 60 seconds per IP
**Action:** Block for 600 seconds (10 minutes)
**Counting:** Per IP

### Rule 2: Payment Initiation Rate Limit
**Expression:**
```
(http.request.uri.path contains "/functions/v1/payments-initiate")
and http.request.method eq "POST"
```
**Rate:** 5 requests / 60 seconds per IP
**Action:** Block for 300 seconds (5 minutes)

### Rule 3: Registration Rate Limit
**Expression:**
```
(http.request.uri.path contains "/functions/v1/auth-register")
and http.request.method eq "POST"
```
**Rate:** 3 requests / 300 seconds per IP
**Action:** Block for 900 seconds (15 minutes)

### Rule 4: Export Rate Limit
**Expression:**
```
(http.request.uri.path contains "/functions/v1/admin-exports")
and http.request.method eq "GET"
```
**Rate:** 5 requests / 300 seconds per IP
**Action:** Block for 600 seconds

### Rule 5: General API Rate Limit
**Expression:**
```
(http.request.uri.path contains "/functions/v1/")
and not http.request.uri.path contains "/functions/v1/health"
and not http.request.uri.path contains "/functions/v1/public-data"
```
**Rate:** 100 requests / 60 seconds per IP
**Action:** Challenge

---

## 6. Bot Management

In Cloudflare Dashboard → Security → Bots:

| Setting | Value |
|---------|-------|
| Bot Fight Mode | **On** |
| Super Bot Fight Mode | **On** (if available on plan) |
| Definitely Automated | **Block** |
| Likely Automated | **Managed Challenge** |
| Verified Bots | **Allow** (Google, Bing, etc.) |
| Static Resource Protection | **Off** (allow caching) |

---

## 7. Page Rules (Cache Optimization)

In Cloudflare Dashboard → Rules → Page Rules:

### Rule 1: Cache Static Assets
**URL:** `luma-welfare.vercel.app/assets/*`
**Settings:**
| Setting | Value |
|---------|-------|
| Cache Level | Cache Everything |
| Edge Cache TTL | 1 month |
| Browser Cache TTL | 1 month |

### Rule 2: Cache Public API
**URL:** `luma-welfare.vercel.app/functions/v1/public-data*`
**Settings:**
| Setting | Value |
|---------|-------|
| Cache Level | Cache Everything |
| Edge Cache TTL | 5 minutes |
| Browser Cache TTL | 5 minutes |

### Rule 3: Don't Cache Authenticated
**URL:** `luma-welfare.vercel.app/functions/v1/*`
**Settings:**
| Setting | Value |
|---------|-------|
| Cache Level | Bypass |

---

## 8. DDoS Protection

In Cloudflare Dashboard → Security → DDoS:

| Setting | Value |
|---------|-------|
| HTTP DDoS Attack Protection | **Essential** (free) or **Advanced** (Pro) |
| L7 DDoS Sensitivity | **High** |
| Adaptive Rate Limiting | **On** (Pro+) |
| JavaScript Challenge Passage | **30 minutes** |

### Additional DDoS Settings

| Feature | Value |
|---------|-------|
| Under Attack Mode | **Off** (enable manually during attacks) |
| Security Level | **Medium** |
| Challenge Passage | **30 minutes** |
| Browser Integrity Check | **On** |

---

## 9. Firewall Access Rules

In Cloudflare Dashboard → Security → WAF → Tools:

### Allow Vercel Preview Deployments
**IP:** Vercel's IP ranges (check Vercel docs)
**Action:** Allow
**Notes:** Needed for Vercel preview deployments to work

### Block Known Attack Sources
Use Cloudflare's built-in threat intelligence — automatically blocks IPs from:
- Known botnets
- Spam sources
- Malware distribution

---

## 10. Supabase Edge Functions — Trust Cloudflare Headers

The rate limiter already handles `CF-Connecting-IP`. Verify the Edge Functions trust Cloudflare's headers:

### Rate Limiter IP Detection (Already Updated)
```typescript
// Priority: CF-Connecting-IP (Cloudflare real IP) > X-Forwarded-For > unknown
const ip = req.headers.get('cf-connecting-ip')
  ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  ?? 'unknown'
```

### CORS Configuration
The CORS origin should be updated if using a custom domain:
```bash
# Set in Supabase Edge Function environment
CORS_ALLOWED_ORIGIN=https://lumawelfare.or.ke
```

---

## 11. Monitoring & Alerting

In Cloudflare Dashboard → Analytics & Logs:

### Enable Logpush (Pro+)
Send Cloudflare logs to your preferred destination:
- **Logpush to Supabase Storage** — Store logs for analysis
- **Logpush to S3/GCS** — Long-term storage
- **Logpush to Datadog/Splunk** — SIEM integration

### Key Metrics to Monitor
| Metric | Threshold | Action |
|--------|-----------|--------|
| HTTP 5xx Rate | > 1% | Investigate origin |
| WAF Blocked Requests | Spike | Review rules |
| Rate Limited Requests | Spike | Check for attack |
| Bot Score Distribution | High automated | Review bot rules |
| Cache Hit Ratio | < 70% | Optimize caching |

---

## 12. Cost Estimate

| Feature | Free Tier | Pro ($20/mo) |
|---------|-----------|--------------|
| DDoS Protection | ✅ L3/L4/L7 | ✅ Advanced |
| WAF Rules | 5 custom | 25 custom |
| Rate Limiting | 1 rule | 10+ rules |
| Bot Fight Mode | ✅ Basic | ✅ Advanced |
| SSL | ✅ | ✅ |
| CDN | ✅ | ✅ Enhanced |
| Logpush | ❌ | ✅ |
| Image Optimization | ❌ | ✅ |

**Recommendation:** Start with **Free tier** for DDoS + basic WAF. Upgrade to **Pro** when:
- You need more than 5 custom WAF rules
- You need advanced bot management
- You need Logpush for security logging
- You need image optimization

---

## 13. Pre-Deployment Checklist

- [ ] Cloudflare account created
- [ ] Domain added to Cloudflare
- [ ] DNS records configured (proxied)
- [ ] SSL/TLS set to Full (Strict)
- [ ] Always HTTPS enabled
- [ ] WAF custom rules configured
- [ ] Rate limiting rules configured
- [ ] Bot management enabled
- [ ] Security headers configured
- [ ] Page rules for caching set
- [ ] DDoS protection verified
- [ ] CORS origin updated for custom domain
- [ ] Test: `curl -I https://luma-welfare.vercel.app` shows security headers
- [ ] Test: WAF blocks SQL injection attempts
- [ ] Test: Rate limiting works on auth endpoints
- [ ] Test: Bot protection blocks automated requests

---

## 14. Verification Commands

```bash
# Check security headers
curl -I https://luma-welfare.vercel.app

# Check SSL
curl -vI https://luma-welfare.vercel.app 2>&1 | grep -i "SSL connection"

# Test WAF (should be blocked)
curl -X POST "https://luma-welfare.vercel.app/functions/v1/auth-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test\" OR 1=1--"}'

# Test rate limiting (send 15 rapid requests)
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://luma-welfare.vercel.app/functions/v1/auth-login"
done

# Check Cloudflare headers in response
curl -sI "https://luma-welfare.vercel.app" | grep -i "cf-\|server"
```

---

## 15. Troubleshooting

### Issue: Vercel deployment fails after Cloudflare
**Cause:** Vercel can't verify domain ownership
**Fix:** Add CNAME verification record in Cloudflare DNS

### Issue: Rate limiting triggers on legitimate traffic
**Cause:** Too aggressive rate limits
**Fix:** Increase thresholds or use "Managed Challenge" instead of "Block"

### Issue: WebSocket connections fail
**Cause:** Cloudflare may block WebSocket upgrades
**Fix:** Enable WebSocket support in Cloudflare Network settings

### Issue: Realtime subscriptions fail
**Cause:** Cloudflare may interfere with Supabase Realtime
**Fix:** Add bypass rule for `*.supabase.co` WebSocket connections

### Issue: M-Pesa callbacks fail
**Cause:** Cloudflare blocks incoming webhooks
**Fix:** Add Cloudflare IP ranges to M-Pesa callback allowlist, or bypass Cloudflare for the callback endpoint
