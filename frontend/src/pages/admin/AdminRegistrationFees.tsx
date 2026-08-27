import { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../../lib/api'
import { useToast } from '../../components/Toast'
import { DataTable, type Column } from '../../components/DataTable'

type RegistrationFee = {
  id: string
  member_id: string
  amount: number
  currency: string
  status: string
  payment_method: string | null
  mpesa_receipt: string | null
  transaction_reference: string | null
  paid_at: string | null
  created_at: string
  members: { full_name: string | null; phone: string | null; email: string | null } | null
}

const statusStyles: Record<string, string> = {
  unpaid: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
}

export function AdminRegistrationFees() {
  const { addToast } = useToast()
  const [fees, setFees] = useState<RegistrationFee[]>([])
  const [filter, setFilter] = useState('pending')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<RegistrationFee | null>(null)
  const [confirmReceipt, setConfirmReceipt] = useState('')
  const [confirmRef, setConfirmRef] = useState('')

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      let url = '/admin/registration-fee/pending'
      if (filter === 'all') url = '/admin/registration-fee/pending'
      const d = await api<{ pending_fees: RegistrationFee[] }>(url, { auth: true })
      setFees(d.pending_fees ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load registration fees.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function confirmPayment(fee: RegistrationFee) {
    setBusyId(fee.id)
    try {
      await api('/admin/registration-fee/confirm', {
        method: 'POST', auth: true,
        body: { memberId: fee.member_id, mpesaReceipt: confirmReceipt.trim() || undefined, transactionReference: confirmRef.trim() || undefined },
      })
      addToast('success', `Registration fee confirmed for ${fee.members?.full_name ?? 'member'}.`)
      setConfirmTarget(null)
      setConfirmReceipt('')
      setConfirmRef('')
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not confirm payment.')
    } finally {
      setBusyId(null)
    }
  }

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'member_name',
      header: 'Member',
      render: (row) => {
        const fee = row as unknown as RegistrationFee
        return (
          <div>
            <div className="font-medium text-gray-900">{fee.members?.full_name ?? 'Unknown'}</div>
            <div className="text-xs text-gray-500">{fee.members?.email ?? ''}</div>
            <div className="text-xs text-gray-400">{fee.members?.phone ?? ''}</div>
          </div>
        )
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => <span className="font-medium text-gray-900">KSh {(row as unknown as RegistrationFee).amount.toLocaleString('en-KE')}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const fee = row as unknown as RegistrationFee
        return (
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[fee.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {fee.status}
          </span>
        )
      },
    },
    { key: 'payment_method', header: 'Method', render: (row) => (row as unknown as RegistrationFee).payment_method ?? '—', className: 'text-xs' },
    {
      key: 'created_at',
      header: 'Date',
      render: (row) => <span className="text-gray-500 text-xs">{new Date((row as unknown as RegistrationFee).created_at).toLocaleDateString()}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) => {
        const fee = row as unknown as RegistrationFee
        return (
          fee.status !== 'paid' && (
            <button
              onClick={() => setConfirmTarget(fee)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              Confirm Payment
            </button>
          )
        )
      },
    },
  ]

  return (
    <div className="py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registration Fees</h1>
          <p className="mt-1 text-sm text-gray-500">Review and confirm member registration fee payments.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
        {[
          { value: 'pending', label: 'Pending' },
          { value: 'all', label: 'All' },
        ].map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === f.value ? 'bg-luma-100 text-luma-700' : 'text-gray-500 hover:bg-gray-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Fees Table */}
      {loading ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <svg className="mx-auto h-6 w-6 animate-spin text-luma-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-3 text-sm text-gray-500">Loading registration fees…</p>
        </div>
      ) : (
        <div className="mt-6">
          <DataTable
            data={fees as unknown as Record<string, unknown>[]}
            columns={columns}
            keyExtractor={(r) => String(r.id)}
            pageSize={25}
            emptyMessage="No registration fees found."
            renderMobileCard={(row) => {
              const fee = row as unknown as RegistrationFee
              return (
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="font-medium text-gray-900">{fee.members?.full_name ?? 'Unknown'}</div>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyles[fee.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {fee.status}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-gray-900">KSh {fee.amount.toLocaleString('en-KE')}</div>
                  <div className="text-xs text-gray-500">{fee.payment_method ?? '—'}</div>
                  {fee.status !== 'paid' && (
                    <button onClick={() => setConfirmTarget(fee)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Confirm Payment</button>
                  )}
                </div>
              )
            }}
          />
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Registration Fee</h3>
              <p className="mt-1 text-sm text-gray-500">Confirm that {confirmTarget.members?.full_name} has paid KSh {confirmTarget.amount}.</p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">M-Pesa Receipt (optional)</label>
                  <input value={confirmReceipt} onChange={(e) => setConfirmReceipt(e.target.value)} placeholder="e.g. QHK123ABC456" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" aria-label="M-Pesa receipt number" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Transaction Reference (optional)</label>
                  <input value={confirmRef} onChange={(e) => setConfirmRef(e.target.value)} placeholder="e.g. REF12345" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" aria-label="Transaction reference" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => { setConfirmTarget(null); setConfirmReceipt(''); setConfirmRef('') }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => confirmPayment(confirmTarget)} disabled={busyId === confirmTarget.id} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {busyId === confirmTarget.id ? 'Confirming…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
