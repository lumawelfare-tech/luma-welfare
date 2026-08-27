import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'

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

export function AdminAuditLogs() {
  useHead('Audit Logs', undefined, { noindex: true })
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')

  async function load() {
    try {
      let path = '/admin/settings?resource=audit_logs'
      if (filter) path += `&action=${filter}`
      const d = await api<{ items: AuditLog[] }>(path, { auth: true })
      setLogs(d.items ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load audit logs.')
    }
  }

  useEffect(() => { load() }, [filter])

  const filtered = search
    ? logs.filter(l =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.resource.toLowerCase().includes(search.toLowerCase()) ||
        l.resource_id?.toLowerCase().includes(search.toLowerCase())
      )
    : logs

  const uniqueActions = [...new Set(logs.map(l => l.action))].sort()

  return (
    <div className="py-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="mt-1 text-sm text-gray-500">Immutable record of administrative actions.</p>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search logs…"
          aria-label="Search audit logs"
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500"
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by action" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="">All actions</option>
          {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
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
            {filtered.map((log) => (
              <tr key={log.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{log.action}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{log.resource}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">{log.resource_id?.slice(0, 8) ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{log.actor_role ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                  {log.meta ? JSON.stringify(log.meta) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-10 text-center text-gray-500">No audit logs found.</div>}
      </div>
    </div>
  )
}
