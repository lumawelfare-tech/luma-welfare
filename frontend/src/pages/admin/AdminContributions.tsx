import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'

type Contribution = {
  id: string
  period: string
  amount: number
  status: string
  member_id: string
  members: { full_name: string; phone: string; membership_number: string | null }[]
  packages: { code: string; name: string }[]
  payments: { mpesa_receipt: string | null }[]
}

export function AdminContributions() {
  const [rows, setRows] = useState<Contribution[]>([])
  const [filter, setFilter] = useState('Pending')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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

  useEffect(() => {
    load()
  }, [filter])

  async function decide(id: string, action: 'verify' | 'reject') {
    setBusyId(id)
    try {
      await api(`/admin/contributions/${id}`, { method: 'PATCH', auth: true, body: { action } })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the contribution.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="container-luma py-10">
      <h1 className="text-2xl font-bold text-luma-900">Contributions</h1>
      <p className="mt-1 text-sm text-stone-600">
        Verify contributions against the member's M-Pesa payment before marking them Paid.
      </p>

      <div className="mt-4 flex gap-3">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-luma-500">
          <option value="Pending">Pending</option>
          <option value="Verified">Verified</option>
          <option value="Late">Late</option>
          <option value="Failed">Failed</option>
          <option value="">All</option>
        </select>
      </div>

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-luma-900">{c.members?.[0]?.full_name}</div>
                  <div className="text-xs text-stone-500">{c.members?.[0]?.phone}</div>
                </td>
                <td className="px-4 py-3 text-stone-600">{c.packages?.[0]?.name}</td>
                <td className="px-4 py-3 text-stone-600">{c.period}</td>
                <td className="px-4 py-3 text-stone-800">KSh {c.amount.toLocaleString('en-KE')}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-gold-400/20 px-2.5 py-1 text-xs font-semibold text-gold-600">{c.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      disabled={busyId === c.id}
                      onClick={() => decide(c.id, 'verify')}
                      className="rounded-md bg-luma-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-luma-700 disabled:opacity-50"
                    >
                      Verify
                    </button>
                    <button
                      disabled={busyId === c.id}
                      onClick={() => decide(c.id, 'reject')}
                      className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-10 text-center text-stone-500">Nothing in this view.</div>}
      </div>
    </div>
  )
}