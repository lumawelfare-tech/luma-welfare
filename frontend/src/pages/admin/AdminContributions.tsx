import { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../../lib/api'
import { useToast } from '../../components/Toast'
import { DataTable, type Column } from '../../components/DataTable'
import { BulkActionBar } from '../../components/BulkActionBar'
import { ConfirmDialog } from '../../components/ConfirmDialog'

type Contribution = {
  id: string
  period: string
  amount: number
  status: string
  notes: string | null
  created_at: string
  member_id: string
  members: { full_name: string | null; phone: string | null; email: string | null; membership_number: string | null } | null
  packages: { code: string; name: string } | null
  payments: { mpesa_receipt: string | null; channel: string | null } | null
}

const statusStyles: Record<string, string> = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
  Late: 'bg-orange-50 text-orange-700 border-orange-200',
}

const filterOptions = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Verified', label: 'Verified' },
  { value: 'Failed', label: 'Failed' },
  { value: '', label: 'All' },
]

export function AdminContributions() {
  const { addToast } = useToast()
  const [rows, setRows] = useState<Contribution[]>([])
  const [filter, setFilter] = useState('Pending')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  // Dialogs
  const [rejectTarget, setRejectTarget] = useState<Contribution | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [showBulkReject, setShowBulkReject] = useState(false)
  const [bulkRejectNotes, setBulkRejectNotes] = useState('')

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const d = await api<{ contributions: Contribution[] }>(
        `/admin/contributions${filter ? `?status=${filter}` : ''}`,
        { auth: true },
      )
      setRows(d.contributions ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load contributions.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function verify(id: string) {
    setBusyId(id)
    try {
      await api(`/admin/contributions/${id}`, { method: 'PATCH', auth: true, body: { action: 'verify' } })
      addToast('success', 'Contribution verified successfully.')
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not verify contribution.')
    } finally {
      setBusyId(null)
    }
  }

  async function rejectContribution(contribution: Contribution) {
    setBusyId(contribution.id)
    try {
      await api(`/admin/contributions/${contribution.id}`, {
        method: 'PATCH', auth: true, body: { action: 'reject', notes: rejectNotes.trim() || undefined },
      })
      addToast('success', `Contribution for ${contribution.members?.full_name ?? 'member'} rejected.`)
      setRejectTarget(null)
      setRejectNotes('')
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not reject contribution.')
    } finally {
      setBusyId(null)
    }
  }

  async function bulkVerify() {
    setBulkLoading(true)
    const ids = Array.from(selectedIds)
    let success = 0
    let errors = 0
    for (const id of ids) {
      try {
        await api(`/admin/contributions/${id}`, { method: 'PATCH', auth: true, body: { action: 'verify' } })
        success++
      } catch {
        errors++
      }
    }
    setBulkLoading(false)
    setSelectedIds(new Set())
    if (errors > 0) {
      addToast('warning', `${success} verified, ${errors} failed.`)
    } else {
      addToast('success', `${success} contribution${success !== 1 ? 's' : ''} verified.`)
    }
    await load()
  }

  async function bulkReject() {
    setBulkLoading(true)
    const ids = Array.from(selectedIds)
    let success = 0
    let errors = 0
    for (const id of ids) {
      try {
        await api(`/admin/contributions/${id}`, {
          method: 'PATCH', auth: true, body: { action: 'reject', notes: bulkRejectNotes.trim() || undefined },
        })
        success++
      } catch {
        errors++
      }
    }
    setBulkLoading(false)
    setShowBulkReject(false)
    setBulkRejectNotes('')
    setSelectedIds(new Set())
    if (errors > 0) {
      addToast('warning', `${success} rejected, ${errors} failed.`)
    } else {
      addToast('success', `${success} contribution${success !== 1 ? 's' : ''} rejected.`)
    }
    await load()
  }

  function exportCSV() {
    const headers = ['Member', 'Package', 'Period', 'Amount', 'Method', 'Reference', 'Status', 'Date']
    const csvRows = rows.map((c) => [
      c.members?.full_name ?? '',
      c.packages?.name ?? '',
      c.period,
      String(c.amount),
      (c.payments?.channel ?? 'manual').replace(/_/g, ' '),
      c.payments?.mpesa_receipt ?? '',
      c.status,
      new Date(c.created_at).toLocaleDateString(),
    ])
    const csv = [headers, ...csvRows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contributions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast('success', `Exported ${rows.length} contributions to CSV.`)
  }

  const pendingCount = rows.filter((r) => r.status === 'Pending').length

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'member_name',
      header: 'Member',
      render: (row) => {
        const c = row as unknown as Contribution
        return (
          <div>
            <div className="font-medium text-gray-900">{c.members?.full_name ?? 'Unknown'}</div>
            <div className="text-xs text-gray-500">{c.members?.email ?? c.members?.phone ?? ''}</div>
          </div>
        )
      },
    },
    { key: 'package_name', header: 'Package', render: (row) => (row as unknown as Contribution).packages?.name ?? '—' },
    { key: 'period', header: 'Period', render: (row) => <span className="font-mono">{(row as unknown as Contribution).period}</span> },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => <span className="font-medium text-gray-900">KSh {(row as unknown as Contribution).amount.toLocaleString('en-KE')}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      render: (row) => <span className="text-gray-500 text-xs capitalize">{((row as unknown as Contribution).payments?.channel ?? 'manual').replace(/_/g, ' ')}</span>,
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (row) => <span className="text-gray-500 text-xs font-mono">{(row as unknown as Contribution).payments?.mpesa_receipt ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const c = row as unknown as Contribution
        return (
          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyles[c.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
            {c.status}
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) => {
        const c = row as unknown as Contribution
        return (
          <div className="flex justify-end gap-2">
            {c.status === 'Pending' && (
              <>
                <button
                  disabled={busyId === c.id}
                  onClick={() => verify(c.id)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {busyId === c.id ? 'Processing…' : 'Verify'}
                </button>
                <button
                  disabled={busyId === c.id}
                  onClick={() => { setRejectTarget(c); setRejectNotes('') }}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
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
          <h1 className="text-2xl font-bold text-gray-900">Contributions</h1>
          <p className="text-sm text-gray-500 mt-1">Review and verify member contribution payments.</p>
        </div>
        <button onClick={exportCSV} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
        {filterOptions.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.value ? 'bg-luma-100 text-luma-700' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {f.label}
            {f.value === 'Pending' && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-100 px-1 text-[10px] font-bold text-amber-700">
                {pendingCount}
              </span>
            )}
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
          <p className="mt-3 text-sm text-gray-500">Loading contributions…</p>
        </div>
      ) : (
        <DataTable
          data={rows as unknown as Record<string, unknown>[]}
          columns={columns}
          keyExtractor={(r) => String(r.id)}
          selectable={filter === 'Pending' || filter === ''}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          getId={(r) => String(r.id)}
          pageSize={25}
          emptyMessage="No contributions found."
          renderMobileCard={(row) => {
            const c = row as unknown as Contribution
            return (
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="font-medium text-gray-900">{c.members?.full_name ?? 'Unknown'}</div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusStyles[c.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                    {c.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500">{c.packages?.name ?? '—'} · {c.period}</div>
                <div className="text-sm font-medium text-gray-900">KSh {c.amount.toLocaleString('en-KE')}</div>
                {c.payments?.mpesa_receipt && <div className="text-xs text-gray-400 font-mono">{c.payments.mpesa_receipt}</div>}
                {c.status === 'Pending' && (
                  <div className="flex gap-2 pt-1">
                    <button disabled={busyId === c.id} onClick={() => verify(c.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Verify</button>
                    <button disabled={busyId === c.id} onClick={() => { setRejectTarget(c); setRejectNotes('') }} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
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
          { label: 'Verify Selected', variant: 'primary', onClick: bulkVerify, loading: bulkLoading },
          { label: 'Reject Selected', variant: 'danger', onClick: () => setShowBulkReject(true), loading: bulkLoading },
        ]}
      />

      {/* Reject Dialog */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">Reject Contribution</h3>
              <p className="mt-1 text-sm text-gray-500">
                Reject the KSh {rejectTarget.amount.toLocaleString('en-KE')} contribution from{' '}
                <strong>{rejectTarget.members?.full_name ?? 'member'}</strong> for period <strong>{rejectTarget.period}</strong>?
              </p>
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
                <textarea value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} placeholder="e.g. Transaction reference not found, amount mismatch…" rows={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => { setRejectTarget(null); setRejectNotes('') }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => rejectContribution(rejectTarget)} disabled={busyId === rejectTarget.id} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {busyId === rejectTarget.id ? 'Rejecting…' : 'Reject Contribution'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reject Dialog */}
      <ConfirmDialog
        open={showBulkReject}
        title="Reject Selected Contributions"
        variant="danger"
        confirmLabel={`Reject ${selectedIds.size} Contribution${selectedIds.size !== 1 ? 's' : ''}`}
        loading={bulkLoading}
        onConfirm={bulkReject}
        onCancel={() => { setShowBulkReject(false); setBulkRejectNotes('') }}
        message={
          <>
            <p>This will reject {selectedIds.size} selected contribution{selectedIds.size !== 1 ? 's' : ''}.</p>
            <div className="mt-3">
              <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
              <textarea value={bulkRejectNotes} onChange={(e) => setBulkRejectNotes(e.target.value)} placeholder="e.g. Transaction reference not found…" rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none" />
            </div>
          </>
        }
      />
    </div>
  )
}
