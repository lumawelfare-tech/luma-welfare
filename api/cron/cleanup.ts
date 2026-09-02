/**
 * api/cron/cleanup — Weekly notification & audit log retention cleanup
 *
 * Vercel Cron Job runs weekly (Sunday 03:00 UTC).
 * Calls Supabase RPC functions to safely batch-delete expired records.
 *
 * Environment variables required:
 *   SUPABASE_URL       — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 *   CRON_SECRET        — Shared secret for Vercel cron authentication
 *
 * Security:
 *   - Validates CRON_SECRET header (Vercel sends this automatically)
 *   - Never exposes secrets in responses
 *   - Uses batched deletes to avoid long-running transactions
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

// ── Configuration ──────────────────────────────────────────────────────────
const BATCH_SIZE_NOTIFICATIONS = 1000
const BATCH_SIZE_AUDIT_LOGS = 1000
const BATCH_SIZE_EXPORT_JOBS = 100
const BATCH_SIZE_EMAIL_VERIFICATIONS = 500

// ── Helpers ────────────────────────────────────────────────────────────────

function getEnvOrThrow(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing environment variable: ${key}`)
  return value
}

async function rpc(
  url: string,
  serviceKey: string,
  functionName: string,
  params: Record<string, unknown> = {},
): Promise<{ data: number | null; error: string | null }> {
  const res = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const body = await res.text()
    return { data: null, error: `HTTP ${res.status}: ${body}` }
  }

  const data = await res.json()
  return { data, error: null }
}

// ── Cleanup tasks ──────────────────────────────────────────────────────────

interface CleanupResult {
  task: string
  deleted: number | null
  durationMs: number
  error: string | null
}

async function cleanupNotifications(
  url: string,
  key: string,
): Promise<CleanupResult> {
  const start = performance.now()
  const { data, error } = await rpc(url, key, 'cleanup_old_notifications', {
    p_batch_size: BATCH_SIZE_NOTIFICATIONS,
  })
  return {
    task: 'notifications',
    deleted: data,
    durationMs: Math.round(performance.now() - start),
    error,
  }
}

async function cleanupAuditLogs(
  url: string,
  key: string,
): Promise<CleanupResult> {
  const start = performance.now()
  const { data, error } = await rpc(url, key, 'cleanup_old_audit_logs', {
    p_batch_size: BATCH_SIZE_AUDIT_LOGS,
  })
  return {
    task: 'audit_logs',
    deleted: data,
    durationMs: Math.round(performance.now() - start),
    error,
  }
}

async function cleanupExportJobs(
  url: string,
  key: string,
): Promise<CleanupResult> {
  const start = performance.now()
  const { data, error } = await rpc(url, key, 'cleanup_old_export_jobs', {
    p_batch_size: BATCH_SIZE_EXPORT_JOBS,
  })
  return {
    task: 'export_jobs',
    deleted: data,
    durationMs: Math.round(performance.now() - start),
    error,
  }
}

async function cleanupEmailVerifications(
  url: string,
  key: string,
): Promise<CleanupResult> {
  const start = performance.now()
  const { data, error } = await rpc(url, key, 'cleanup_old_email_verifications', {
    p_batch_size: BATCH_SIZE_EMAIL_VERIFICATIONS,
  })
  return {
    task: 'email_verifications',
    deleted: data,
    durationMs: Math.round(performance.now() - start),
    error,
  }
}

async function getRetentionStats(
  url: string,
  key: string,
): Promise<Record<string, unknown> | null> {
  const notifStats = await rpc(url, key, 'get_notification_retention_stats')
  const auditStats = await rpc(url, key, 'get_audit_log_retention_stats')

  if (notifStats.error || auditStats.error) return null

  return {
    notifications: notifStats.data,
    audit_logs: auditStats.data,
  }
}

// ── Main handler ───────────────────────────────────────────────────────────

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
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.authorization

  if (!cronSecret) {
    console.error('[CLEANUP] CRON_SECRET not configured')
    res.status(500).json({ error: 'Server configuration error' })
    return
  }

  // Vercel sends: Authorization: Bearer <CRON_SECRET>
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[CLEANUP] Unauthorized cron request')
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const startTime = performance.now()
  console.log(`[CLEANUP] Started at ${new Date().toISOString()}`)

  try {
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const serviceKey = getEnvOrThrow('SUPABASE_SERVICE_KEY')

    // 1. Get retention stats before cleanup
    const statsBefore = await getRetentionStats(supabaseUrl, serviceKey)

    // 2. Run cleanup tasks in sequence (to avoid database connection pressure)
    const results: CleanupResult[] = []

    results.push(await cleanupNotifications(supabaseUrl, serviceKey))
    console.log(
      `[CLEANUP] Notifications: ${results[results.length - 1].deleted ?? 'error'} deleted in ${results[results.length - 1].durationMs}ms`,
    )

    results.push(await cleanupAuditLogs(supabaseUrl, serviceKey))
    console.log(
      `[CLEANUP] Audit logs: ${results[results.length - 1].deleted ?? 'error'} deleted in ${results[results.length - 1].durationMs}ms`,
    )

    results.push(await cleanupExportJobs(supabaseUrl, serviceKey))
    console.log(
      `[CLEANUP] Export jobs: ${results[results.length - 1].deleted ?? 'error'} deleted in ${results[results.length - 1].durationMs}ms`,
    )

    results.push(await cleanupEmailVerifications(supabaseUrl, serviceKey))
    console.log(
      `[CLEANUP] Email verifications: ${results[results.length - 1].deleted ?? 'error'} deleted in ${results[results.length - 1].durationMs}ms`,
    )

    // 3. Get retention stats after cleanup
    const statsAfter = await getRetentionStats(supabaseUrl, serviceKey)

    const totalDuration = Math.round(performance.now() - startTime)
    const hasErrors = results.some((r) => r.error !== null)
    const totalDeleted = results.reduce(
      (sum, r) => sum + (r.deleted ?? 0),
      0,
    )

    console.log(
      `[CLEANUP] Completed in ${totalDuration}ms. Total deleted: ${totalDeleted}. Errors: ${hasErrors}`,
    )

    res.status(200).json({
      status: hasErrors ? 'partial' : 'success',
      timestamp: new Date().toISOString(),
      durationMs: totalDuration,
      totalDeleted,
      tasks: results,
      statsBefore,
      statsAfter,
    })
  } catch (err) {
    const totalDuration = Math.round(performance.now() - startTime)
    console.error(`[CLEANUP] Failed after ${totalDuration}ms:`, err)

    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      durationMs: totalDuration,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
