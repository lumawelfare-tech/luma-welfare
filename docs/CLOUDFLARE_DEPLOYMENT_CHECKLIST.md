# Cloudflare Deployment Checklist

## Pre-Deployment

### DNS Setup
- [ ] Cloudflare account created (Free tier)
- [ ] Domain added to Cloudflare (e.g., `lumawelfare.or.ke`)
- [ ] Nameservers updated at domain registrar
- [ ] DNS records added:
  - [ ] `A` record → Vercel IP (Proxied ✅)
  - [ ] `CNAME www` → `luma-welfare.vercel.app` (Proxied ✅)
- [ ] DNS propagation verified (`dig lumawelfare.or.ke`)

### SSL/TLS
- [ ] SSL mode set to **Full (Strict)**
- [ ] Always HTTPS enabled
- [ ] HSTS enabled (max-age=63072000)
- [ ] TLS 1.3 enabled
- [ ] Automatic HTTPS Rewrites enabled
- [ ] SSL certificate valid (check browser lock icon)

### Vercel Configuration
- [ ] Custom domain added in Vercel
- [ ] Vercel SSL provisioned
- [ ] Preview deployments accessible

---

## WAF Rules

### Custom Rules (5 rules on Free tier)
- [ ] Rule 1: Block known bad bots (threat_score > 50)
- [ ] Rule 2: Protect payment endpoints (managed challenge)
- [ ] Rule 3: Protect auth endpoints (managed challenge)
- [ ] Rule 4: Block SQL injection/XSS (WAF scores)
- [ ] Rule 5: Protect admin endpoints (managed challenge)

### Rate Limiting
- [ ] Login: 10 req/60s per IP → block 600s
- [ ] Payment: 5 req/60s per IP → block 300s
- [ ] Registration: 3 req/300s per IP → block 900s
- [ ] Export: 5 req/300s per IP → block 600s
- [ ] General API: 100 req/60s per IP → challenge

### Bot Management
- [ ] Bot Fight Mode enabled
- [ ] Definitely Automated → Block
- [ ] Likely Automated → Managed Challenge
- [ ] Verified Bots → Allow

---

## Security Headers

### Transform Rules (Modify Response)
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `X-XSS-Protection: 0`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [ ] `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

---

## Caching

### Page Rules
- [ ] Static assets cached (1 month)
- [ ] Public API cached (5 minutes)
- [ ] Authenticated API bypassed

### Cache Settings
- [ ] Browser Cache TTL: Respect Existing Headers
- [ ] Always Online: On
- [ ] Caching Level: Standard

---

## DDoS Protection

- [ ] HTTP DDoS Protection: Essential (free) or Advanced (Pro)
- [ ] L7 DDoS Sensitivity: High
- [ ] Under Attack Mode: Off (enable manually during attacks)
- [ ] Security Level: Medium
- [ ] Challenge Passage: 30 minutes
- [ ] Browser Integrity Check: On

---

## Application Configuration

### Environment Variables (Supabase Edge Functions)
- [ ] `CORS_ALLOWED_ORIGIN` updated for custom domain
- [ ] Rate limiter uses `CF-Connecting-IP` for IP detection
- [ ] Cloudflare utilities imported where needed

### Frontend
- [ ] Custom domain configured in Vercel
- [ ] SSL working on custom domain
- [ ] Real-time subscriptions working through Cloudflare
- [ ] WebSocket connections not blocked

---

## Verification Tests

### Security Headers
```bash
curl -I https://lumawelfare.or.ke
# Should show: X-Content-Type-Options, X-Frame-Options, etc.
```

### SSL
```bash
curl -vI https://lumawelfare.or.ke 2>&1 | grep -i "SSL"
# Should show: SSL connection using TLSv1.3
```

### WAF
```bash
# Test SQL injection (should be blocked)
curl -X POST "https://lumawelfare.or.ke/functions/v1/auth-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test\" OR 1=1--"}'
# Should return: 403 or challenge
```

### Rate Limiting
```bash
# Send 15 rapid login requests
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://lumawelfare.or.ke/functions/v1/auth-login"
done
# After 10 requests, should get 429 or challenge
```

### Bot Protection
```bash
# Test with curl (may be flagged as bot)
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "User-Agent: curl/7.68.0" \
  "https://lumawelfare.or.ke/"
```

### WebSocket (Realtime)
```bash
# Test Supabase Realtime connection
# Should connect without Cloudflare interference
```

---

## Post-Deployment Monitoring

### Day 1
- [ ] All pages load correctly
- [ ] Login works
- [ ] Payment initiation works
- [ ] M-Pesa callbacks reach the server
- [ ] Real-time notifications work
- [ ] Admin dashboard loads
- [ ] Exports work

### Week 1
- [ ] Review WAF blocked requests
- [ ] Review rate limiting triggers
- [ ] Check for false positives
- [ ] Monitor error rates
- [ ] Check cache hit ratio

### Ongoing
- [ ] Review Cloudflare analytics weekly
- [ ] Update WAF rules as needed
- [ ] Monitor bot score distribution
- [ ] Review security events

---

## Rollback Plan

If Cloudflare causes issues:

1. **DNS rollback:** Change DNS records to point directly to Vercel (disable proxy)
2. **Vercel:** Ensure custom domain still works
3. **Application:** No changes needed — the app works without Cloudflare

### Emergency Contacts
- Cloudflare Support: https://support.cloudflare.com
- Vercel Support: https://vercel.com/support
