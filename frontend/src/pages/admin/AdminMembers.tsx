import { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../../lib/api'

type Member = {
  id: string
  membership_number: string | null
  full_name: string
  phone: string
  email: string | null
  status: string
  joined_at: string | null
}

export function AdminMembers() {
  const [members, setMembers] = useState<Member[]>([])
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null)
  const [confirmText, setConfirmText] = useState('')

  // CSV Import state
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ row: number; email: string; status: string; message: string }[] | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (filter) qs.set('status', filter)
      if (query.trim()) qs.set('q', query.trim())
      const qsStr = qs.toString()
      const d = await api<{ members: Member[] }>(`/admin/members${qsStr ? '?' + qsStr : ''}`, { auth: true })
      setMembers(d.members ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load members.')
    }
  }, [filter, query])

  useEffect(() => {
    load()
  }, [load])

  async function setStatus(id: string, status: 'active' | 'suspended' | 'closed') {
    setBusyId(id)
    try {
      await api(`/admin/members/${id}`, { method: 'PATCH', auth: true, body: { status } })
      setNotice(`Member ${status === 'active' ? 'approved' : status === 'suspended' ? 'suspended' : 'closed'}.`)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the member.')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteMember() {
    if (!deleteTarget || confirmText !== 'DELETE') return
    setBusyId(deleteTarget.id)
    try {
      await api(`/admin/members/${deleteTarget.id}`, { method: 'DELETE', auth: true })
      setNotice(`Member "${deleteTarget.full_name}" has been deactivated.`)
      setDeleteTarget(null)
      setConfirmText('')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the member.')
      setDeleteTarget(null)
      setConfirmText('')
    } finally {
      setBusyId(null)
    }
  }

  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
    return lines.slice(1).map(line => {
      const values: string[] = []
      let current = ''
      let inQuotes = false
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; continue }
        if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
        current += char
      }
      values.push(current.trim())
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = values[i] ?? '' })
      return row
    })
  }

  async function handleImport() {
    if (!importFile) return
    setImporting(true)
    setImportResults(null)
    try {
      const text = await importFile.text()
      const rows = parseCSV(text)
      if (rows.length === 0) {
        setImportResults([{ row: 0, email: '', status: 'error', message: 'No data rows found in CSV.' }])
        return
      }
      const d = await api<{ results: { row: number; email: string; status: string; message: string }[]; summary: { total: number; success: number; errors: number } }>(
        '/admin/members?action=import',
        { method: 'POST', auth: true, body: { members: rows } },
      )
      setImportResults(d.results ?? [])
      if (d.summary.errors === 0) {
        setNotice(`Successfully imported ${d.summary.success} members.`)
        await load()
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'active': return 'bg-emerald-100 text-emerald-700'
      case 'pending_approval': return 'bg-amber-100 text-amber-700'
      case 'suspended': return 'bg-red-100 text-red-700'
      case 'closed': return 'bg-gray-100 text-gray-500'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  return (
    <div className="py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Members</h1>
          <p className="mt-1 text-sm text-gray-500">{members.length} member{members.length !== 1 ? 's' : ''} found</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {[
            { value: '', label: 'All' },
            { value: 'pending_approval', label: 'Pending' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'closed', label: 'Closed' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.value ? 'bg-luma-100 text-luma-700' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Search name, phone, membership #..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-luma-500"
          />
        </div>
        <button onClick={load} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors">
          Search
        </button>
        <button onClick={() => { setShowImport(true); setImportFile(null); setImportResults(null) }} className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 transition-colors">
          Import CSV
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>
      )}

      {/* Members Table */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{m.full_name}</div>
                  <div className="text-xs text-gray-500">{m.email ?? ''}</div>
                  {m.membership_number && (
                    <div className="text-xs text-gray-400">#{m.membership_number}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{m.phone}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(m.status)}`}>
                    {m.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    {m.status === 'pending_approval' && (
                      <button
                        disabled={busyId === m.id}
                        onClick={() => setStatus(m.id, 'active')}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        Approve
                      </button>
                    )}
                    {m.status === 'active' && (
                      <button
                        disabled={busyId === m.id}
                        onClick={() => setStatus(m.id, 'suspended')}
                        className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        Suspend
                      </button>
                    )}
                    {m.status === 'suspended' && (
                      <button
                        disabled={busyId === m.id}
                        onClick={() => setStatus(m.id, 'active')}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        Reinstate
                      </button>
                    )}
                    {m.status !== 'closed' && (
                      <button
                        disabled={busyId === m.id}
                        onClick={() => { setDeleteTarget(m); setConfirmText('') }}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <p className="mt-3 text-sm text-gray-500">No members found.</p>
          </div>
        )}
      </div>

      {/* Import CSV Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Import Members from CSV</h3>
                <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
                <p className="font-medium">Required CSV columns:</p>
                <p className="mt-1 font-mono text-xs">full_name, phone, email (optional)</p>
                <p className="mt-2 text-xs text-blue-600">Members are imported with <strong>active</strong> status and a registration fee record is created automatically.</p>
              </div>

              {!importResults ? (
                <>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700">Select CSV File</label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-luma-100 file:px-3 file:py-1 file:text-sm file:font-medium file:text-luma-700 hover:file:bg-luma-200"
                    />
                  </div>

                  <div className="mt-4">
                    <button
                      onClick={handleImport}
                      disabled={!importFile || importing}
                      className="w-full rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {importing ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          Importing...
                        </span>
                      ) : 'Import Members'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700">Import Results</h4>
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                        <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Message</th></tr>
                      </thead>
                      <tbody>
                        {importResults.map((r, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-500">{r.row || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{r.email || '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                r.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                              }`}>{r.status}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{r.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => { setShowImport(false); setImportFile(null); setImportResults(null) }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {importResults ? 'Close' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                  <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Member</h3>
                  <p className="text-sm text-gray-500">This action cannot be easily undone.</p>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-900">{deleteTarget.full_name}</p>
                <p className="text-xs text-gray-500">{deleteTarget.email ?? deleteTarget.phone}</p>
                <p className="text-xs text-gray-400">Status: {deleteTarget.status}</p>
              </div>

              <p className="mt-4 text-sm text-gray-600">
                This will <strong>deactivate</strong> the member account. All historical records (subscriptions, contributions, claims) will be preserved. The member will no longer be able to access their account.
              </p>

              <div className="mt-4">
                <label className="text-sm font-medium text-gray-700">
                  Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
                </label>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder='Type "DELETE" to confirm'
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && confirmText === 'DELETE' && deleteMember()}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => { setDeleteTarget(null); setConfirmText('') }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={confirmText !== 'DELETE' || busyId === deleteTarget.id}
                onClick={deleteMember}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {busyId === deleteTarget.id ? 'Deactivating...' : 'Deactivate Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
