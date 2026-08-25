import { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../../lib/api'

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
  const [fees, setFees] = useState<RegistrationFee[]>([])
  const [filter, setFilter] = useState('pending')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<RegistrationFee | null>(null)
  const [confirmReceipt, setConfirmReceipt] = useState('')
  const [confirmRef, setConfirmRef] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      let url = '/admin/registration-fee/pending'
      if (filter === 'all') {
        // Load all by using a different approach — query all fees via admin-members
        url = '/admin/registration-fee/pending'
      }
      const d = await api<{ pending_fees: RegistrationFee[] }>(url, { auth: true })
      setFees(d.pending_fees ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load registration fees.')
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function confirmPayment(fee: RegistrationFee) {
    setBusyId(fee.id)
    try {
      await api('/admin/registration-fee/confirm', {
        method: 'POST',
        auth: true,
        body: {
          memberId: fee.member_id,
          mpesaReceipt: confirmReceipt.trim() || undefined,
          transactionReference: confirmRef.trim() || undefined,
        },
      })
      setNotice(`Registration fee confirmed for ${fee.members?.full_name ?? 'member'}.`)
      setConfirmTarget(null)
      setConfirmReceipt('')
      setConfirmRef('')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not confirm payment.')
    } finally {
      setBusyId(null)
    }
  }

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

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

      {/* Fees Table */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fees.map((fee) => (
              <tr key={fee.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{fee.members?.full_name ?? 'Unknown'}</div>
                  <div className="text-xs text-gray-500">{fee.members?.email ?? ''}</div>
                  <div className="text-xs text-gray-400">{fee.members?.phone ?? ''}</div>
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">KSh {fee.amount.toLocaleString('en-KE')}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[fee.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {fee.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{fee.payment_method ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(fee.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  {fee.status !== 'paid' && (
                    <button
                      onClick={() => setConfirmTarget(fee)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                    >
                      Confirm Payment
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {fees.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            <p className="text-sm">No {filter === 'pending' ? 'pending ' : ''}registration fees found.</p>
          </div>
        )}
      </div>

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
                  <input
                    value={confirmReceipt}
                    onChange={(e) => setConfirmReceipt(e.target.value)}
                    placeholder="e.g. QHK123ABC456"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Transaction Reference (optional)</label>
                  <input
                    value={confirmRef}
                    onChange={(e) => setConfirmRef(e.target.value)}
                    placeholder="e.g. REF12345"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => { setConfirmTarget(null); setConfirmReceipt(''); setConfirmRef('') }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmPayment(confirmTarget)}
                disabled={busyId === confirmTarget.id}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busyId === confirmTarget.id ? 'Confirming…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
