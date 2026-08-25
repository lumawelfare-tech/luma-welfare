import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'

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
  const [rows, setRows] = useState<Contribution[]>([])
  const [filter, setFilter] = useState('Pending')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Contribution | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')

  async function load() {
    setError(null)
    try {
      const d = await api<{ contributions: Contribution[] }>(
        `/admin/contributions${filter ? `?status=${filter}` : ''}`,
        { auth: true },
      )
      setRows(d.contributions ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load contributions.')
    }
  }

  useEffect(() => { load() }, [filter])

  async function verify(id: string) {
    setBusyId(id)
    setNotice(null)
    try {
      await api(`/admin/contributions/${id}`, {
        method: 'PATCH',
        auth: true,
        body: { action: 'verify' },
      })
      setNotice('Contribution verified successfully.')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not verify contribution.')
    } finally {
      setBusyId(null)
    }
  }

  async function reject(contribution: Contribution) {
    setBusyId(contribution.id)
    setNotice(null)
    try {
      await api(`/admin/contributions/${contribution.id}`, {
        method: 'PATCH',
        auth: true,
        body: { action: 'reject', notes: rejectNotes.trim() || undefined },
      })
      setNotice(`Contribution for ${contribution.members?.full_name ?? 'member'} rejected.`)
      setRejectTarget(null)
      setRejectNotes('')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reject contribution.')
    } finally {
      setBusyId(null)
    }
  }

  const pendingCount = rows.filter(r => r.status === 'Pending').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contributions</h1>
        <p className="text-sm text-gray-500 mt-1">Review and verify member contribution payments.</p>
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

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">{notice}</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{c.members?.full_name ?? 'Unknown'}</div>
                  <div className="text-xs text-gray-500">{c.members?.email ?? c.members?.phone ?? ''}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{c.packages?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600 font-mono">{c.period}</td>
                <td className="px-4 py-3 font-medium text-gray-900">KSh {c.amount.toLocaleString('en-KE')}</td>
                <td className="px-4 py-3 text-gray-500 text-xs capitalize">
                  {(c.payments?.channel ?? 'manual').replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                  {c.payments?.mpesa_receipt ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyles[c.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {c.status === 'Pending' && (
                    <div className="flex justify-end gap-2">
                      <button
                        disabled={busyId === c.id}
                        onClick={() => verify(c.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {busyId === c.id ? 'Processing…' : (
                          <>
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                            Verify
                          </>
                        )}
                      </button>
                      <button
                        disabled={busyId === c.id}
                        onClick={() => { setRejectTarget(c); setRejectNotes('') }}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        Reject
                      </button>
                    </div>
                  )}
                  {c.status !== 'Pending' && c.notes && (
                    <span className="text-xs text-gray-400 italic max-w-[120px] block truncate" title={c.notes}>
                      {c.notes}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            <p className="text-sm">No {filter ? filter.toLowerCase() : ''} contributions found.</p>
          </div>
        )}
      </div>

      {/* Reject Dialog */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">Reject Contribution</h3>
              <p className="mt-1 text-sm text-gray-500">
                Reject the KSh {rejectTarget.amount.toLocaleString('en-KE')} contribution from{' '}
                <strong>{rejectTarget.members?.full_name ?? 'member'}</strong> for period{' '}
                <strong>{rejectTarget.period}</strong>?
              </p>
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
                <textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="e.g. Transaction reference not found, amount mismatch…"
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => { setRejectTarget(null); setRejectNotes('') }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => reject(rejectTarget)}
                disabled={busyId === rejectTarget.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busyId === rejectTarget.id ? 'Rejecting…' : 'Reject Contribution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
