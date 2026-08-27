/**
 * LUMA WELFARE — PHASE 5: OBSERVABILITY MODULE
 *
 * Lightweight observability for Supabase Edge Functions:
 * - Request timing and logging
 * - Slow query detection
 * - Error tracking
 * - Health check endpoint
 * - Performance metrics
 *
 * No external dependencies. No sensitive data logged.
 */

// ============================================================================
// TYPES
// ============================================================================

interface RequestMetrics {
  endpoint: string
  method: string
  statusCode: number
  durationMs: number
  timestamp: number
  error?: string
}

interface SlowQueryEntry {
  endpoint: string
  query: string
  durationMs: number
  timestamp: number
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  checks: Record<string, { status: string; durationMs?: number; error?: string }>
}

// ============================================================================
// IN-MEMORY METRICS STORE
// ============================================================================

const metrics: RequestMetrics[] = []
const slowQueries: SlowQueryEntry[] = []
const errors: Array<{ endpoint: string; error: string; timestamp: number }> = []
const startTime = Date.now()

// Keep last 1000 requests and 100 slow queries in memory
const MAX_METRICS = 1000
const MAX_SLOW_QUERIES = 100
const MAX_ERRORS = 200
const SLOW_QUERY_THRESHOLD_MS = 1000 // 1 second

// ============================================================================
// REQUEST TIMING
// ============================================================================

/**
 * Wrap an Edge Function handler with request timing and logging.
 *
 * Usage:
 *   import { withTiming } from '../shared/observability.ts'
 *
 *   Deno.serve(withTiming('admin-dashboard', async (req) => { ... }))
 */
export function withTiming(
  endpoint: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const start = performance.now()
    const method = req.method

    try {
      const response = await handler(req)
      const durationMs = performance.now() - start

      // Log request
      recordMetric({
        endpoint,
        method,
        statusCode: response.status,
        durationMs,
        timestamp: Date.now(),
      })

      // Log slow requests
      if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
        console.warn(`[SLOW] ${method} ${endpoint}: ${durationMs.toFixed(0)}ms (status: ${response.status})`)
      }

      // Log errors
      if (response.status >= 500) {
        const body = await response.clone().text().catch(() => '')
        recordError(endpoint, `${response.status}: ${body.slice(0, 200)}`)
      }

      // Add timing headers
      const newHeaders = new Headers(response.headers)
      newHeaders.set('X-Response-Time', `${durationMs.toFixed(0)}ms`)
      newHeaders.set('X-Endpoint', endpoint)

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      })
    } catch (err) {
      const durationMs = performance.now() - start
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'

      recordMetric({
        endpoint,
        method,
        statusCode: 500,
        durationMs,
        timestamp: Date.now(),
        error: errorMsg,
      })

      recordError(endpoint, errorMsg)
      console.error(`[ERROR] ${method} ${endpoint}: ${errorMsg} (${durationMs.toFixed(0)}ms)`)

      throw err // Re-throw to let the original error handler deal with it
    }
  }
}

// ============================================================================
// METRICS RECORDING
// ============================================================================

function recordMetric(metric: RequestMetrics): void {
  metrics.push(metric)
  if (metrics.length > MAX_METRICS) {
    metrics.splice(0, metrics.length - MAX_METRICS)
  }
}

function recordError(endpoint: string, error: string): void {
  errors.push({ endpoint, error, timestamp: Date.now() })
  if (errors.length > MAX_ERRORS) {
    errors.splice(0, errors.length - MAX_ERRORS)
  }
}

/**
 * Record a slow query for monitoring.
 */
export function recordSlowQuery(endpoint: string, query: string, durationMs: number): void {
  if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
    const entry: SlowQueryEntry = { endpoint, query, durationMs, timestamp: Date.now() }
    slowQueries.push(entry)
    if (slowQueries.length > MAX_SLOW_QUERIES) {
      slowQueries.splice(0, slowQueries.length - MAX_SLOW_QUERIES)
    }
    console.warn(`[SLOW_QUERY] ${endpoint}: ${query.slice(0, 100)} (${durationMs.toFixed(0)}ms)`)
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Perform a health check against the Supabase database.
 * Returns a health status object without exposing sensitive information.
 */
export async function healthCheck(adminClient: any): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = {}

  // Database connectivity check
  const dbStart = performance.now()
  try {
    const { error } = await adminClient
      .from('platform_settings')
      .select('key')
      .limit(1)

    checks.database = {
      status: error ? 'unhealthy' : 'healthy',
      durationMs: performance.now() - dbStart,
      error: error ? 'Database query failed' : undefined,
    }
  } catch (err) {
    checks.database = {
      status: 'unhealthy',
      durationMs: performance.now() - dbStart,
      error: err instanceof Error ? err.message : 'Connection failed',
    }
  }

  // Determine overall status
  const allHealthy = Object.values(checks).every(c => c.status === 'healthy')
  const anyUnhealthy = Object.values(checks).some(c => c.status === 'unhealthy')

  return {
    status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Date.now() - startTime,
    checks,
  }
}

// ============================================================================
// METRICS ENDPOINT
// ============================================================================

/**
 * Get current metrics summary (for admin monitoring).
 * Does NOT expose sensitive data.
 */
export function getMetricsSummary(): {
  totalRequests: number
  requestsByEndpoint: Record<string, number>
  requestsByStatus: Record<string, number>
  avgLatencyMs: number
  p95LatencyMs: number
  slowQueries: number
  recentErrors: number
  uptime: number
} {
  const totalRequests = metrics.length

  const requestsByEndpoint: Record<string, number> = {}
  const requestsByStatus: Record<string, number> = {}
  let totalLatency = 0

  for (const m of metrics) {
    requestsByEndpoint[m.endpoint] = (requestsByEndpoint[m.endpoint] || 0) + 1
    requestsByStatus[String(m.statusCode)] = (requestsByStatus[String(m.statusCode)] || 0) + 1
    totalLatency += m.durationMs
  }

  const latencies = metrics.map(m => m.durationMs).sort((a, b) => a - b)
  const p95Idx = Math.ceil(0.95 * latencies.length) - 1

  const fiveMinAgo = Date.now() - 5 * 60 * 1000
  const recentErrors = errors.filter(e => e.timestamp > fiveMinAgo).length

  return {
    totalRequests,
    requestsByEndpoint,
    requestsByStatus,
    avgLatencyMs: totalRequests > 0 ? totalLatency / totalRequests : 0,
    p95LatencyMs: latencies.length > 0 ? latencies[Math.max(0, p95Idx)] : 0,
    slowQueries: slowQueries.length,
    recentErrors,
    uptime: Date.now() - startTime,
  }
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================

/**
 * Safe logger that redacts sensitive information.
 */
export function safeLog(endpoint: string, message: string, data?: Record<string, unknown>): void {
  // Redact sensitive fields
  const redacted = data ? redactSensitive(data) : undefined
  console.log(`[${endpoint}] ${message}`, redacted ? JSON.stringify(redacted) : '')
}

function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitive = ['password', 'token', 'secret', 'key', 'authorization', 'cookie']
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (sensitive.some(s => key.toLowerCase().includes(s))) {
      result[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      result[key] = '[object]'
    } else {
      result[key] = value
    }
  }

  return result
}
