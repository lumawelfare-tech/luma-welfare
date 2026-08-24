import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

type Subscription = { id: string; status: string; packages: { code: string; name: string }[]; package_tiers: { name: string; amount: number }[] }
type Contribution = { id: string; subscription_id: string; period: string; amount: number; status: string; packages: { code: string; name: string }[]; created_at: string }

const statusStyle: Record<string, string> = {
  Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
  Late: 'bg-amber-50 text-amber-700 border-amber-200',
}

export function Contributions() {
  const [rows, setRows] = useState<Contribution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const [, contribs] = await Promise.all([
        api<{ subscriptions: Subscription[] }>('/auth/me', { auth: true }),
        api<{ contributions: Contribution[] }>('/contributions', { auth: true }),
      ])
      setRows(contribs.contributions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contributions.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contributions</h1>
        <p className="mt-1 text-sm text-gray-500">Track your contribution history and payment status.</p>
      </div>

      {loading && (
        <div className="mt-8 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button onClick={() => { setError(null); setLoading(true); load() }} className="ml-3 font-medium underline">Retry</button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">No contributions yet</h2>
          <p className="mt-2 text-sm text-gray-500">Your contribution history will appear here once you start contributing.</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Package</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.packages?.[0]?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.period}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">KSh {c.amount.toLocaleString('en-KE')}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusStyle[c.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
