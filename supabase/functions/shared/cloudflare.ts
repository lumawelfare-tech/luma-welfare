/**
 * LUMA WELFARE — CLOUDFLARE INTEGRATION UTILITIES
 *
 * Handles Cloudflare-specific headers, IP detection, bot scoring,
 * and challenge response generation.
 *
 * When behind Cloudflare:
 * - CF-Connecting-IP: True client IP (most reliable)
 * - CF-IPCountry: Two-letter country code
 * - CF-Ray: Request ID for Cloudflare
 * - CF-Visitor: JSON with scheme and geo info
 * - Cf-Threat-Score: 0-100 threat score (higher = more suspicious)
 * - Cf-Bot-Score: 0-100 bot score (0 = bot, 100 = human)
 */

// ============================================================================
// IP DETECTION
// ============================================================================

/**
 * Extract the real client IP from the request.
 * When behind Cloudflare, CF-Connecting-IP is the true client IP.
 * Falls back to X-Forwarded-For and other headers.
 */
export function getClientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
}

/**
 * Get the visitor's country code from Cloudflare.
 */
export function getVisitorCountry(req: Request): string | null {
  return req.headers.get('cf-ipcountry') ?? null
}

/**
 * Get the Cloudflare Ray ID (request identifier).
 */
export function getCloudflareRayId(req: Request): string | null {
  return req.headers.get('cf-ray') ?? null
}

// ============================================================================
// BOT & THREAT SCORING
// ============================================================================

/**
 * Get Cloudflare's bot score (0-100).
 * 0 = definitely a bot, 100 = definitely human.
 * Only available on Pro+ plan with Bot Management.
 */
export function getBotScore(req: Request): number | null {
  const score = req.headers.get('cf-bot-score')
  return score ? parseInt(score, 10) : null
}

/**
 * Get Cloudflare's threat score (0-100).
 * Higher score = more suspicious.
 * Available on all plans.
 */
export function getThreatScore(req: Request): number | null {
  const score = req.headers.get('cf-threat-score')
  return score ? parseInt(score, 10) : null
}

/**
 * Check if the request is from a known bot.
 * Cloudflare sets cf-verified-bot to "1" for verified bots (Google, Bing, etc.).
 */
export function isVerifiedBot(req: Request): boolean {
  return req.headers.get('cf-verified-bot') === '1'
}

/**
 * Check if the request is from Cloudflare itself (e.g., health checks).
 */
export function isCloudflareRequest(req: Request): boolean {
  return !!req.headers.get('cf-ray')
}

/**
 * Classify request risk level based on Cloudflare scores.
 */
export function classifyRequestRisk(req: Request): 'low' | 'medium' | 'high' | 'critical' {
  const botScore = getBotScore(req)
  const threatScore = getThreatScore(req)

  // Critical: high threat score or known bot
  if (threatScore !== null && threatScore > 50) return 'critical'
  if (botScore !== null && botScore < 10) return 'critical'

  // High: moderate threat or low bot score
  if (threatScore !== null && threatScore > 25) return 'high'
  if (botScore !== null && botScore < 30) return 'high'

  // Medium: slight indicators
  if (threatScore !== null && threatScore > 10) return 'medium'
  if (botScore !== null && botScore < 50) return 'medium'

  return 'low'
}

// ============================================================================
// CHALLENGE RESPONSES
// ============================================================================

/**
 * Generate a Cloudflare-style managed challenge response.
 * In production, Cloudflare handles this at the edge.
 * This is a fallback for when requests bypass Cloudflare.
 */
export function createChallengeResponse(
  reason: string,
  retryAfter = 60,
): Response {
  return new Response(
    JSON.stringify({
      message: 'Your request has been temporarily blocked.',
      code: 'CHALLENGE_REQUIRED',
      reason,
      retry_after: retryAfter,
    }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-Blocked-By': 'luma-welfare-waf',
      },
    },
  )
}

/**
 * Generate a rate limit response with Cloudflare-friendly headers.
 */
export function createRateLimitResponse(
  limit: number,
  windowMs: number,
  retryAfter: number,
): Response {
  return new Response(
    JSON.stringify({
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
      retry_after: retryAfter,
      limit,
      window_ms: windowMs,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil((Date.now() + windowMs) / 1000)),
      },
    },
  )
}

// ============================================================================
// REQUEST ENRICHMENT
// ============================================================================

/**
 * Enrich a request with Cloudflare metadata for logging.
 * Returns safe metadata that can be included in structured logs.
 */
export function enrichRequestWithCfMetadata(req: Request): {
  client_ip: string
  country: string | null
  cf_ray: string | null
  bot_score: number | null
  threat_score: number | null
  is_bot: boolean
  risk_level: string
} {
  const clientIp = getClientIp(req)
  const country = getVisitorCountry(req)
  const cfRay = getCloudflareRayId(req)
  const botScore = getBotScore(req)
  const threatScore = getThreatScore(req)
  const isBot = botScore !== null && botScore < 30
  const riskLevel = classifyRequestRisk(req)

  return {
    client_ip: clientIp,
    country,
    cf_ray: cfRay,
    bot_score: botScore,
    threat_score: threatScore,
    is_bot: isBot,
    risk_level: riskLevel,
  }
}

// ============================================================================
// SECURITY RULES
// ============================================================================

/**
 * Check if a request should be blocked based on Cloudflare threat intelligence.
 * Use this as an additional defense layer before processing the request.
 */
export function shouldBlockRequest(req: Request): { blocked: boolean; reason?: string } {
  const threatScore = getThreatScore(req)
  const botScore = getBotScore(req)

  // Block known bad actors
  if (threatScore !== null && threatScore > 80) {
    return { blocked: true, reason: `High threat score: ${threatScore}` }
  }

  // Block definite bots on sensitive endpoints
  const path = new URL(req.url).pathname
  const isSensitiveEndpoint = path.includes('/auth-') || path.includes('/payments-') || path.includes('/admin-')

  if (isSensitiveEndpoint && botScore !== null && botScore < 5) {
    return { blocked: true, reason: `Bot detected on sensitive endpoint (score: ${botScore})` }
  }

  return { blocked: false }
}
