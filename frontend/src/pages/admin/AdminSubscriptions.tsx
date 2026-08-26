import { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { useToast } from '../../components/Toast'
import { DataTable, type Column } from '../../components/DataTable'
import { BulkActionBar } from '../../components/BulkActionBar'
import { ConfirmDialog } from '../../components/ConfirmDialog'

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
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

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

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      let path = '/admin/subscriptions'
      if (filter) path += `?status=${filter}`
      const d = await api<{ subscriptions: Subscription[] }>(path, { auth: true })
      setSubs(d.subscriptions ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load subscriptions.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

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

  function exportCSV() {
    const headers = ['Member', 'Package', 'Tier', 'Amount', 'Status', 'Started', 'Next Due']
    const csvRows = subs.map((s) => [
      s.members?.full_name ?? '',
      s.packages?.name ?? '',
      s.package_tiers?.name ?? '',
      s.package_tiers?.amount != null ? String(s.package_tiers.amount) : '',
      s.status,
      s.started_at ? new Date(s.started_at).toLocaleDateString() : '',
      s.next_due_date ? new Date(s.next_due_date).toLocaleDateString() : '',
    ])
    const csv = [headers, ...csvRows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscriptions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast('success', `Exported ${subs.length} subscriptions to CSV.`)
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
          <p className="text-sm text-gray-500 mt-1">Manage member package subscriptions.</p>
        </div>
        <button onClick={exportCSV} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Total</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{subs.length}</div>
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

      {/* Filters */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1">
        {filterTabs.map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === f.value ? 'bg-luma-100 text-luma-700' : 'text-gray-500 hover:bg-gray-50'}`}>
            {f.label}
          </button>
        ))}
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
                <div className="text-xs text-gray-500">{s.packages?.name ?? '—'} · {s.package_tiers?.name ?? '—'}</div>
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
                <textarea value={dialogReason} onChange={(e) => setDialogReason(e.target.value)} placeholder="Any notes…" rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" />
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
                <textarea value={dialogReason} onChange={(e) => setDialogReason(e.target.value)} placeholder="e.g. Non-payment, policy violation…" rows={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" />
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
                <textarea value={dialogReason} onChange={(e) => setDialogReason(e.target.value)} placeholder="e.g. Member request, policy violation…" rows={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" />
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
                <textarea value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="e.g. Non-payment, policy violation…" rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" />
              </div>
            )}
          </>
        }
      />
    </div>
  )
}
