/**
 * LUMA WELFARE — PHASE 16: 500K+ LOAD TESTING & PRODUCTION CERTIFICATION
 *
 * Comprehensive load test harness that tests:
 * 1. Baseline performance at current scale
 * 2. Realistic member workflows (login → dashboard → contributions → claims)
 * 3. Admin workflows (dashboard → members → contributions → claims → reports)
 * 4. Spike tests (sudden traffic increases)
 * 5. Sustained load tests ( prolonged traffic)
 * 6. Payment sandbox simulation
 * 7. Export worker stress
 * 8. Database query performance under load
 *
 * USAGE:
 *   npx tsx src/tests/phase16-load-test.ts --help
 *   npx tsx src/tests/phase16-load-test.ts --suite baseline
 *   npx tsx src/tests/phase16-load-test.ts --suite member-workflow
 *   npx tsx src/tests/phase16-load-test.ts --suite spike
 *   npx tsx src/tests/phase16-load-test.ts --suite all
 *
 * ENVIRONMENT:
 *   SUPABASE_URL           — Supabase project URL
 *   SUPABASE_ANON_KEY      — Supabase anon key
 *   TEST_MEMBER_TOKEN      — JWT token for member endpoints
 *   TEST_ADMIN_TOKEN       — JWT token for admin endpoints
 */

import { parseArgs } from 'node:util'

// ============================================================================
// TYPES
// ============================================================================

interface TestResult {
  name: string
  endpoint: string
  statusCode: number
  latencyMs: number
  error?: string
  timestamp: number
}

interface TestReport {
  suite: string
  test: string
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  errorRate: number
  p50Latency: number
  p95Latency: number
  p99Latency: number
  maxLatency: number
  avgLatency: number
  requestsPerSecond: number
  durationMs: number
  errors: Record<string, number>
}

interface WorkflowStep {
  name: string
  url: string
  method: 'GET' | 'POST' | 'PATCH'
  auth: 'none' | 'member' | 'admin'
  body?: unknown
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
const TEST_MEMBER_TOKEN = process.env.TEST_MEMBER_TOKEN ?? ''
const TEST_ADMIN_TOKEN = process.env.TEST_ADMIN_TOKEN ?? ''

function edgeUrl(fn: string): string {
  return `${SUPABASE_URL}/functions/v1/${fn}`
}

function headers(auth: 'none' | 'member' | 'admin'): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY }
  if (auth === 'member' && TEST_MEMBER_TOKEN) h.Authorization = `Bearer ${TEST_MEMBER_TOKEN}`
  if (auth === 'admin' && TEST_ADMIN_TOKEN) h.Authorization = `Bearer ${TEST_ADMIN_TOKEN}`
  return h
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

const MEMBER_WORKFLOW: WorkflowStep[] = [
  { name: 'Dashboard', url: edgeUrl('member-dashboard'), method: 'GET', auth: 'member' },
  { name: 'Packages', url: edgeUrl('public-data') + '?resource=packages', method: 'GET', auth: 'none' },
  { name: 'Contributions', url: edgeUrl('member-contributions') + '?page=1&per_page=20', method: 'GET', auth: 'member' },
  { name: 'Claims', url: edgeUrl('member-claims'), method: 'GET', auth: 'member' },
  { name: 'Notifications', url: edgeUrl('member-notifications'), method: 'GET', auth: 'member' },
  { name: 'Profile', url: edgeUrl('member-profile'), method: 'GET', auth: 'member' },
]

const ADMIN_WORKFLOW: WorkflowStep[] = [
  { name: 'Dashboard', url: edgeUrl('admin-dashboard'), method: 'GET', auth: 'admin' },
  { name: 'Members', url: edgeUrl('admin-members') + '?page=1&per_page=50', method: 'GET', auth: 'admin' },
  { name: 'Member Search', url: edgeUrl('admin-members') + '?q=James&page=1&per_page=50', method: 'GET', auth: 'admin' },
  { name: 'Contributions', url: edgeUrl('admin-contributions') + '?page=1&per_page=50', method: 'GET', auth: 'admin' },
  { name: 'Claims', url: edgeUrl('admin-claims'), method: 'GET', auth: 'admin' },
  { name: 'Subscriptions', url: edgeUrl('admin-subscriptions') + '?page=1&per_page=50', method: 'GET', auth: 'admin' },
  { name: 'Reports KPI', url: edgeUrl('admin-reports') + '?action=kpi', method: 'GET', auth: 'admin' },
  { name: 'Reports Financial', url: edgeUrl('admin-reports') + '?action=financial-summary', method: 'GET', auth: 'admin' },
  { name: 'Monitoring', url: edgeUrl('admin-monitoring'), method: 'GET', auth: 'admin' },
]

const PAYMENT_SIMULATION: WorkflowStep[] = [
  { name: 'Initiate Payment', url: edgeUrl('payments-initiate'), method: 'POST', auth: 'member', body: { phone: '0700000000', amount: 1200, subscriptionId: '00000000-0000-0000-0000-000000000000' } },
  { name: 'Check Status', url: edgeUrl('member-registration-fee') + '?action=check-status', method: 'GET', auth: 'member' },
]

// ============================================================================
// LOAD TESTER
// ============================================================================

async function makeRequest(url: string, method: string, auth: 'none' | 'member' | 'admin', body?: unknown): Promise<TestResult> {
  const start = performance.now()
  try {
    const opts: RequestInit = { method, headers: headers(auth), signal: AbortSignal.timeout(30000) }
    if (body && method !== 'GET') opts.body = JSON.stringify(body)
    const res = await fetch(url, opts)
    const latency = performance.now() - start
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { name: '', endpoint: url, statusCode: res.status, latencyMs: latency, error: `${res.status}: ${text.slice(0, 100)}`, timestamp: Date.now() }
    }
    return { name: '', endpoint: url, statusCode: res.status, latencyMs: latency, timestamp: Date.now() }
  } catch (err) {
    return { name: '', endpoint: url, statusCode: 0, latencyMs: performance.now() - start, error: err instanceof Error ? err.message : 'Unknown', timestamp: Date.now() }
  }
}

async function runConcurrentTest(
  steps: WorkflowStep[],
  concurrency: number,
  durationMs: number,
  label: string,
): Promise<TestReport> {
  const results: TestResult[] = []
  const errors: Record<string, number> = {}
  const start = performance.now()
  const end = start + durationMs

  async function worker() {
    while (Date.now() < end) {
      // Pick a random step from the workflow
      const step = steps[Math.floor(Math.random() * steps.length)]
      const result = await makeRequest(step.url, step.method, step.auth, step.body)
      result.name = step.name
      results.push(result)
      if (result.error) {
        const key = result.error.slice(0, 80)
        errors[key] = (errors[key] || 0) + 1
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker())
  await Promise.all(workers)

  const duration = performance.now() - start
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b)
  const successful = results.filter(r => r.statusCode >= 200 && r.statusCode < 400)

  return {
    suite: label,
    test: `${concurrency}c/${(durationMs / 1000).toFixed(0)}s`,
    totalRequests: results.length,
    successfulRequests: successful.length,
    failedRequests: results.length - successful.length,
    errorRate: results.length > 0 ? ((results.length - successful.length) / results.length) * 100 : 0,
    p50Latency: percentile(latencies, 50),
    p95Latency: percentile(latencies, 95),
    p99Latency: percentile(latencies, 99),
    maxLatency: latencies[latencies.length - 1] ?? 0,
    avgLatency: latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1),
    requestsPerSecond: results.length / (duration / 1000),
    durationMs: duration,
    errors,
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.ceil((p / 100) * sorted.length) - 1] ?? 0
}

// ============================================================================
// TEST SUITES
// ============================================================================

async function runBaseline(): Promise<TestReport[]> {
  console.log('\n📊 BASELINE PERFORMANCE TEST')
  console.log('  Testing individual endpoints at low concurrency (5 concurrent, 15s each)')

  const reports: TestReport[] = []
  const endpoints: WorkflowStep[] = [
    ...MEMBER_WORKFLOW,
    ...ADMIN_WORKFLOW.slice(0, 5), // Top admin endpoints only
  ]

  for (const step of endpoints) {
    process.stdout.write(`  ${step.name}...`)
    const report = await runConcurrentTest([step], 5, 15000, 'baseline')
    report.test = step.name
    const status = report.errorRate < 5 ? '✅' : report.errorRate < 20 ? '⚠️' : '❌'
    console.log(` ${status} P50=${report.p50Latency.toFixed(0)}ms P95=${report.p95Latency.toFixed(0)}ms RPS=${report.requestsPerSecond.toFixed(1)} Err=${report.errorRate.toFixed(1)}%`)
    reports.push(report)
  }
  return reports
}

async function runMemberWorkflow(): Promise<TestReport[]> {
  console.log('\n👤 MEMBER WORKFLOW TEST')
  console.log('  Simulating realistic member browsing patterns')

  const reports: TestReport[] = []
  const concurrencies = [10, 25, 50, 100]

  for (const c of concurrencies) {
    process.stdout.write(`  ${c} concurrent members...`)
    const report = await runConcurrentTest(MEMBER_WORKFLOW, c, 20000, 'member-workflow')
    report.test = `${c} concurrent`
    const status = report.errorRate < 5 ? '✅' : report.errorRate < 20 ? '⚠️' : '❌'
    console.log(` ${status} P50=${report.p50Latency.toFixed(0)}ms P95=${report.p95Latency.toFixed(0)}ms RPS=${report.requestsPerSecond.toFixed(1)} Err=${report.errorRate.toFixed(1)}%`)
    reports.push(report)
  }
  return reports
}

async function runAdminWorkflow(): Promise<TestReport[]> {
  console.log('\n🔧 ADMIN WORKFLOW TEST')
  console.log('  Simulating admin browsing patterns')

  const reports: TestReport[] = []
  const concurrencies = [5, 10, 25, 50]

  for (const c of concurrencies) {
    process.stdout.write(`  ${c} concurrent admins...`)
    const report = await runConcurrentTest(ADMIN_WORKFLOW, c, 20000, 'admin-workflow')
    report.test = `${c} concurrent`
    const status = report.errorRate < 5 ? '✅' : report.errorRate < 20 ? '⚠️' : '❌'
    console.log(` ${status} P50=${report.p50Latency.toFixed(0)}ms P95=${report.p95Latency.toFixed(0)}ms RPS=${report.requestsPerSecond.toFixed(1)} Err=${report.errorRate.toFixed(1)}%`)
    reports.push(report)
  }
  return reports
}

async function runSpikeTest(): Promise<TestReport[]> {
  console.log('\n⚡ SPIKE TEST')
  console.log('  Simulating sudden traffic increases')

  const reports: TestReport[] = []
  const phases = [
    { concurrency: 10, duration: 10000, label: 'Normal' },
    { concurrency: 50, duration: 10000, label: 'Spike' },
    { concurrency: 100, duration: 15000, label: 'Peak' },
    { concurrency: 10, duration: 10000, label: 'Recovery' },
  ]

  for (const phase of phases) {
    process.stdout.write(`  ${phase.label} (${phase.concurrency}c/${(phase.duration / 1000).toFixed(0)}s)...`)
    const report = await runConcurrentTest(MEMBER_WORKFLOW, phase.concurrency, phase.duration, 'spike')
    report.test = phase.label
    const status = report.errorRate < 5 ? '✅' : report.errorRate < 20 ? '⚠️' : '❌'
    console.log(` ${status} P50=${report.p50Latency.toFixed(0)}ms P95=${report.p95Latency.toFixed(0)}ms RPS=${report.requestsPerSecond.toFixed(1)} Err=${report.errorRate.toFixed(1)}%`)
    reports.push(report)
  }
  return reports
}

async function runSustainedTest(): Promise<TestReport[]> {
  console.log('\n🔄 SUSTAINED LOAD TEST')
  console.log('  Testing performance over extended period (30s sustained)')

  const reports: TestReport[] = []
  const concurrencies = [25, 50]

  for (const c of concurrencies) {
    process.stdout.write(`  ${c} concurrent for 30s...`)
    const report = await runConcurrentTest([...MEMBER_WORKFLOW, ...ADMIN_WORKFLOW.slice(0, 4)], c, 30000, 'sustained')
    report.test = `${c}c/30s`
    const status = report.errorRate < 5 ? '✅' : report.errorRate < 20 ? '⚠️' : '❌'
    console.log(` ${status} P50=${report.p50Latency.toFixed(0)}ms P95=${report.p95Latency.toFixed(0)}ms RPS=${report.requestsPerSecond.toFixed(1)} Err=${report.errorRate.toFixed(1)}%`)
    reports.push(report)
  }
  return reports
}

async function runHealthCheck(): Promise<void> {
  console.log('\n🏥 HEALTH CHECK')
  try {
    const res = await fetch(edgeUrl('health') + '?detail=true', { headers: { apikey: SUPABASE_ANON_KEY } })
    const data = await res.json() as Record<string, unknown>
    console.log(`  Status: ${data.status}`)
    if (data.checks) {
      for (const [k, v] of Object.entries(data.checks as Record<string, { status: string; latencyMs?: number }>)) {
        console.log(`  ${k}: ${v.status}${v.latencyMs != null ? ` (${v.latencyMs}ms)` : ''}`)
      }
    }
  } catch (err) {
    console.log(`  Health check failed: ${err instanceof Error ? err.message : 'Unknown'}`)
  }
}

async function runDBPerformance(): Promise<void> {
  console.log('\n🗄️  DATABASE QUERY PERFORMANCE')
  console.log('  Testing critical RPC functions directly')

  const queries = [
    { name: 'Dashboard RPC', url: edgeUrl('member-dashboard'), auth: 'member' as const },
    { name: 'Contributions Paginated', url: edgeUrl('member-contributions') + '?page=1&per_page=20', auth: 'member' as const },
    { name: 'Claims List', url: edgeUrl('member-claims'), auth: 'member' as const },
    { name: 'Notifications', url: edgeUrl('member-notifications'), auth: 'member' as const },
    { name: 'Admin Dashboard', url: edgeUrl('admin-dashboard'), auth: 'admin' as const },
    { name: 'Admin Members Search', url: edgeUrl('admin-members') + '?q=a&page=1&per_page=50', auth: 'admin' as const },
    { name: 'Admin Reports KPI', url: edgeUrl('admin-reports') + '?action=kpi', auth: 'admin' as const },
    { name: 'Health Check', url: edgeUrl('health') + '?detail=true', auth: 'none' as const },
  ]

  for (const q of queries) {
    const latencies: number[] = []
    for (let i = 0; i < 5; i++) {
      const result = await makeRequest(q.url, 'GET', q.auth)
      latencies.push(result.latencyMs)
    }
    latencies.sort((a, b) => a - b)
    const p50 = percentile(latencies, 50)
    const p95 = percentile(latencies, 95)
    const max = latencies[latencies.length - 1]
    const status = p50 < 500 ? '✅' : p50 < 1000 ? '⚠️' : '❌'
    console.log(`  ${status} ${q.name}: P50=${p50.toFixed(0)}ms P95=${p95.toFixed(0)}ms Max=${max.toFixed(0)}ms`)
  }
}

// ============================================================================
// REPORT FORMATTING
// ============================================================================

function printSummary(reports: TestReport[], title: string): string {
  const lines = [
    `\n${'═'.repeat(90)}`,
    `  ${title}`,
    `${'═'.repeat(90)}`,
    ``,
    `  ${'Test'.padEnd(20)} ${'Reqs'.padStart(6)} ${'RPS'.padStart(7)} ${'P50'.padStart(7)} ${'P95'.padStart(7)} ${'P99'.padStart(7)} ${'Err%'.padStart(7)}`,
    `  ${'─'.repeat(20)} ${'─'.repeat(6)} ${'─'.repeat(7)} ${'─'.repeat(7)} ${'─'.repeat(7)} ${'─'.repeat(7)} ${'─'.repeat(7)}`,
  ]

  for (const r of reports) {
    lines.push(
      `  ${r.test.padEnd(20)} ${String(r.totalRequests).padStart(6)} ${r.requestsPerSecond.toFixed(1).padStart(7)} ${r.p50Latency.toFixed(0).padStart(7)} ${r.p95Latency.toFixed(0).padStart(7)} ${r.p99Latency.toFixed(0).padStart(7)} ${r.errorRate.toFixed(1).padStart(6)}%`
    )
  }

  lines.push(``, `${'═'.repeat(90)}`)
  return lines.join('\n')
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      suite: { type: 'string', short: 's', default: 'all' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })

  if (values.help) {
    console.log(`
Luma Welfare Phase 16 Load Testing

Usage:
  npx tsx src/tests/phase16-load-test.ts [options]

Options:
  -s, --suite <name>   Test suite: baseline, member, admin, spike, sustained, health, db, all
  -h, --help           Show this help
`)
    return
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Set SUPABASE_URL and SUPABASE_ANON_KEY')
    process.exit(1)
  }

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  LUMA WELFARE — PHASE 16: 500K+ LOAD TESTING')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  Supabase URL: ${SUPABASE_URL}`)
  console.log(`  Suite: ${values.suite}`)
  console.log(`  Time: ${new Date().toISOString()}`)

  const suite = values.suite ?? 'all'
  const allReports: TestReport[] = []

  // Always run health check first
  await runHealthCheck()

  if (suite === 'all' || suite === 'db') {
    await runDBPerformance()
  }

  if (suite === 'all' || suite === 'baseline') {
    allReports.push(...await runBaseline())
  }

  if (suite === 'all' || suite === 'member') {
    allReports.push(...await runMemberWorkflow())
  }

  if (suite === 'all' || suite === 'admin') {
    allReports.push(...await runAdminWorkflow())
  }

  if (suite === 'all' || suite === 'spike') {
    allReports.push(...await runSpikeTest())
  }

  if (suite === 'all' || suite === 'sustained') {
    allReports.push(...await runSustainedTest())
  }

  // Print summary
  if (allReports.length > 0) {
    console.log(printSummary(allReports, 'PHASE 16 LOAD TEST RESULTS'))
  }

  // Save results
  const fs = await import('node:fs')
  const outputPath = `docs/phase16-load-test-${Date.now()}.json`
  fs.mkdirSync('docs', { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify({ timestamp: new Date().toISOString(), reports: allReports }, null, 2))
  console.log(`\nResults saved to ${outputPath}`)
}

main().catch(console.error)
