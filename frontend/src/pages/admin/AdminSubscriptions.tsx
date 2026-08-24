import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'

type Subscription = {
  id: string
  status: string
  started_at: string | null
  next_due_date: string | null
  member_id: string
  members: { full_name: string; phone: string }[]
  packages: { code: string; name: string }[]
  package_tiers: { name: string; amount: number }[]
}

export function AdminSubscriptions() {
  useHead('Subscriptions', undefined, { noindex: true })
  const [subs, setSubs] = useState<Subscription[]>([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    try {
      let path = '/admin/subscriptions'
      if (filter) path += `?status=${filter}`
      const d = await api<{ subscriptions: Subscription[] }>(path, { auth: true })
      setSubs(d.subscriptions ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load subscriptions.')
    }
  }

  useEffect(() => { load() }, [filter])

  async function decide(id: string, action: 'approve' | 'suspend') {
    setBusyId(id)
    try {
      await api(`/admin/subscriptions/${id}`, { method: 'PATCH', auth: true, body: { action } })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update subscription.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="py-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
        <p className="mt-1 text-sm text-gray-500">Manage member package subscriptions.</p>
      </div>

      <div className="mt-4 flex gap-3">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="Active">Active</option>
          <option value="Pending">Pending</option>
          <option value="Suspended">Suspended</option>
          <option value="Expired">Expired</option>
        </select>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Next Due</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{s.members?.[0]?.full_name}</div>
                  <div className="text-xs text-gray-500">{s.members?.[0]?.phone}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{s.packages?.[0]?.name}</td>
                <td className="px-4 py-3 text-gray-800">
                  {s.package_tiers?.[0]?.amount ? `KSh ${s.package_tiers[0].amount.toLocaleString('en-KE')}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    s.status === 'Active' ? 'bg-green-50 text-green-700' :
                    s.status === 'Pending' ? 'bg-yellow-50 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{s.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{s.started_at ? new Date(s.started_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{s.next_due_date ? new Date(s.next_due_date).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {s.status === 'Pending' && (
                      <button disabled={busyId === s.id} onClick={() => decide(s.id, 'approve')} className="rounded-lg bg-luma-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-luma-700 disabled:opacity-50">Approve</button>
                    )}
                    {s.status === 'Active' && (
                      <button disabled={busyId === s.id} onClick={() => decide(s.id, 'suspend')} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Suspend</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {subs.length === 0 && <div className="p-10 text-center text-gray-500">No subscriptions found.</div>}
      </div>
    </div>
  )
}
