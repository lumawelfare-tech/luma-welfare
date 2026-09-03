import { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

type AuditLog = {
  id: string
  actor_id: string | null
  actor_role: string | null
  action: string
  resource: string
  resource_id: string | null
  meta: Record<string, unknown> | null
  ip: string | null
  created_at: string
}

const PAGE_SIZE = 50

export function AdminAuditLogs() {
  useHead('Audit Logs', undefined, { noindex: true })
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebouncedValue(search, 300)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [uniqueActions, setUniqueActions] = useState<string[]>([])

  const load = useCallback(async () => {
    setError(null)
    try {
      const qs = new URLSearchParams()
      qs.set('resource_id', 'audit_logs')
      qs.set('page', String(page))
      qs.set('per_page', String(PAGE_SIZE))
      if (filter) qs.set('action', filter)
      if (debouncedSearch.trim()) qs.set('q', debouncedSearch.trim())
      const d = await api<{ items: AuditLog[]; total?: number; pages?: number; actions?: string[] }>(
        `/admin/settings?${qs.toString()}`,
        { auth: true }
      )
      setLogs(d.items ?? [])
      setTotalCount(d.total ?? (d.items?.length ?? 0))
      setTotalPages(d.pages ?? 1)
      if (d.actions) setUniqueActions(d.actions)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load audit logs.')
    } finally {
      setLoading(false)
    }
  }, [page, filter, debouncedSearch])

  // eslint-disable-next-line oxc/react/set-state-in-effect — loading initialized to true; setLoading(false) in finally after await
  useEffect(() => { load() }, [load])

  // eslint-disable-next-line oxc/react/set-state-in-effect — setPage(1) resets pagination on filter change; page flows through load()
  useEffect(() => { setPage(1) }, [filter, debouncedSearch])

  // Fetch unique actions for filter dropdown (if not provided by API)
  useEffect(() => {
    if (uniqueActions.length === 0) {
      api<{ items: AuditLog[] }>('/admin/settings?resource_id=audit_logs&per_page=1000', { auth: true })
        .then(d => {
          const actions = [...new Set((d.items ?? []).map(l => l.action))].sort()
          setUniqueActions(actions)
        })
        .catch(() => {})
    }
  }, [])

  return (
    <div className="py-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="mt-1 text-sm text-gray-500">Immutable record of administrative actions.</p>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs…"
            aria-label="Search audit logs"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-luma-500"
          />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by action" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="">All actions</option>
          {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-xs text-gray-400">{totalCount.toLocaleString()} total records</span>
      </div>

      {/* Table */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="h-6 w-6 animate-spin text-luma-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="ml-3 text-sm text-gray-500">Loading audit logs…</span>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Resource ID</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{log.action}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{log.resource}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400" title={log.resource_id ?? ''}>{log.resource_id?.slice(0, 8) ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{log.actor_role ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate" title={log.meta ? JSON.stringify(log.meta) : ''}>
                      {log.meta ? JSON.stringify(log.meta) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && <div className="p-10 text-center text-gray-500">No audit logs found.</div>}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Page {page} of {totalPages} ({totalCount.toLocaleString()} records)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4))
              const pageNum = start + i
              if (pageNum > totalPages) return null
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    page === pageNum
                      ? 'bg-luma-700 text-white'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
