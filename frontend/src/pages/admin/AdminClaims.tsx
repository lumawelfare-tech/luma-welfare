import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'

type Claim = {
  id: string
  claim_number: string
  claim_type: string | null
  amount_requested: number | null
  status: string
  created_at: string
  member_id: string
  members: { full_name: string; phone: string }[]
  packages: { code: string; name: string }[]
}

export function AdminClaims() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const d = await api<{ claims: Claim[] }>('/admin/claims', { auth: true })
      setClaims(d.claims ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load claims.')
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function decide(id: string, decision: 'approve' | 'reject' | 'request-info') {
    setBusyId(id)
    try {
      await api(`/admin/claims/${id}`, { method: 'PATCH', auth: true, body: { decision } })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the claim.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="container-luma py-10">
      <h1 className="text-2xl font-bold text-luma-900">Claims</h1>
      <p className="mt-1 text-sm text-stone-600">
        Review claims and route them to the payout step. Payout processing (M-Pesa disbursement)
        lands in phase 2; until then approved claims are recorded but not yet disbursed.
      </p>

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Claim</th>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((cl) => (
              <tr key={cl.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-luma-900">{cl.claim_number}</div>
                  <div className="text-xs text-stone-500">{cl.claim_type ?? ''}</div>
                </td>
                <td className="px-4 py-3 text-stone-600">{cl.members?.[0]?.full_name}</td>
                <td className="px-4 py-3 text-stone-600">{cl.packages?.[0]?.name}</td>
                <td className="px-4 py-3 text-stone-800">
                  {cl.amount_requested ? `KSh ${cl.amount_requested.toLocaleString('en-KE')}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">{cl.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      disabled={busyId === cl.id || cl.status !== 'Submitted'}
                      onClick={() => decide(cl.id, 'approve')}
                      className="rounded-md bg-luma-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-luma-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busyId === cl.id || cl.status !== 'Submitted'}
                      onClick={() => decide(cl.id, 'request-info')}
                      className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                    >
                      More info
                    </button>
                    <button
                      disabled={busyId === cl.id || cl.status !== 'Submitted'}
                      onClick={() => decide(cl.id, 'reject')}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {claims.length === 0 && <div className="p-10 text-center text-stone-500">No claims yet.</div>}
      </div>
    </div>
  )
}