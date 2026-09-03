import { useEffect, useState, useCallback } from 'react'
import { api } from '../../lib/api'
import { useHead } from '../../lib/seo'

type HealthCheck = {
  id: string
  checked_at: string
  overall: 'healthy' | 'degraded' | 'unhealthy'
  duration_ms: number
  checks: Record<string, {
    status: string
    latencyMs: number
    error?: string
    details?: Record<string, unknown>
  }>
  alerts_sent: number
  metadata: Record<string, unknown>
}

type HealthSummary = {
  total_checks: number
  healthy_count: number
  degraded_count: number
  unhealthy_count: number
  avg_duration_ms: number
  last_check_at: string | null
  last_check_overall: string | null
  uptime_pct: number
}

type HealthHistoryData = {
  health_history: {
    checks: HealthCheck[]
    summary: HealthSummary
  }
}

const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
  healthy:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  degraded:  { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  unhealthy: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
}

function StatusBadge({ status }: { status: string }) {
  const colors = statusColors[status] ?? statusColors.healthy
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${colors.bg} ${colors.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function UptimeBar({ data }: { data: HealthCheck[] }) {
  // Group by day for the last 7 days
  const days: { date: string; status: string; checks: number }[] = []
  const now = new Date()

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const dayChecks = data.filter(c => c.checked_at.startsWith(dateStr))

    let worstStatus = 'healthy'
    if (dayChecks.some(c => c.overall === 'unhealthy')) worstStatus = 'unhealthy'
    else if (dayChecks.some(c => c.overall === 'degraded')) worstStatus = 'degraded'

    days.push({
      date: dateStr,
      status: dayChecks.length > 0 ? worstStatus : 'no-data',
      checks: dayChecks.length,
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>7 days ago</span>
        <span>Today</span>
      </div>
      <div className="flex gap-1">
        {days.map((day) => {
          const colors = statusColors[day.status] ?? { bg: 'bg-gray-100', text: 'text-gray-400', dot: 'bg-gray-300' }
          return (
            <div
              key={day.date}
              className={`flex-1 h-8 rounded-md ${colors.bg} flex items-center justify-center group relative cursor-default`}
              title={`${day.date}: ${day.status} (${day.checks} checks)`}
            >
              {day.status === 'healthy' && (
                <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
              {day.status === 'degraded' && (
                <svg className="h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              )}
              {day.status === 'unhealthy' && (
                <svg className="h-3.5 w-3.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                </svg>
              )}
              {day.status === 'no-data' && (
                <span className="text-[10px] text-gray-400">—</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const LatencyChart = function LatencyChart({ data }: { data: HealthCheck[] }) {
  if (data.length === 0) return null

  const sorted = [...data].sort((a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime())
  const maxLatency = Math.max(...sorted.map(c => c.duration_ms), 1)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Response Latency (ms)</span>
        <span>Max: {maxLatency}ms</span>
      </div>
      <div className="flex items-end gap-px" style={{ height: 80 }}>
        {sorted.map((check) => {
          const heightPct = (check.duration_ms / maxLatency) * 100
          return (
            <div
              key={check.id}
              className="flex-1 min-w-[2px] rounded-t transition-all group relative"
              style={{ height: `${Math.max(heightPct, 4)}%` }}
              title={`${new Date(check.checked_at).toLocaleString()}: ${check.duration_ms}ms (${check.overall})`}
            >
              <div className={`h-full w-full rounded-t ${check.overall === 'healthy' ? 'bg-emerald-400' : check.overall === 'degraded' ? 'bg-amber-400' : 'bg-red-400'}`} />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>{sorted.length > 0 ? new Date(sorted[0].checked_at).toLocaleDateString() : ''}</span>
        <span>{sorted.length > 0 ? new Date(sorted[sorted.length - 1].checked_at).toLocaleDateString() : ''}</span>
      </div>
    </div>
  )
}

export function AdminHealthCheck() {
  useHead('Health Checks', undefined, { noindex: true })
  const [data, setData] = useState<HealthHistoryData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const d = await api<HealthHistoryData>(`/admin/monitoring?action=health-history&days=${days}&limit=50`, { auth: true })
      setData(d)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load health check history.')
    } finally {
      setLoading(false)
    }
  }, [days])

  // eslint-disable-next-line oxc/react/set-state-in-effect — loading initialized true; setLoading(false) in finally after await
  useEffect(() => { fetchData() }, [fetchData])

  const summary = data?.health_history.summary
  const checks = data?.health_history.checks ?? []

  return (
    <div className="py-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          <p className="mt-1 text-sm text-gray-500">Automated health check history and uptime monitoring.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            aria-label="Time range"
          >
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={fetchData}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="text-3xl font-extrabold text-gray-900">{summary.uptime_pct.toFixed(1)}%</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Uptime</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full ${summary.uptime_pct >= 99 ? 'bg-emerald-500' : summary.uptime_pct >= 95 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(summary.uptime_pct, 100)}%` }}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="text-3xl font-extrabold text-emerald-700">{summary.healthy_count}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Healthy Checks</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="text-3xl font-extrabold text-amber-700">{summary.degraded_count + summary.unhealthy_count}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Issues Detected</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="text-3xl font-extrabold text-blue-700">{Math.round(summary.avg_duration_ms)}ms</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Avg Latency</div>
          </div>
        </div>
      )}

      {/* Last Check Status */}
      {summary?.last_check_at && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <StatusBadge status={summary.last_check_overall ?? 'unknown'} />
          <span className="text-sm text-gray-600">
            Last check: {new Date(summary.last_check_at).toLocaleString()}
          </span>
          <span className="text-xs text-gray-400">
            ({summary.total_checks} total checks in {days} days)
          </span>
        </div>
      )}

      {/* Uptime Bar */}
      {checks.length > 0 && (
        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Uptime Overview</h2>
          <UptimeBar data={checks} />
        </div>
      )}

      {/* Latency Chart */}
      {checks.length > 0 && (
        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5">
          <LatencyChart data={checks} />
        </div>
      )}

      {/* Check History Table */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Health Endpoint</th>
              <th className="px-4 py-3">Admin Monitoring</th>
              <th className="px-4 py-3">Database</th>
              <th className="px-4 py-3">Alerts</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && checks.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-4 py-3"><div className="h-4 w-32 animate-pulse rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 animate-pulse rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-8 animate-pulse rounded bg-gray-200" /></td>
                  <td className="px-4 py-3"></td>
                </tr>
              ))
            ) : checks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <p className="font-medium">No health checks recorded yet</p>
                    <p className="text-xs text-gray-400">The daily cron job will start recording results.</p>
                  </div>
                </td>
              </tr>
            ) : (
              checks.map((check) => {
                const isExpanded = expandedId === check.id
                return (
                  <tr key={check.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(check.checked_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={check.overall} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 font-mono">
                      {check.duration_ms}ms
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={check.checks['health-endpoint']?.status ?? 'unknown'} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={check.checks['admin-monitoring']?.status ?? 'unknown'} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={check.checks['database']?.status ?? 'unknown'} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {check.alerts_sent > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                          </svg>
                          {check.alerts_sent}
                        </span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : check.id)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                      >
                        <svg className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Expanded Detail Rows */}
        {checks.filter(c => expandedId === c.id).map(check => (
          <div key={`detail-${check.id}`} className="border-t border-gray-200 bg-gray-50 px-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {Object.entries(check.checks).map(([name, svc]) => (
                <div key={name} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">{name}</span>
                    <StatusBadge status={svc.status} />
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-gray-500">
                    <div>Latency: <span className="font-mono text-gray-700">{svc.latencyMs}ms</span></div>
                    {svc.error && <div className="text-red-600">Error: {svc.error}</div>}
                    {svc.details && (
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-50 p-2 text-[10px] text-gray-500">
                        {JSON.stringify(svc.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default AdminHealthCheck
