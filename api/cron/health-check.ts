/**
 * api/cron/health-check — Automated daily system health check
 *
 * Vercel Cron Job runs daily (06:00 UTC).
 * Pings the health endpoint and admin monitoring, records results,
 * and sends email alerts when services are unhealthy.
 *
 * Environment variables required:
 *   SUPABASE_URL        — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 *   CRON_SECRET         — Shared secret for Vercel cron authentication
 *   RESEND_API_KEY      — Resend API key for alert emails (optional — degrades gracefully)
 *   HEALTH_ALERT_EMAIL  — Recipient for health alerts (optional — falls back to console)
 *
 * Security:
 *   - Validates CRON_SECRET header (Vercel sends this automatically)
 *   - Never exposes secrets in responses
 *   - Uses batched operations
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

// ── Configuration ──────────────────────────────────────────────────────────

const HEALTH_ENDPOINT_TIMEOUT_MS = 10_000
const ADMIN_MONITORING_TIMEOUT_MS = 15_000

// Thresholds for alert conditions
const ALERT_THRESHOLDS = {
  /** Health endpoint latency above this triggers a warning */
  healthLatencyMs: 5_000,
  /** Pending payments above this triggers a warning */
  pendingPayments: 50,
  /** Failed payments in 24h above this triggers a warning */
  failedPayments24h: 10,
  /** Stale export jobs above this triggers a warning */
  staleExports: 5,
  /** Failed auth attempts in 1h above this triggers a warning */
  failedAuth1h: 20,
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getEnv(key: string): string | undefined {
  return process.env[key]
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing environment variable: ${key}`)
  return value
}

interface HealthCheckResult {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  latencyMs: number
  details?: Record<string, unknown>
  error?: string
}

// ── Health Checks ──────────────────────────────────────────────────────────

/**
 * Ping the unauthenticated health endpoint.
 */
async function checkHealthEndpoint(supabaseUrl: string): Promise<HealthCheckResult> {
  const start = performance.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HEALTH_ENDPOINT_TIMEOUT_MS)

    const res = await fetch(`${supabaseUrl}/functions/v1/health?detail=true`, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    })
    clearTimeout(timeout)

    const latencyMs = Math.round(performance.now() - start)
    const body = await res.json() as Record<string, unknown>

    const status = res.ok
      ? (body.status === 'healthy' ? 'healthy' : 'degraded')
      : 'unhealthy'

    return {
      name: 'health-endpoint',
      status,
      latencyMs,
      details: {
        httpStatus: res.status,
        dbStatus: (body.checks as Record<string, unknown>)?.database,
        authStatus: (body.checks as Record<string, unknown>)?.auth,
        storageStatus: (body.checks as Record<string, unknown>)?.storage,
      },
    }
  } catch (err) {
    return {
      name: 'health-endpoint',
      status: 'unhealthy',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : 'Health endpoint unreachable',
    }
  }
}

/**
 * Ping the admin monitoring overview endpoint.
 * Uses service-role key to bypass auth (server-to-server).
 */
async function checkAdminMonitoring(
  supabaseUrl: string,
  serviceKey: string,
): Promise<HealthCheckResult> {
  const start = performance.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ADMIN_MONITORING_TIMEOUT_MS)

    const res = await fetch(
      `${supabaseUrl}/functions/v1/admin-monitoring?action=overview`,
      {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
        },
      },
    )
    clearTimeout(timeout)

    const latencyMs = Math.round(performance.now() - start)

    if (!res.ok) {
      return {
        name: 'admin-monitoring',
        status: 'degraded',
        latencyMs,
        error: `HTTP ${res.status}`,
      }
    }

    const body = await res.json() as Record<string, unknown>
    const payments = body.payments as Record<string, unknown> | undefined
    const exports = body.exports as Record<string, unknown> | undefined

    // Check for alert conditions
    const warnings: string[] = []

    if (payments) {
      const pending = (payments.pending as number) ?? 0
      const failed24h = (payments.failed_24h as number) ?? 0

      if (pending > ALERT_THRESHOLDS.pendingPayments) {
        warnings.push(`${pending} pending payments (threshold: ${ALERT_THRESHOLDS.pendingPayments})`)
      }
      if (failed24h > ALERT_THRESHOLDS.failedPayments24h) {
        warnings.push(`${failed24h} failed payments in 24h (threshold: ${ALERT_THRESHOLDS.failedPayments24h})`)
      }
    }

    if (exports) {
      const failed = (exports.failed as number) ?? 0
      if (failed > ALERT_THRESHOLDS.staleExports) {
        warnings.push(`${failed} failed exports (threshold: ${ALERT_THRESHOLDS.staleExports})`)
      }
    }

    const status = warnings.length > 0 ? 'degraded' : 'healthy'

    return {
      name: 'admin-monitoring',
      status,
      latencyMs,
      details: {
        payments: payments ? {
          pending: payments.pending,
          failed_24h: payments.failed_24h,
          completed_24h: payments.completed_24h,
          status: payments.status,
        } : undefined,
        exports: exports ? {
          queued: exports.queued,
          processing: exports.processing,
          failed: exports.failed,
          status: exports.status,
        } : undefined,
        warnings,
      },
    }
  } catch (err) {
    return {
      name: 'admin-monitoring',
      status: 'unhealthy',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : 'Admin monitoring unreachable',
    }
  }
}

/**
 * Check database directly via Supabase REST API.
 */
async function checkDatabase(
  supabaseUrl: string,
  serviceKey: string,
): Promise<HealthCheckResult> {
  const start = performance.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HEALTH_ENDPOINT_TIMEOUT_MS)

    const res = await fetch(
      `${supabaseUrl}/rest/v1/members?select=id&limit=1`,
      {
        signal: controller.signal,
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      },
    )
    clearTimeout(timeout)

    const latencyMs = Math.round(performance.now() - start)

    return {
      name: 'database',
      status: res.ok ? 'healthy' : 'unhealthy',
      latencyMs,
      details: { httpStatus: res.status },
    }
  } catch (err) {
    return {
      name: 'database',
      status: 'unhealthy',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : 'Database unreachable',
    }
  }
}

// ── Alert Sending ──────────────────────────────────────────────────────────

async function sendAlertEmail(
  results: HealthCheckResult[],
  overall: string,
  supabaseUrl: string,
): Promise<number> {
  const resendKey = getEnv('RESEND_API_KEY')
  const alertEmail = getEnv('HEALTH_ALERT_EMAIL')

  if (!resendKey || !alertEmail) {
    console.log('[HEALTH-CHECK] No RESEND_API_KEY or HEALTH_ALERT_EMAIL — skipping email alert')
    return 0
  }

  const unhealthy = results.filter(r => r.status === 'unhealthy')
  const degraded = results.filter(r => r.status === 'degraded')

  const subject = overall === 'unhealthy'
    ? `🔴 Luma Welfare Health Check FAILED — ${new Date().toISOString()}`
    : `🟡 Luma Welfare Health Check WARNING — ${new Date().toISOString()}`

  const statusEmoji = (s: string) => s === 'healthy' ? '🟢' : s === 'degraded' ? '🟡' : '🔴'

  const checksHtml = results.map(r => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${statusEmoji(r.status)} ${r.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;color:${r.status === 'healthy' ? '#16a34a' : r.status === 'degraded' ? '#ca8a04' : '#dc2626'};">${r.status.toUpperCase()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.latencyMs}ms</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${r.error ?? '—'}</td>
    </tr>
  `).join('')

  const warningsHtml = degraded
    .flatMap(r => (r.details?.warnings as string[]) ?? [])
    .map(w => `<li style="margin:4px 0;">⚠️ ${w}</li>`)
    .join('')

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:${overall === 'unhealthy' ? '#dc2626' : '#ca8a04'};padding:24px 32px;">
      <h1 style="margin:0;color:white;font-size:20px;font-weight:700;">Luma Welfare Health Check</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">${overall === 'unhealthy' ? 'System Unhealthy' : 'System Degraded'} — ${new Date().toISOString()}</p>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:600;">Check Results</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;">Service</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;">Status</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600;color:#374151;">Latency</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;">Error</th>
          </tr>
        </thead>
        <tbody>${checksHtml}</tbody>
      </table>
      ${warningsHtml ? `
      <h3 style="margin:24px 0 8px;color:#111827;font-size:16px;font-weight:600;">Warnings</h3>
      <ul style="color:#4b5563;font-size:14px;line-height:1.8;">${warningsHtml}</ul>
      ` : ''}
      <div style="margin-top:24px;">
        <a href="${supabaseUrl.replace('.supabase.co', '')}/dashboard" style="display:inline-block;background:#6D9B3A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Dashboard</a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Automated health check from Luma Welfare. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Luma Welfare Health <noreply@luma-welfare.vercel.app>',
        to: [alertEmail],
        subject,
        html,
      }),
    })

    if (response.ok) {
      console.log(`[HEALTH-CHECK] Alert email sent to ${alertEmail}`)
      return 1
    } else {
      const err = await response.text()
      console.error(`[HEALTH-CHECK] Failed to send alert email: ${response.status} ${err}`)
      return 0
    }
  } catch (err) {
    console.error(`[HEALTH-CHECK] Email send error:`, err)
    return 0
  }
}

// ── Record Results ─────────────────────────────────────────────────────────

async function recordResults(
  supabaseUrl: string,
  serviceKey: string,
  overall: string,
  durationMs: number,
  results: HealthCheckResult[],
  alertsSent: number,
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/health_check_history`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        overall,
        duration_ms: durationMs,
        checks: results.reduce((acc, r) => {
          acc[r.name] = {
            status: r.status,
            latencyMs: r.latencyMs,
            error: r.error,
            details: r.details,
          }
          return acc
        }, {} as Record<string, unknown>),
        alerts_sent: alertsSent,
        metadata: {
          cron_run: true,
          timestamp: new Date().toISOString(),
        },
      }),
    })
  } catch (err) {
    console.error('[HEALTH-CHECK] Failed to record results:', err)
  }
}

// ── Main Handler ───────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // Only allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // Validate cron secret
  const cronSecret = getEnv('CRON_SECRET')
  const authHeader = req.headers.authorization

  if (!cronSecret) {
    console.error('[HEALTH-CHECK] CRON_SECRET not configured')
    res.status(500).json({ error: 'Server configuration error' })
    return
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[HEALTH-CHECK] Unauthorized cron request')
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const startTime = performance.now()
  console.log(`[HEALTH-CHECK] Started at ${new Date().toISOString()}`)

  try {
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const serviceKey = getEnvOrThrow('SUPABASE_SERVICE_KEY')

    // Run all health checks in parallel
    const [healthResult, adminResult, dbResult] = await Promise.all([
      checkHealthEndpoint(supabaseUrl),
      checkAdminMonitoring(supabaseUrl, serviceKey).catch(() => ({
        name: 'admin-monitoring' as const,
        status: 'unhealthy' as const,
        latencyMs: 0,
        error: 'Admin monitoring check failed',
      })),
      checkDatabase(supabaseUrl, serviceKey),
    ])

    const results = [healthResult, adminResult, dbResult]
    const durationMs = Math.round(performance.now() - startTime)

    // Determine overall status
    const statuses = results.map(r => r.status)
    const overall = statuses.includes('unhealthy')
      ? 'unhealthy'
      : statuses.includes('degraded')
        ? 'degraded'
        : 'healthy'

    console.log(`[HEALTH-CHECK] Overall: ${overall} (${durationMs}ms)`)
    for (const r of results) {
      console.log(`  ${r.status === 'healthy' ? '✅' : r.status === 'degraded' ? '⚠️' : '❌'} ${r.name}: ${r.status} (${r.latencyMs}ms)${r.error ? ` — ${r.error}` : ''}`)
    }

    // Send alerts if unhealthy or degraded
    let alertsSent = 0
    if (overall !== 'healthy') {
      alertsSent = await sendAlertEmail(results, overall, supabaseUrl)
    }

    // Record results in database
    await recordResults(supabaseUrl, serviceKey, overall, durationMs, results, alertsSent)

    // Return summary
    res.status(overall === 'unhealthy' ? 503 : 200).json({
      status: overall,
      timestamp: new Date().toISOString(),
      durationMs,
      checks: results.map(r => ({
        name: r.name,
        status: r.status,
        latencyMs: r.latencyMs,
        error: r.error,
      })),
      alertsSent,
    })
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime)
    console.error(`[HEALTH-CHECK] Failed after ${durationMs}ms:`, err)

    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      durationMs,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
