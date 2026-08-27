/**
 * LUMA WELFARE — PHASE 5: LOAD TESTING HARNESS
 *
 * Benchmarks Edge Function performance at various concurrency levels.
 *
 * USAGE:
 *   npx tsx src/tests/load-test.ts --help
 *   npx tsx src/tests/load-test.ts --endpoint admin-dashboard --concurrency 10 --duration 30
 *   npx tsx src/tests/load-test.ts --endpoint member-dashboard --concurrency 50
 *   npx tsx src/tests/load-test.ts --all
 *
 * ENVIRONMENT:
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_ANON_KEY    — Supabase anon key
 *   TEST_AUTH_TOKEN      — JWT token for authenticated endpoints
 *   TEST_MEMBER_TOKEN    — JWT token for member endpoints
 */

import { parseArgs } from 'node:util'

// ============================================================================
// TYPES
// ============================================================================

interface LoadTestConfig {
  endpoint: string
  url: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  auth: boolean
  adminAuth: boolean
  concurrency: number
  durationSeconds: number
  headers: Record<string, string>
  body?: unknown
}

interface RequestResult {
  statusCode: number
  latencyMs: number
  error?: string
  timestamp: number
}

interface TestReport {
  endpoint: string
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  errorRate: number
  p50Latency: number
  p95Latency: number
  p99Latency: number
  maxLatency: number
  minLatency: number
  avgLatency: number
  requestsPerSecond: number
  durationMs: number
  errors: Record<string, number>
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
const TEST_AUTH_TOKEN = process.env.TEST_AUTH_TOKEN ?? ''
const TEST_MEMBER_TOKEN = process.env.TEST_MEMBER_TOKEN ?? ''

function getEdgeFunctionUrl(functionName: string): string {
  return `${SUPABASE_URL}/functions/v1/${functionName}`
}

function buildHeaders(auth: boolean, adminAuth: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
  }
  if (adminAuth && TEST_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${TEST_AUTH_TOKEN}`
  } else if (auth && TEST_MEMBER_TOKEN) {
    headers.Authorization = `Bearer ${TEST_MEMBER_TOKEN}`
  }
  return headers
}

// ============================================================================
// ENDPOINT DEFINITIONS
// ============================================================================

const ENDPOINTS: Record<string, Omit<LoadTestConfig, 'concurrency' | 'durationSeconds'>> = {
  // Public endpoints
  'public-packages': {
    endpoint: 'public-packages',
    url: getEdgeFunctionUrl('public-data') + '?resource=packages',
    method: 'GET',
    auth: false,
    adminAuth: false,
    headers: {},
  },

  // Member endpoints
  'member-dashboard': {
    endpoint: 'member-dashboard',
    url: getEdgeFunctionUrl('member-dashboard'),
    method: 'GET',
    auth: true,
    adminAuth: false,
    headers: {},
  },
  'member-contributions': {
    endpoint: 'member-contributions',
    url: getEdgeFunctionUrl('member-contributions'),
    method: 'GET',
    auth: true,
    adminAuth: false,
    headers: {},
  },
  'member-claims': {
    endpoint: 'member-claims',
    url: getEdgeFunctionUrl('member-claims'),
    method: 'GET',
    auth: true,
    adminAuth: false,
    headers: {},
  },
  'member-notifications': {
    endpoint: 'member-notifications',
    url: getEdgeFunctionUrl('member-notifications'),
    method: 'GET',
    auth: true,
    adminAuth: false,
    headers: {},
  },

  // Admin endpoints
  'admin-dashboard': {
    endpoint: 'admin-dashboard',
    url: getEdgeFunctionUrl('admin-dashboard'),
    method: 'GET',
    auth: true,
    adminAuth: true,
    headers: {},
  },
  'admin-members': {
    endpoint: 'admin-members',
    url: getEdgeFunctionUrl('admin-members') + '?page=1&per_page=50',
    method: 'GET',
    auth: true,
    adminAuth: true,
    headers: {},
  },
  'admin-members-search': {
    endpoint: 'admin-members-search',
    url: getEdgeFunctionUrl('admin-members') + '?q=James&page=1&per_page=50',
    method: 'GET',
    auth: true,
    adminAuth: true,
    headers: {},
  },
  'admin-contributions': {
    endpoint: 'admin-contributions',
    url: getEdgeFunctionUrl('admin-contributions') + '?status=Pending',
    method: 'GET',
    auth: true,
    adminAuth: true,
    headers: {},
  },
  'admin-claims': {
    endpoint: 'admin-claims',
    url: getEdgeFunctionUrl('admin-claims'),
    method: 'GET',
    auth: true,
    adminAuth: true,
    headers: {},
  },
  'admin-subscriptions': {
    endpoint: 'admin-subscriptions',
    url: getEdgeFunctionUrl('admin-subscriptions') + '?page=1&per_page=50',
    method: 'GET',
    auth: true,
    adminAuth: true,
    headers: {},
  },
  'admin-reports-kpi': {
    endpoint: 'admin-reports-kpi',
    url: getEdgeFunctionUrl('admin-reports') + '?action=kpi',
    method: 'GET',
    auth: true,
    adminAuth: true,
    headers: {},
  },
  'admin-reports-financial': {
    endpoint: 'admin-reports-financial',
    url: getEdgeFunctionUrl('admin-reports') + '?action=financial-summary',
    method: 'GET',
    auth: true,
    adminAuth: true,
    headers: {},
  },
}

// ============================================================================
// LOAD TESTER
// ============================================================================

async function makeRequest(config: LoadTestConfig): Promise<RequestResult> {
  const startTime = performance.now()
  const timestamp = Date.now()

  try {
    const headers = { ...config.headers, ...buildHeaders(config.auth, config.adminAuth) }
    const res = await fetch(config.url, {
      method: config.method,
      headers,
      body: config.body ? JSON.stringify(config.body) : undefined,
      signal: AbortSignal.timeout(30000), // 30s timeout
    })

    const latencyMs = performance.now() - startTime

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        statusCode: res.status,
        latencyMs,
        error: `${res.status}: ${text.slice(0, 200)}`,
        timestamp,
      }
    }

    return { statusCode: res.status, latencyMs, timestamp }
  } catch (err) {
    const latencyMs = performance.now() - startTime
    return {
      statusCode: 0,
      latencyMs,
      error: err instanceof Error ? err.message : 'Unknown error',
      timestamp,
    }
  }
}

async function runLoadTest(config: LoadTestConfig): Promise<TestReport> {
  const results: RequestResult[] = []
  const startTime = performance.now()
  const endTime = startTime + config.durationSeconds * 1000
  const errors: Record<string, number> = {}

  // Worker function
  async function worker() {
    while (Date.now() < endTime) {
      const result = await makeRequest(config)
      results.push(result)
      if (result.error) {
        const key = result.error.slice(0, 100)
        errors[key] = (errors[key] || 0) + 1
      }
    }
  }

  // Launch concurrent workers
  const workers = Array.from({ length: config.concurrency }, () => worker())
  await Promise.all(workers)

  const durationMs = performance.now() - startTime
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b)
  const successful = results.filter(r => r.statusCode >= 200 && r.statusCode < 400)

  return {
    endpoint: config.endpoint,
    totalRequests: results.length,
    successfulRequests: successful.length,
    failedRequests: results.length - successful.length,
    errorRate: results.length > 0 ? ((results.length - successful.length) / results.length) * 100 : 0,
    p50Latency: percentile(latencies, 50),
    p95Latency: percentile(latencies, 95),
    p99Latency: percentile(latencies, 99),
    maxLatency: latencies[latencies.length - 1] ?? 0,
    minLatency: latencies[0] ?? 0,
    avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    requestsPerSecond: results.length / (durationMs / 1000),
    durationMs,
    errors,
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

// ============================================================================
// REPORT FORMATTING
// ============================================================================

function formatReport(report: TestReport): string {
  const lines = [
    `\n${'='.repeat(60)}`,
    `  ${report.endpoint}`,
    `${'='.repeat(60)}`,
    `  Total Requests:     ${report.totalRequests}`,
    `  Successful:         ${report.successfulRequests}`,
    `  Failed:             ${report.failedRequests}`,
    `  Error Rate:         ${report.errorRate.toFixed(2)}%`,
    `  Requests/sec:       ${report.requestsPerSecond.toFixed(1)}`,
    `  Duration:           ${(report.durationMs / 1000).toFixed(1)}s`,
    ``,
    `  Latency (ms):`,
    `    Min:              ${report.minLatency.toFixed(0)}`,
    `    P50:              ${report.p50Latency.toFixed(0)}`,
    `    P95:              ${report.p95Latency.toFixed(0)}`,
    `    P99:              ${report.p99Latency.toFixed(0)}`,
    `    Max:              ${report.maxLatency.toFixed(0)}`,
    `    Avg:              ${report.avgLatency.toFixed(0)}`,
  ]

  if (Object.keys(report.errors).length > 0) {
    lines.push(``, `  Errors:`)
    for (const [error, count] of Object.entries(report.errors)) {
      lines.push(`    [${count}x] ${error}`)
    }
  }

  return lines.join('\n')
}

function printSummary(reports: TestReport[]): string {
  const lines = [
    `\n${'═'.repeat(80)}`,
    `  PHASE 5 LOAD TEST RESULTS SUMMARY`,
    `${'═'.repeat(80)}`,
    ``,
    `  ${'Endpoint'.padEnd(25)} ${'Reqs'.padStart(6)} ${'RPS'.padStart(7)} ${'P50'.padStart(7)} ${'P95'.padStart(7)} ${'P99'.padStart(7)} ${'Err%'.padStart(7)}`,
    `  ${'─'.repeat(25)} ${'─'.repeat(6)} ${'─'.repeat(7)} ${'─'.repeat(7)} ${'─'.repeat(7)} ${'─'.repeat(7)} ${'─'.repeat(7)}`,
  ]

  for (const r of reports) {
    lines.push(
      `  ${r.endpoint.padEnd(25)} ${String(r.totalRequests).padStart(6)} ${r.requestsPerSecond.toFixed(1).padStart(7)} ${r.p50Latency.toFixed(0).padStart(7)} ${r.p95Latency.toFixed(0).padStart(7)} ${r.p99Latency.toFixed(0).padStart(7)} ${r.errorRate.toFixed(1).padStart(6)}%`
    )
  }

  lines.push(``, `${'═'.repeat(80)}`)
  return lines.join('\n')
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      endpoint: { type: 'string', short: 'e' },
      concurrency: { type: 'string', short: 'c', default: '5' },
      duration: { type: 'string', short: 'd', default: '10' },
      all: { type: 'boolean', short: 'a', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })

  if (values.help) {
    console.log(`
Luma Welfare Load Testing Harness

Usage:
  npx tsx src/tests/load-test.ts [options]

Options:
  -e, --endpoint <name>    Specific endpoint to test
  -c, --concurrency <n>    Concurrent requests (default: 5)
  -d, --duration <s>       Test duration in seconds (default: 10)
  -a, --all                Test all endpoints
  -h, --help               Show this help

Endpoints:
  ${Object.keys(ENDPOINTS).join(', ')}
`)
    return
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables')
    process.exit(1)
  }

  const concurrency = parseInt(values.concurrency ?? '5', 10)
  const duration = parseInt(values.duration ?? '10', 10)
  const reports: TestReport[] = []

  const endpointsToTest = values.all
    ? Object.keys(ENDPOINTS)
    : values.endpoint
      ? [values.endpoint]
      : ['admin-dashboard', 'admin-members', 'member-dashboard', 'public-packages']

  console.log(`\nLuma Welfare Load Test`)
  console.log(`  Supabase URL: ${SUPABASE_URL}`)
  console.log(`  Concurrency:  ${concurrency}`)
  console.log(`  Duration:     ${duration}s`)
  console.log(`  Endpoints:    ${endpointsToTest.join(', ')}`)

  for (const ep of endpointsToTest) {
    const config = ENDPOINTS[ep]
    if (!config) {
      console.error(`  Unknown endpoint: ${ep}`)
      continue
    }

    console.log(`\n  Testing ${ep}...`)
    const testConfig: LoadTestConfig = {
      ...config,
      concurrency,
      durationSeconds: duration,
    }

    const report = await runLoadTest(testConfig)
    reports.push(report)
    console.log(formatReport(report))
  }

  console.log(printSummary(reports))

  // Write results to JSON for later analysis
  const outputPath = `docs/load-test-results-${Date.now()}.json`
  const fs = await import('node:fs')
  fs.writeFileSync(outputPath, JSON.stringify(reports, null, 2))
  console.log(`\nResults saved to ${outputPath}`)
}

main().catch(console.error)
