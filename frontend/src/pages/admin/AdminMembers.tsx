import { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../../lib/api'
import { useToast } from '../../components/Toast'
import { DataTable, type Column } from '../../components/DataTable'
import { BulkActionBar } from '../../components/BulkActionBar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ExportDialog } from '../../components/ExportDialog'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

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
  const { addToast } = useToast()
  const [members, setMembers] = useState<Member[]>([])
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const perPage = 50

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Export
  const [showExport, setShowExport] = useState(false)

  // CSV Import
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ row: number; email: string; status: string; message: string }[] | null>(null)

  // Member detail
  const [detailMember, setDetailMember] = useState<Member | null>(null)
  const [detailData, setDetailData] = useState<{ member: Record<string, unknown>; subscriptions: Record<string, unknown>[]; family_members: Record<string, unknown>[]; contributions: Record<string, unknown>[] } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Bulk dialogs
  const [bulkAction, setBulkAction] = useState<'active' | 'suspended' | 'closed' | null>(null)

  const load = useCallback(async (pageNum = 1) => {
    setError(null)
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filter) qs.set('status', filter)
      if (debouncedQuery.trim()) qs.set('q', debouncedQuery.trim())
      qs.set('page', String(pageNum))
      qs.set('per_page', String(perPage))
      const d = await api<{ members: Member[]; total: number; page: number; pages: number }>(`/admin/members?${qs.toString()}`, { auth: true })
      setMembers(d.members ?? [])
      setTotalCount(d.total ?? 0)
      setTotalPages(d.pages ?? 1)
      setPage(d.page ?? pageNum)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load members.')
    } finally {
      setLoading(false)
    }
  }, [filter, debouncedQuery])

  useEffect(() => { load(1) }, [load])

  async function viewMember(member: Member) {
    setDetailMember(member)
    setDetailData(null)
    setLoadingDetail(true)
    try {
      const d = await api<{ member: Record<string, unknown>; subscriptions: Record<string, unknown>[]; family_members: Record<string, unknown>[]; contributions: Record<string, unknown>[] }>(`/admin/members/${member.id}`, { auth: true })
      setDetailData(d)
    } catch {
      addToast('warning', 'Could not load member details.')
    } finally {
      setLoadingDetail(false)
    }
  }

  async function setStatus(id: string, status: 'active' | 'suspended' | 'closed') {
    setBusyId(id)
    try {
      await api(`/admin/members/${id}`, { method: 'PATCH', auth: true, body: { status } })
      addToast('success', `Member ${status === 'active' ? 'approved' : status === 'suspended' ? 'suspended' : 'closed'}.`)
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not update the member.')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteMember() {
    if (!deleteTarget || confirmText !== 'DELETE') return
    setDeleteBusy(true)
    try {
      await api(`/admin/members/${deleteTarget.id}`, { method: 'DELETE', auth: true })
      addToast('success', `Member "${deleteTarget.full_name}" has been deactivated.`)
      setDeleteTarget(null)
      setConfirmText('')
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not delete the member.')
    } finally {
      setDeleteBusy(false)
    }
  }

  async function bulkStatusUpdate(status: 'active' | 'suspended' | 'closed') {
    setBulkLoading(true)
    const ids = Array.from(selectedIds)
    let success = 0
    let errors = 0
    for (const id of ids) {
      try {
        await api(`/admin/members/${id}`, { method: 'PATCH', auth: true, body: { status } })
        success++
      } catch {
        errors++
      }
    }
    setBulkLoading(false)
    setBulkAction(null)
    setSelectedIds(new Set())
    if (errors > 0) {
      addToast('warning', `${success} updated, ${errors} failed.`)
    } else {
      addToast('success', `${success} member${success !== 1 ? 's' : ''} ${status === 'active' ? 'approved' : status === 'suspended' ? 'suspended' : 'closed'}.`)
    }
    await load()
  }

  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split('\n').filter((l) => l.trim())
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
    return lines.slice(1).map((line) => {
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
        addToast('success', `Successfully imported ${d.summary.success} members.`)
        await load()
      } else {
        addToast('warning', `Imported ${d.summary.success} of ${d.summary.total} members.`)
      }
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Import failed.')
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

  const columns: Column<Member>[] = [
    {
      key: 'full_name',
      header: 'Member',
      sortable: true,
      render: (m) => (
        <button onClick={() => viewMember(m)} className="text-left hover:underline">
          <div className="font-medium text-gray-900">{m.full_name}</div>
          <div className="text-xs text-gray-500">{m.email ?? ''}</div>
          {m.membership_number && <div className="text-xs text-gray-400">#{m.membership_number}</div>}
        </button>
      ),
    },
    { key: 'phone', header: 'Phone', sortable: true },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (m) => (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(m.status)}`}>
          {m.status.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'joined_at',
      header: 'Joined',
      sortable: true,
      render: (m) => (
        <span className="text-gray-500 text-xs">
          {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (m) => (
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
      ),
    },
  ]

  return (
    <div className="py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Members</h1>
          <p className="mt-1 text-sm text-gray-500">{totalCount} member{totalCount !== 1 ? 's' : ''} found</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowExport(true)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Export CSV
          </button>
          <button onClick={() => { setShowImport(true); setImportFile(null); setImportResults(null) }} className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 transition-colors">
            Import CSV
          </button>
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
            aria-label="Search members"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, membership #..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Members Table with Selection */}
      <div className="mt-6">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <svg className="mx-auto h-6 w-6 animate-spin text-luma-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="mt-3 text-sm text-gray-500">Loading members…</p>
          </div>
        ) : (
          <DataTable
            data={members as unknown as Record<string, unknown>[]}
            columns={columns as Column<Record<string, unknown>>[]}
            keyExtractor={(r) => String(r.id)}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            getId={(r) => String(r.id)}
            pageSize={25}
            emptyMessage="No members found."
            renderMobileCard={(row) => {
              const m = row as unknown as Member
              return (
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{m.full_name}</div>
                      <div className="text-xs text-gray-500">{m.email ?? ''}</div>
                      {m.membership_number && <div className="text-xs text-gray-400">#{m.membership_number}</div>}
                    </div>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(m.status)}`}>
                      {m.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">{m.phone}</div>
                  <div className="flex gap-2">
                    {m.status === 'pending_approval' && (
                      <button
                        disabled={busyId === m.id}
                        onClick={() => setStatus(m.id, 'active')}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                    )}
                    {m.status === 'active' && (
                      <button
                        disabled={busyId === m.id}
                        onClick={() => setStatus(m.id, 'suspended')}
                        className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    )}
                    {m.status === 'suspended' && (
                      <button
                        disabled={busyId === m.id}
                        onClick={() => setStatus(m.id, 'active')}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Reinstate
                      </button>
                    )}
                    {m.status !== 'closed' && (
                      <button
                        disabled={busyId === m.id}
                        onClick={() => { setDeleteTarget(m); setConfirmText('') }}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )
            }}
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => load(page + 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          { label: 'Approve', variant: 'primary', onClick: () => setBulkAction('active'), loading: bulkLoading },
          { label: 'Suspend', variant: 'warning', onClick: () => setBulkAction('suspended'), loading: bulkLoading },
          { label: 'Close', variant: 'danger', onClick: () => setBulkAction('closed'), loading: bulkLoading },
        ]}
      />

      {/* Bulk Action Confirm Dialog */}
      <ConfirmDialog
        open={bulkAction !== null}
        title={bulkAction === 'active' ? 'Approve Members' : bulkAction === 'suspended' ? 'Suspend Members' : 'Close Members'}
        message={`This will ${bulkAction === 'active' ? 'approve' : bulkAction === 'suspended' ? 'suspend' : 'close'} ${selectedIds.size} selected member${selectedIds.size !== 1 ? 's' : ''}.`}
        confirmLabel={bulkAction === 'active' ? 'Approve All' : bulkAction === 'suspended' ? 'Suspend All' : 'Close All'}
        variant={bulkAction === 'active' ? 'primary' : bulkAction === 'suspended' ? 'warning' : 'danger'}
        loading={bulkLoading}
        onConfirm={() => bulkAction && bulkStatusUpdate(bulkAction)}
        onCancel={() => setBulkAction(null)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Member"
        variant="danger"
        confirmLabel="Deactivate Member"
        loading={deleteBusy}
        onConfirm={deleteMember}
        onCancel={() => { setDeleteTarget(null); setConfirmText('') }}
        message={
          <>
            <div className="rounded-lg bg-gray-50 px-4 py-3 mb-3">
              <p className="text-sm font-medium text-gray-900">{deleteTarget?.full_name}</p>
              <p className="text-xs text-gray-500">{deleteTarget?.email ?? deleteTarget?.phone}</p>
              <p className="text-xs text-gray-400">Status: {deleteTarget?.status}</p>
            </div>
            <p>This will <strong>deactivate</strong> the member account. All historical records will be preserved. The member will no longer be able to access their account.</p>
            <div className="mt-3">
              <label className="text-sm font-medium text-gray-700">
                Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
              </label>
              <input
                aria-label="Type member name to confirm deletion"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Type "DELETE" to confirm'
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && confirmText === 'DELETE' && deleteMember()}
              />
            </div>
          </>
        }
      />

      {/* Import CSV Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Import Members from CSV</h3>
                <button onClick={() => setShowImport(false)} aria-label="Close import dialog" className="text-gray-400 hover:text-gray-600">
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
                      aria-label="Select CSV file to import"
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

      <ExportDialog
        open={showExport}
        onClose={() => setShowExport(false)}
        exportType="members"
        filters={{ status: filter || undefined, q: debouncedQuery.trim() || undefined }}
        filterLabels={{ status: 'Status', q: 'Search' }}
      />

      {/* Member Detail Drawer */}
      {detailMember && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40" onClick={() => setDetailMember(null)}>
          <div className="h-full w-full max-w-lg bg-white shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{detailMember.full_name}</h3>
                <p className="text-sm text-gray-500">{detailMember.email ?? detailMember.phone}</p>
              </div>
              <button onClick={() => setDetailMember(null)} aria-label="Close" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {loadingDetail ? (
              <div className="p-12 text-center text-gray-400">Loading member details…</div>
            ) : detailData ? (
              <div className="p-6 space-y-6">
                {/* Member Info */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Member Info</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-gray-400">Status</span><div className="font-medium capitalize">{String(detailData.member.status ?? '')}</div></div>
                    <div><span className="text-gray-400">Phone</span><div className="font-medium">{String(detailData.member.phone ?? '')}</div></div>
                    <div><span className="text-gray-400">Email</span><div className="font-medium">{String(detailData.member.email ?? '—')}</div></div>
                    <div><span className="text-gray-400">Membership #</span><div className="font-medium">{String(detailData.member.membership_number ?? '—')}</div></div>
                    <div><span className="text-gray-400">Joined</span><div className="font-medium">{detailData.member.joined_at ? new Date(String(detailData.member.joined_at)).toLocaleDateString() : '—'}</div></div>
                  </div>
                </div>

                {/* Subscriptions */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Subscriptions ({detailData.subscriptions.length})</h4>
                  {detailData.subscriptions.length === 0 ? (
                    <p className="text-sm text-gray-400">No subscriptions</p>
                  ) : (
                    <div className="space-y-2">
                      {detailData.subscriptions.map((sub: Record<string, unknown>) => (
                        <div key={String(sub.id)} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                          <div>
                            <div className="text-sm font-medium">{String((sub.packages as Record<string, unknown>)?.name ?? '—')}</div>
                            <div className="text-xs text-gray-500">{String((sub.package_tiers as Record<string, unknown>)?.name ?? '')}</div>
                          </div>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${sub.status === 'active' ? 'bg-emerald-100 text-emerald-700' : sub.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{String(sub.status)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Contributions */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Contributions ({detailData.contributions.length})</h4>
                  {detailData.contributions.length === 0 ? (
                    <p className="text-sm text-gray-400">No contributions</p>
                  ) : (
                    <div className="space-y-1">
                      {detailData.contributions.slice(0, 10).map((c: Record<string, unknown>) => (
                        <div key={String(c.id)} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                          <span className="text-gray-600">{String(c.period)}</span>
                          <span className="font-medium">KSh {Number(c.amount ?? 0).toLocaleString()}</span>
                          <span className={`text-xs font-medium ${c.status === 'Verified' || c.status === 'Paid' ? 'text-emerald-600' : c.status === 'Pending' ? 'text-amber-600' : 'text-red-600'}`}>{String(c.status)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Family Members */}
                {detailData.family_members.length > 0 && (
                  <div className="rounded-xl border border-gray-200 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Family Members ({detailData.family_members.length})</h4>
                    <div className="space-y-1">
                      {detailData.family_members.map((f: Record<string, unknown>) => (
                        <div key={String(f.id)} className="text-sm py-1.5 border-b border-gray-100 last:border-0">
                          <span className="font-medium">{String(f.full_name ?? '')}</span>
                          <span className="text-gray-400 ml-2">{String(f.relationship ?? '')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
