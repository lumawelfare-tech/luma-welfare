import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { useToast } from '../../components/Toast'
import { DataTable, type Column } from '../../components/DataTable'
import { BulkActionBar } from '../../components/BulkActionBar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { FilterBar } from '../../components/FilterBar'
import { FilterDrawer } from '../../components/FilterDrawer'
import { SearchInput } from '../../components/SearchInput'
import { StatusBadge } from '../../components/StatusBadge'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { exportClaimRecordsCSV, exportClaimRecordsExcel, exportClaimRecordsPDF, type ClaimRecord } from '../../lib/exports'
import { ErrorState } from '../../components/ErrorState'
import { SkeletonTable } from '../../components/Skeleton'
import { reportLoadError } from '../../lib/userFacingError'

type Claim = {
  id: string
  claim_number: string
  claim_type: string | null
  amount_requested: number | null
  approved_amount: number | null
  description: string | null
  status: string
  admin_notes: string | null
  created_at: string
  submitted_at: string | null
  decided_at: string | null
  member_id: string
  members: { full_name: string | null; phone: string | null; email: string | null } | null
  packages: { code: string | null; name: string | null } | null
}

type ClaimDocument = {
  id: string
  document_type: string
  file_name: string
  file_url: string
  uploaded_at: string
}

const filterTabs = [
  { value: '', label: 'All' },
  { value: 'Submitted', label: 'Submitted' },
  { value: 'Under Review', label: 'Under Review' },
  { value: 'Additional Information Required', label: 'Info Needed' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Paid', label: 'Paid' },
]

const ALLOWED_CLAIM_STATUS = new Set(filterTabs.map((f) => f.value))

export function AdminClaims() {
  useHead('Claims', undefined, { noindex: true })
  const { addToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFromUrl = searchParams.get('status') ?? ''
  const initialFilter = ALLOWED_CLAIM_STATUS.has(statusFromUrl) ? statusFromUrl : ''
  const [claims, setClaims] = useState<Claim[]>([])
  const [filter, setFilter] = useState(initialFilter)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const perPage = 50
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Export
  const [exporting, setExporting] = useState<'csv' | 'excel' | 'pdf' | null>(null)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  // Detail modal
  const [detail, setDetail] = useState<Claim | null>(null)
  const [documents, setDocuments] = useState<ClaimDocument[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Dialogs
  const [approveTarget, setApproveTarget] = useState<Claim | null>(null)
  const [approveNotes, setApproveNotes] = useState('')
  const [approveAmount, setApproveAmount] = useState('')
  const [rejectTarget, setRejectTarget] = useState<Claim | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [infoTarget, setInfoTarget] = useState<Claim | null>(null)
  const [infoMessage, setInfoMessage] = useState('')
  const [bulkRejectNotes, setBulkRejectNotes] = useState('')
  const [showBulkReject, setShowBulkReject] = useState(false)

  const load = useCallback(async (pageNum = 1) => {
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (filter) qs.set('status', filter)
      if (debouncedQuery.trim()) qs.set('q', debouncedQuery.trim())
      qs.set('page', String(pageNum))
      qs.set('per_page', String(perPage))
      const d = await api<{ claims: Claim[]; total: number; page: number; pages: number }>(
        `/admin/claims?${qs.toString()}`,
        { auth: true },
      )
      setClaims(d.claims ?? [])
      setTotalCount(d.total ?? 0)
      setTotalPages(d.pages ?? 1)
      setPage(d.page ?? pageNum)
    } catch (e) {
      setError(reportLoadError(e, { page: 'admin-claims' }, 'Could not load claims.'))
    } finally {
      setLoading(false)
    }
  }, [filter, debouncedQuery])

  // eslint-disable-next-line oxc/react/set-state-in-effect — loading initialized true; setLoading(false) in finally after await
  useEffect(() => { load(1) }, [load])

  useEffect(() => {
    const s = searchParams.get('status') ?? ''
    const next = ALLOWED_CLAIM_STATUS.has(s) ? s : ''
    setFilter((prev) => (prev === next ? prev : next))
  }, [searchParams])

  function applyFilter(value: string) {
    setFilter(value)
    setPage(1)
    const next = new URLSearchParams(searchParams)
    if (value) next.set('status', value)
    else next.delete('status')
    setSearchParams(next, { replace: true })
  }

  function normalizeClaim(c: Claim): ClaimRecord {
    return {
      member_full_name: c.members?.full_name ?? 'Not provided',
      member_phone: c.members?.phone ?? 'Not provided',
      member_email: c.members?.email ?? 'Not provided',
      claim_number: c.claim_number ?? '—',
      claim_type: c.claim_type ?? '—',
      amount_requested: c.amount_requested,
      approved_amount: c.approved_amount,
      status: c.status ?? 'Unknown',
      package_name: c.packages?.name ?? 'Not provided',
      submitted_at: c.submitted_at,
      decided_at: c.decided_at,
      created_at: c.created_at,
    }
  }

  // Export all matching records from server
  const [showExportMenu, setShowExportMenu] = useState(false)

  async function fetchAllClaims(): Promise<Claim[]> {
    const d = await api<{ claims: Claim[]; total: number }>(
      '/admin/claims?action=export',
      { method: 'POST', auth: true, body: { status: filter || undefined, q: debouncedQuery.trim() || undefined } },
    )
    return d.claims ?? []
  }

  function handleExport(format: 'csv' | 'excel' | 'pdf', allRecords: boolean = false) {
    setShowExportMenu(false)
    setExporting(format)
    async function run() {
      try {
        let records: ClaimRecord[]
        let filterSummary: string
        if (allRecords) {
          const allClaims = await fetchAllClaims()
          records = allClaims.map(normalizeClaim)
          const parts: string[] = []
          if (filter) parts.push(`Status: ${filter}`)
          if (debouncedQuery.trim()) parts.push(`Search: ${debouncedQuery.trim()}`)
          filterSummary = parts.length > 0 ? `All matching: ${parts.join(' | ')}` : 'All claims'
        } else {
          records = claims.map(normalizeClaim)
          const parts: string[] = []
          if (filter) parts.push(`Status: ${filter}`)
          if (debouncedQuery.trim()) parts.push(`Search: ${debouncedQuery.trim()}`)
          filterSummary = parts.length > 0 ? `Current page: ${parts.join(' | ')}` : 'Current page'
        }
        if (records.length === 0) {
          addToast('info', 'No claim records available for export.')
          setExporting(null)
          return
        }
        if (format === 'csv') exportClaimRecordsCSV(records)
        else if (format === 'excel') exportClaimRecordsExcel(records, filterSummary)
        else exportClaimRecordsPDF(records, filterSummary)
        addToast('success', `Export complete — ${records.length} claim${records.length !== 1 ? 's' : ''}`)
      } catch {
        addToast('error', 'Export failed. Please try again.')
      } finally {
        setExporting(null)
      }
    }
    run()
  }

  async function viewDetail(claim: Claim) {
    setDetail(claim)
    setDocuments([])
    setLoadingDetail(true)
    try {
      const d = await api<{ claim: Claim; documents: ClaimDocument[] }>(`/admin/claims/${claim.id}`, { auth: true })
      setDocuments(d.documents ?? [])
    } catch {
      addToast('warning', 'Could not load claim documents.')
    } finally {
      setLoadingDetail(false)
    }
  }

  async function approve(claim: Claim) {
    setBusyId(claim.id)
    try {
      await api(`/admin/claims/${claim.id}`, {
        method: 'PATCH',
        auth: true,
        body: { decision: 'approve', adminNotes: approveNotes.trim() || undefined, amount: approveAmount ? Number(approveAmount) : undefined },
      })
      addToast('success', `Claim ${claim.claim_number} approved.`)
      setApproveTarget(null)
      setApproveNotes('')
      setApproveAmount('')
      setDetail(null)
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not approve claim.')
    } finally {
      setBusyId(null)
    }
  }

  async function reject(claim: Claim) {
    setBusyId(claim.id)
    try {
      await api(`/admin/claims/${claim.id}`, {
        method: 'PATCH',
        auth: true,
        body: { decision: 'reject', adminNotes: rejectNotes.trim() || undefined },
      })
      addToast('success', `Claim ${claim.claim_number} rejected.`)
      setRejectTarget(null)
      setRejectNotes('')
      setDetail(null)
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not reject claim.')
    } finally {
      setBusyId(null)
    }
  }

  async function requestInfo(claim: Claim) {
    setBusyId(claim.id)
    try {
      await api(`/admin/claims/${claim.id}`, {
        method: 'PATCH',
        auth: true,
        body: { decision: 'request-info', adminNotes: infoMessage.trim() || undefined },
      })
      addToast('success', `Additional information requested for ${claim.claim_number}.`)
      setInfoTarget(null)
      setInfoMessage('')
      setDetail(null)
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not update claim.')
    } finally {
      setBusyId(null)
    }
  }

  async function bulkReject() {
    setBulkLoading(true)
    try {
      const ids = Array.from(selectedIds)
      const d = await api<{ results: { id: string; success: boolean; error?: string }[]; summary: { total: number; success: number; errors: number } }>(
        '/admin/claims?action=batch',
        { method: 'POST', auth: true, body: { ids, decision: 'reject', adminNotes: bulkRejectNotes.trim() || undefined } },
      )
      if (d.summary.errors > 0) {
        addToast('warning', `${d.summary.success} rejected, ${d.summary.errors} failed.`)
      } else {
        addToast('success', `${d.summary.success} claim${d.summary.success !== 1 ? 's' : ''} rejected.`)
      }
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Batch operation failed.')
    } finally {
      setBulkLoading(false)
      setShowBulkReject(false)
      setBulkRejectNotes('')
      setSelectedIds(new Set())
      await load()
    }
  }

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'claim_number',
      header: 'Claim',
      render: (row) => {
        const cl = row as unknown as Claim
        return (
          <button onClick={() => viewDetail(cl)} className="font-medium text-luma-700 hover:text-luma-800 hover:underline text-left">
            {cl.claim_number}
          </button>
        )
      },
    },
    {
      key: 'member_name',
      header: 'Member',
      render: (row) => {
        const cl = row as unknown as Claim
        return (
          <div>
            <div className="font-medium text-gray-900">{cl.members?.full_name ?? 'Unknown'}</div>
            <div className="text-xs text-gray-500">{cl.members?.phone ?? ''}</div>
          </div>
        )
      },
    },
    { key: 'package_name', header: 'Package', render: (row) => (row as unknown as Claim).packages?.name ?? '—' },
    { key: 'claim_type', header: 'Type', render: (row) => (row as unknown as Claim).claim_type ?? '—', className: 'text-xs' },
    {
      key: 'amount_requested',
      header: 'Amount',
      render: (row) => {
        const cl = row as unknown as Claim
        const hasApproved = (cl.status === 'Approved' || cl.status === 'Paid') && cl.approved_amount != null
        return (
          <div>
            <span className="font-medium text-gray-900">{cl.amount_requested != null ? `KSh ${cl.amount_requested.toLocaleString('en-KE')}` : '—'}</span>
            {hasApproved && cl.approved_amount !== cl.amount_requested && (
              <div className="text-xs text-emerald-600 font-medium">→ KSh {cl.approved_amount!.toLocaleString('en-KE')}</div>
            )}
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const cl = row as unknown as Claim
        return (
          <StatusBadge status={cl.status}>{cl.status}</StatusBadge>
        )
      },
    },
    {
      key: 'created_at',
      header: 'Date',
      render: (row) => <span className="text-gray-500 text-xs">{new Date((row as unknown as Claim).created_at).toLocaleDateString()}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) => {
        const cl = row as unknown as Claim
        return (
          <div className="flex justify-end gap-1.5">
            {cl.status === 'Submitted' && (
              <>
                <button
                  disabled={busyId === cl.id}
                  onClick={() => { setApproveTarget(cl); setApproveAmount(cl.amount_requested != null ? String(cl.amount_requested) : ''); setApproveNotes('') }}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  Approve
                </button>
                <button
                  disabled={busyId === cl.id}
                  onClick={() => { setInfoTarget(cl); setInfoMessage('') }}
                  className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
                >
                  Info
                </button>
                <button
                  disabled={busyId === cl.id}
                  onClick={() => { setRejectTarget(cl); setRejectNotes('') }}
                  className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Claims</h1>
          <p className="text-sm text-gray-500 mt-1">Review member claims. Approved claims are recorded for future payout processing.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setShowExportMenu(!showExportMenu)} disabled={exporting !== null || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {exporting ? (
                <><svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Exporting…</>
              ) : 'Export ▾'}
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Current Page ({claims.length})</div>
                  {([['csv', 'CSV'], ['excel', 'Excel'], ['pdf', 'PDF']] as const).map(([fmt, label]) => (
                    <button key={fmt} onClick={() => handleExport(fmt, false)} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">{label}</button>
                  ))}
                  <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">All Matching Records</div>
                  {([['csv', 'CSV'], ['excel', 'Excel'], ['pdf', 'PDF']] as const).map(([fmt, label]) => (
                    <button key={`all-${fmt}`} onClick={() => handleExport(fmt, true)} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">{label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filters + Search */}
      <FilterBar
        options={filterTabs}
        value={filter}
        onChange={applyFilter}
        aria-label="Filter claims by status"
        onOpenMobileFilters={() => setMobileFiltersOpen(true)}
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search member name, phone, claim #, type..."
            aria-label="Search claims"
          />
        }
      />
      <FilterDrawer
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        title="Filter claims"
        footer={
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(false)}
            className="w-full min-h-[44px] rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800"
          >
            Show results
          </button>
        }
      >
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</legend>
          <div className="mt-2 flex flex-col gap-1">
            {filterTabs.map((opt) => (
              <button
                key={opt.value || 'all'}
                type="button"
                onClick={() => applyFilter(opt.value)}
                aria-pressed={filter === opt.value}
                className={`rounded-lg px-3 py-3 text-left text-sm font-medium min-h-[44px] ${
                  filter === opt.value ? 'bg-luma-100 text-luma-800' : 'bg-gray-50 text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>
      </FilterDrawer>

      {error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); load(page) }} />
      )}

      {/* Claims Table */}
      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <DataTable
          data={claims as unknown as Record<string, unknown>[]}
          columns={columns}
          keyExtractor={(r) => String(r.id)}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          getId={(r) => String(r.id)}
          pageSize={25}
          emptyMessage="No claims found."
          renderMobileCard={(row) => {
            const cl = row as unknown as Claim
            return (
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <button onClick={() => viewDetail(cl)} className="font-medium text-luma-700 hover:underline text-left">
                    {cl.claim_number}
                  </button>
                  <StatusBadge status={cl.status}>{cl.status}</StatusBadge>
                </div>
                <div className="text-sm text-gray-900">{cl.members?.full_name ?? 'Unknown'}</div>
                <div className="text-xs text-gray-500">{cl.packages?.name ?? '—'} · {cl.claim_type ?? '—'}</div>
                <div className="text-sm font-medium text-gray-900">
                  {cl.amount_requested != null ? `KSh ${cl.amount_requested.toLocaleString('en-KE')}` : '—'}
                </div>
                {cl.status === 'Submitted' && (
                  <div className="flex gap-2 pt-1">
                    <button
                      disabled={busyId === cl.id}
                      onClick={() => { setApproveTarget(cl); setApproveAmount(cl.amount_requested != null ? String(cl.amount_requested) : ''); setApproveNotes('') }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busyId === cl.id}
                      onClick={() => { setRejectTarget(cl); setRejectNotes('') }}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )
          }}
        />
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          { label: 'Reject Selected', variant: 'danger', onClick: () => setShowBulkReject(true), loading: bulkLoading },
        ]}
      />

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-12 overflow-y-auto" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{detail.claim_number}</h3>
                  <StatusBadge status={detail.status} className="mt-1">{detail.status}</StatusBadge>
                </div>
                <button onClick={() => setDetail(null)} aria-label="Close claim detail" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-gray-400 text-xs">Member</span>
                  <div className="font-medium text-gray-900">{detail.members?.full_name ?? '—'}</div>
                  <div className="text-gray-500 text-xs">{detail.members?.phone ?? ''}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Package</span>
                  <div className="font-medium text-gray-900">{detail.packages?.name ?? '—'}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Claim Type</span>
                  <div className="text-gray-700">{detail.claim_type ?? '—'}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Amount Requested</span>
                  <div className="font-medium text-gray-900">
                    {detail.amount_requested != null ? `KSh ${detail.amount_requested.toLocaleString('en-KE')}` : '—'}
                  </div>
                </div>
                {(detail.status === 'Approved' || detail.status === 'Paid') && detail.approved_amount != null && (
                  <div>
                    <span className="text-gray-400 text-xs">Approved Amount</span>
                    <div className="font-medium text-emerald-700">
                      KSh {detail.approved_amount.toLocaleString('en-KE')}
                    </div>
                    {detail.amount_requested != null && detail.approved_amount !== detail.amount_requested && (
                      <div className="mt-1">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          detail.approved_amount > detail.amount_requested
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {detail.approved_amount > detail.amount_requested ? '↑' : '↓'}
                          {' '}
                          {Math.abs(((detail.approved_amount - detail.amount_requested) / detail.amount_requested) * 100).toFixed(0)}%
                          {' '}{detail.approved_amount > detail.amount_requested ? 'above' : 'below'} requested
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {detail.description && (
                <div>
                  <span className="text-gray-400 text-xs">Description</span>
                  <p className="mt-1 text-gray-700 whitespace-pre-wrap">{detail.description}</p>
                </div>
              )}
              {detail.admin_notes && (
                <div>
                  <span className="text-gray-400 text-xs">Admin Notes</span>
                  <p className="mt-1 text-gray-700 whitespace-pre-wrap">{detail.admin_notes}</p>
                </div>
              )}
              {documents.length > 0 && (
                <div>
                  <span className="text-gray-400 text-xs">Documents</span>
                  <div className="mt-1 space-y-1">
                    {documents.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-luma-700 hover:bg-gray-50 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                        {doc.file_name}
                        <span className="text-xs text-gray-400">({doc.document_type})</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {loadingDetail && <div className="text-center text-gray-400 text-xs py-2">Loading documents…</div>}
            </div>
            {detail.status === 'Submitted' && (
              <div className="border-t border-gray-200 px-6 py-4 flex gap-2 justify-end">
                <button onClick={() => { setApproveTarget(detail); setApproveAmount(detail.amount_requested != null ? String(detail.amount_requested) : ''); setApproveNotes('') }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">Approve</button>
                <button onClick={() => { setInfoTarget(detail); setInfoMessage('') }} className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors">Request Info</button>
                <button onClick={() => { setRejectTarget(detail); setRejectNotes('') }} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">Reject</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approve Dialog */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setApproveTarget(null)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">Approve Claim</h3>
              <p className="mt-1 text-sm text-gray-500">
                Approve <strong>{approveTarget.claim_number}</strong> from <strong>{approveTarget.members?.full_name ?? 'member'}</strong>?
              </p>
              <div className="mt-4 space-y-3">
                {approveTarget.amount_requested != null && (
                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    Requested: <span className="font-medium text-gray-700">KSh {approveTarget.amount_requested.toLocaleString('en-KE')}</span>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-gray-600">Payout Amount (KSh)</label>
                  <input type="number" aria-label="Payout amount" value={approveAmount} onChange={(e) => setApproveAmount(e.target.value)} placeholder={approveTarget.amount_requested != null ? String(approveTarget.amount_requested) : 'e.g. 100000'} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
                  {approveAmount && approveTarget.amount_requested != null && Number(approveAmount) !== approveTarget.amount_requested && (
                    <div className="mt-1">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        Number(approveAmount) > approveTarget.amount_requested
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {Number(approveAmount) > approveTarget.amount_requested ? '↑' : '↓'}
                        {' '}{Math.abs(((Number(approveAmount) - approveTarget.amount_requested) / approveTarget.amount_requested) * 100).toFixed(0)}%
                        {' '}{Number(approveAmount) > approveTarget.amount_requested ? 'above' : 'below'} requested
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Admin Notes (optional)</label>
                  <textarea value={approveNotes} onChange={(e) => setApproveNotes(e.target.value)} placeholder="Any notes about this approval…" rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setApproveTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => approve(approveTarget)} disabled={busyId === approveTarget.id} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {busyId === approveTarget.id ? 'Approving…' : 'Approve Claim'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRejectTarget(null)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">Reject Claim</h3>
              <p className="mt-1 text-sm text-gray-500">
                Reject <strong>{rejectTarget.claim_number}</strong> from <strong>{rejectTarget.members?.full_name ?? 'member'}</strong>?
              </p>
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
                <textarea value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} placeholder="e.g. Insufficient documentation, not eligible…" rows={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setRejectTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => reject(rejectTarget)} disabled={busyId === rejectTarget.id} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {busyId === rejectTarget.id ? 'Rejecting…' : 'Reject Claim'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Info Dialog */}
      {infoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setInfoTarget(null)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">Request Additional Information</h3>
              <p className="mt-1 text-sm text-gray-500">
                Ask <strong>{infoTarget.members?.full_name ?? 'member'}</strong> for more information on claim <strong>{infoTarget.claim_number}</strong>.
              </p>
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-600">Message *</label>
                <textarea value={infoMessage} onChange={(e) => setInfoMessage(e.target.value)} placeholder="e.g. Please upload a copy of the hospital bill…" rows={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setInfoTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => requestInfo(infoTarget)} disabled={busyId === infoTarget.id || !infoMessage.trim()} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                {busyId === infoTarget.id ? 'Sending…' : 'Request Info'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reject Dialog */}
      <ConfirmDialog
        open={showBulkReject}
        title="Reject Selected Claims"
        variant="danger"
        confirmLabel={`Reject ${selectedIds.size} Claim${selectedIds.size !== 1 ? 's' : ''}`}
        loading={bulkLoading}
        onConfirm={bulkReject}
        onCancel={() => { setShowBulkReject(false); setBulkRejectNotes('') }}
        message={
          <>
            <p>This will reject {selectedIds.size} selected claim{selectedIds.size !== 1 ? 's' : ''}.</p>
            <div className="mt-3">
              <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
              <textarea value={bulkRejectNotes} onChange={(e) => setBulkRejectNotes(e.target.value)} placeholder="e.g. Insufficient documentation…" rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" />
            </div>
          </>
        }
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-sm text-gray-500">
            {totalCount.toLocaleString()} claim{totalCount !== 1 ? 's' : ''} · Page {page} of {totalPages}
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
    </div>
  )
}
