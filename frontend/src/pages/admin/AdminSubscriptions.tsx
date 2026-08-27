import { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { useToast } from '../../components/Toast'
import { DataTable, type Column } from '../../components/DataTable'
import { BulkActionBar } from '../../components/BulkActionBar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { exportSubscriptionsCSV, exportSubscriptionsExcel, exportSubscriptionsPDF, type SubscriptionRecord } from '../../lib/exports'

type Subscription = {
  id: string
  status: string
  started_at: string | null
  next_due_date: string | null
  cancelled_at: string | null
  created_at: string
  member_id: string
  members: { full_name: string | null; phone: string | null; email: string | null; membership_number: string | null } | null
  packages: { code: string | null; name: string | null } | null
  package_tiers: { name: string | null; amount: number | null } | null
}

function normalizeSubscription(sub: Subscription): SubscriptionRecord {
  return {
    member_full_name: sub.members?.full_name ?? '—',
    member_phone: sub.members?.phone ?? '—',
    member_email: sub.members?.email ?? '—',
    package_name: sub.packages?.name ?? '—',
    status: sub.status,
    started_at: sub.started_at,
    next_due_date: sub.next_due_date,
    created_at: sub.created_at,
    amount: sub.package_tiers?.amount ?? null,
  }
}

function buildFilterSummary(args: { filter: string; query: string; dateFrom: string; dateTo: string; packageId: string; packages: { id: string; name: string }[] }): string {
  const parts: string[] = []
  if (args.filter) parts.push(`Status: ${args.filter}`)
  if (args.query) parts.push(`Search: ${args.query}`)
  if (args.dateFrom) parts.push(`From: ${args.dateFrom}`)
  if (args.dateTo) parts.push(`To: ${args.dateTo}`)
  if (args.packageId) {
    const pkg = args.packages.find(p => p.id === args.packageId)
    parts.push(`Package: ${pkg?.name ?? args.packageId}`)
  }
  return parts.length > 0 ? `Filters: ${parts.join(' | ')}` : 'All subscriptions'
}

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  paused: 'bg-orange-50 text-orange-700 border-orange-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
}


const filterTabs = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function AdminSubscriptions() {
  useHead('Subscriptions', undefined, { noindex: true })
  const { addToast } = useToast()
  const [subs, setSubs] = useState<Subscription[]>([])
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [packageId, setPackageId] = useState('')
  const [packages, setPackages] = useState<{ id: string; name: string; code: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const perPage = 50

  // Export
  const [exporting, setExporting] = useState<'csv' | 'excel' | 'pdf' | null>(null)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  // Dialogs
  const [approveTarget, setApproveTarget] = useState<Subscription | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<Subscription | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null)
  const [dialogReason, setDialogReason] = useState('')
  const [bulkAction, setBulkAction] = useState<'active' | 'paused' | 'cancelled' | null>(null)
  const [bulkReason, setBulkReason] = useState('')

  const load = useCallback(async (pageNum = 1) => {
    setError(null)
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filter) qs.set('status', filter)
      if (debouncedQuery.trim()) qs.set('q', debouncedQuery.trim())
      if (dateFrom) qs.set('date_from', dateFrom)
      if (dateTo) qs.set('date_to', dateTo)
      if (packageId) qs.set('package_id', packageId)
      qs.set('page', String(pageNum))
      qs.set('per_page', String(perPage))
      const d = await api<{ subscriptions: Subscription[]; total: number; page: number; pages: number }>(`/admin/subscriptions?${qs.toString()}`, { auth: true })
      setSubs(d.subscriptions ?? [])
      setTotalCount(d.total ?? 0)
      setTotalPages(d.pages ?? 1)
      setPage(d.page ?? pageNum)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load subscriptions.')
    } finally {
      setLoading(false)
    }
  }, [filter, debouncedQuery, dateFrom, dateTo, packageId])

  useEffect(() => { load(1) }, [load])

  // Load packages for filter dropdown
  useEffect(() => {
    api<{ packages: { id: string; name: string; code: string }[] }>('/packages', { auth: false })
      .then(d => setPackages(d.packages ?? []))
      .catch(() => { /* ignore */ })
  }, [])

  async function approve(sub: Subscription) {
    setBusyId(sub.id)
    try {
      await api(`/admin/subscriptions/${sub.id}`, {
        method: 'PATCH', auth: true, body: { status: 'active', reason: dialogReason.trim() || undefined },
      })
      addToast('success', `Subscription for ${sub.members?.full_name ?? 'member'} activated.`)
      setApproveTarget(null)
      setDialogReason('')
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not activate subscription.')
    } finally {
      setBusyId(null)
    }
  }

  async function suspend(sub: Subscription) {
    setBusyId(sub.id)
    try {
      await api(`/admin/subscriptions/${sub.id}`, {
        method: 'PATCH', auth: true, body: { status: 'paused', reason: dialogReason.trim() || undefined },
      })
      addToast('success', `Subscription for ${sub.members?.full_name ?? 'member'} suspended.`)
      setSuspendTarget(null)
      setDialogReason('')
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not suspend subscription.')
    } finally {
      setBusyId(null)
    }
  }

  async function cancel(sub: Subscription) {
    setBusyId(sub.id)
    try {
      await api(`/admin/subscriptions/${sub.id}`, {
        method: 'PATCH', auth: true, body: { status: 'cancelled', reason: dialogReason.trim() || undefined },
      })
      addToast('success', `Subscription for ${sub.members?.full_name ?? 'member'} cancelled.`)
      setCancelTarget(null)
      setDialogReason('')
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not cancel subscription.')
    } finally {
      setBusyId(null)
    }
  }

  async function bulkStatusUpdate(status: 'active' | 'paused' | 'cancelled') {
    setBulkLoading(true)
    const ids = Array.from(selectedIds)
    let success = 0
    let errors = 0
    for (const id of ids) {
      try {
        await api(`/admin/subscriptions/${id}`, {
          method: 'PATCH', auth: true, body: { status, reason: bulkReason.trim() || undefined },
        })
        success++
      } catch {
        errors++
      }
    }
    setBulkLoading(false)
    setBulkAction(null)
    setBulkReason('')
    setSelectedIds(new Set())
    if (errors > 0) {
      addToast('warning', `${success} updated, ${errors} failed.`)
    } else {
      addToast('success', `${success} subscription${success !== 1 ? 's' : ''} ${status === 'active' ? 'activated' : status === 'paused' ? 'suspended' : 'cancelled'}.`)
    }
    await load()
  }

  function handleExport(format: 'csv' | 'excel' | 'pdf') {
    if (subs.length === 0) {
      addToast('info', 'No subscription records available for export.')
      return
    }
    setExporting(format)
    try {
      const records = subs.map(normalizeSubscription)
      const filterSummary = buildFilterSummary({ filter, query: debouncedQuery, dateFrom, dateTo, packageId, packages })
      if (format === 'csv') exportSubscriptionsCSV(records)
      else if (format === 'excel') exportSubscriptionsExcel(records, filterSummary)
      else exportSubscriptionsPDF(records, filterSummary)
      addToast('success', `Export complete — ${records.length} record${records.length !== 1 ? 's' : ''}`)
    } catch {
      addToast('error', 'Export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  const pendingCount = subs.filter((s) => s.status === 'pending').length
  const activeCount = subs.filter((s) => s.status === 'active').length

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'member_name',
      header: 'Member',
      render: (row) => {
        const s = row as unknown as Subscription
        return (
          <div>
            <div className="font-medium text-gray-900">{s.members?.full_name ?? 'Unknown'}</div>
            <div className="text-xs text-gray-500">{s.members?.email ?? s.members?.phone ?? ''}</div>
          </div>
        )
      },
    },
    { key: 'package_name', header: 'Package', render: (row) => (row as unknown as Subscription).packages?.name ?? '—' },
    { key: 'tier_name', header: 'Tier', render: (row) => (row as unknown as Subscription).package_tiers?.name ?? '—', className: 'text-xs' },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => {
        const s = row as unknown as Subscription
        return <span className="font-medium text-gray-900">{s.package_tiers?.amount != null ? `KSh ${s.package_tiers.amount.toLocaleString('en-KE')}` : '—'}</span>
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const s = row as unknown as Subscription
        return (
          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyles[s.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
            {s.status}
          </span>
        )
      },
    },
    {
      key: 'started_at',
      header: 'Started',
      render: (row) => <span className="text-gray-500 text-xs">{(row as unknown as Subscription).started_at ? new Date((row as unknown as Subscription).started_at!).toLocaleDateString() : '—'}</span>,
    },
    {
      key: 'next_due_date',
      header: 'Next Due',
      render: (row) => <span className="text-gray-500 text-xs">{(row as unknown as Subscription).next_due_date ? new Date((row as unknown as Subscription).next_due_date!).toLocaleDateString() : '—'}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) => {
        const s = row as unknown as Subscription
        return (
          <div className="flex justify-end gap-1.5">
            {s.status === 'pending' && (
              <button disabled={busyId === s.id} onClick={() => { setApproveTarget(s); setDialogReason('') }} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">Activate</button>
            )}
            {s.status === 'active' && (
              <>
                <button disabled={busyId === s.id} onClick={() => { setSuspendTarget(s); setDialogReason('') }} className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors">Suspend</button>
                <button disabled={busyId === s.id} onClick={() => { setCancelTarget(s); setDialogReason('') }} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">Cancel</button>
              </>
            )}
            {s.status === 'paused' && (
              <>
                <button disabled={busyId === s.id} onClick={() => { setApproveTarget(s); setDialogReason('') }} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">Reactivate</button>
                <button disabled={busyId === s.id} onClick={() => { setCancelTarget(s); setDialogReason('') }} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">Cancel</button>
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
          <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
          <p className="text-sm text-gray-500 mt-1">Manage member package subscriptions, status, dates, and membership activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 mr-1">Export:</span>
          {([
            ['csv', 'CSV'],
            ['excel', 'Excel'],
            ['pdf', 'PDF'],
          ] as const).map(([fmt, label]) => (
            <button
              key={fmt}
              onClick={() => handleExport(fmt)}
              disabled={exporting !== null || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {exporting === fmt ? (
                <>
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating…
                </>
              ) : label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Total</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{totalCount}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Active</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">{activeCount}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Pending</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{pendingCount}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Cancelled</div>
          <div className="mt-1 text-2xl font-bold text-gray-500">{subs.filter((s) => s.status === 'cancelled').length}</div>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1">
            {filterTabs.map((f) => (
              <button key={f.value} onClick={() => setFilter(f.value)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === f.value ? 'bg-luma-100 text-luma-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              aria-label="Search subscriptions"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search member name, phone, package..."
              className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-luma-500"
              aria-label="Date from"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-luma-500"
              aria-label="Date to"
            />
          </div>
          <select
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-luma-500"
            aria-label="Filter by package"
          >
            <option value="">All packages</option>
            {packages.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {(dateFrom || dateTo || packageId) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); setPackageId('') }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Table */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <svg className="mx-auto h-6 w-6 animate-spin text-luma-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-3 text-sm text-gray-500">Loading subscriptions…</p>
        </div>
      ) : (
        <DataTable
          data={subs as unknown as Record<string, unknown>[]}
          columns={columns}
          keyExtractor={(r) => String(r.id)}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          getId={(r) => String(r.id)}
          pageSize={25}
          emptyMessage="No subscriptions found."
          renderMobileCard={(row) => {
            const s = row as unknown as Subscription
            return (
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="font-medium text-gray-900">{s.members?.full_name ?? 'Unknown'}</div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusStyles[s.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                    {s.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500">{s.members?.phone ?? '—'} {s.members?.email ? `· ${s.members.email}` : ''}</div>
                <div className="text-xs text-gray-500">{s.packages?.name ?? '—'}{s.package_tiers?.name ? ` · ${s.package_tiers.name}` : ''}</div>
                <div className="text-sm font-medium text-gray-900">
                  {s.package_tiers?.amount != null ? `KSh ${s.package_tiers.amount.toLocaleString('en-KE')}` : '—'}
                </div>
                <div className="flex gap-2 pt-1">
                  {s.status === 'pending' && (
                    <button disabled={busyId === s.id} onClick={() => { setApproveTarget(s); setDialogReason('') }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Activate</button>
                  )}
                  {s.status === 'active' && (
                    <>
                      <button disabled={busyId === s.id} onClick={() => { setSuspendTarget(s); setDialogReason('') }} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50">Suspend</button>
                      <button disabled={busyId === s.id} onClick={() => { setCancelTarget(s); setDialogReason('') }} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Cancel</button>
                    </>
                  )}
                  {s.status === 'paused' && (
                    <>
                      <button disabled={busyId === s.id} onClick={() => { setApproveTarget(s); setDialogReason('') }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Reactivate</button>
                      <button disabled={busyId === s.id} onClick={() => { setCancelTarget(s); setDialogReason('') }} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Cancel</button>
                    </>
                  )}
                </div>
              </div>
            )
          }}
        />
      )}

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
          { label: 'Activate', variant: 'primary', onClick: () => setBulkAction('active'), loading: bulkLoading },
          { label: 'Suspend', variant: 'warning', onClick: () => setBulkAction('paused'), loading: bulkLoading },
          { label: 'Cancel', variant: 'danger', onClick: () => setBulkAction('cancelled'), loading: bulkLoading },
        ]}
      />

      {/* Approve/Reactivate Dialog */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setApproveTarget(null)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">{approveTarget.status === 'paused' ? 'Reactivate' : 'Activate'} Subscription</h3>
              <p className="mt-1 text-sm text-gray-500">
                {approveTarget.status === 'paused' ? 'Reactivate' : 'Activate'} the subscription for <strong>{approveTarget.members?.full_name ?? 'member'}</strong> ({approveTarget.packages?.name ?? 'package'})?
              </p>
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-600">Notes (optional)</label>
                <textarea value={dialogReason} onChange={(e) => setDialogReason(e.target.value)} placeholder="Any notes…" rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" aria-label="Activation notes" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setApproveTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => approve(approveTarget)} disabled={busyId === approveTarget.id} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {busyId === approveTarget.id ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Dialog */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSuspendTarget(null)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">Suspend Subscription</h3>
              <p className="mt-1 text-sm text-gray-500">
                Suspend the subscription for <strong>{suspendTarget.members?.full_name ?? 'member'}</strong> ({suspendTarget.packages?.name ?? 'package'})?
              </p>
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
                <textarea value={dialogReason} onChange={(e) => setDialogReason(e.target.value)} placeholder="e.g. Non-payment, policy violation…" rows={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" aria-label="Suspension reason" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setSuspendTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => suspend(suspendTarget)} disabled={busyId === suspendTarget.id} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                {busyId === suspendTarget.id ? 'Suspending…' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Dialog */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCancelTarget(null)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">Cancel Subscription</h3>
              <p className="mt-1 text-sm text-gray-500">
                Permanently cancel the subscription for <strong>{cancelTarget.members?.full_name ?? 'member'}</strong> ({cancelTarget.packages?.name ?? 'package'})? This cannot be undone.
              </p>
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
                <textarea value={dialogReason} onChange={(e) => setDialogReason(e.target.value)} placeholder="e.g. Member request, policy violation…" rows={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" aria-label="Cancellation reason" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setCancelTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => cancel(cancelTarget)} disabled={busyId === cancelTarget.id} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {busyId === cancelTarget.id ? 'Cancelling…' : 'Cancel Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Confirm Dialog */}
      <ConfirmDialog
        open={bulkAction !== null}
        title={bulkAction === 'active' ? 'Activate Subscriptions' : bulkAction === 'paused' ? 'Suspend Subscriptions' : 'Cancel Subscriptions'}
        variant={bulkAction === 'active' ? 'primary' : bulkAction === 'paused' ? 'warning' : 'danger'}
        confirmLabel={bulkAction === 'active' ? 'Activate All' : bulkAction === 'paused' ? 'Suspend All' : 'Cancel All'}
        loading={bulkLoading}
        onConfirm={() => bulkAction && bulkStatusUpdate(bulkAction)}
        onCancel={() => { setBulkAction(null); setBulkReason('') }}
        message={
          <>
            <p>This will {bulkAction === 'active' ? 'activate' : bulkAction === 'paused' ? 'suspend' : 'cancel'} {selectedIds.size} selected subscription{selectedIds.size !== 1 ? 's' : ''}.</p>
            {(bulkAction === 'paused' || bulkAction === 'cancelled') && (
              <div className="mt-3">
                <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
                <textarea value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="e.g. Non-payment, policy violation…" rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" aria-label="Bulk action reason" />
              </div>
            )}
          </>
        }
      />
    </div>
  )
}
