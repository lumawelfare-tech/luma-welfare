import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'

type Subscription = {
  id: string
  status: string
  package_id: string
  packages: { code: string; name: string }[]
  package_tiers: { name: string; amount: number }[]
}

type Contribution = {
  id: string
  subscription_id: string
  period: string
  amount: number
  status: string
  notes: string | null
  created_at: string
  packages: { code: string; name: string }[]
}

const statusStyle: Record<string, string> = {
  Paid: 'bg-luma-100 text-luma-800',
  Verified: 'bg-luma-100 text-luma-800',
  Pending: 'bg-gold-400/20 text-gold-600',
  Failed: 'bg-red-50 text-red-700',
  Reversed: 'bg-red-50 text-red-700',
  Late: 'bg-gold-400/20 text-gold-600',
}

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function Contributions() {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [rows, setRows] = useState<Contribution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(currentPeriod())
  const [subscriptionId, setSubscriptionId] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const [me, contribs] = await Promise.all([
        api<{ subscriptions: Subscription[] }>('/auth/me', { auth: true }),
        api<{ contributions: Contribution[] }>('/contributions', { auth: true }),
      ])
      const active = (me.subscriptions ?? []).filter((s) => s.status === 'active')
      setSubs(active)
      if (active.length > 0) setSubscriptionId((id) => id || active[0].id)
      setRows(contribs.contributions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function record(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await api('/contributions', {
        method: 'POST',
        auth: true,
        body: {
          subscriptionId,
          period,
          amount: Number(amount),
        },
      })
      setPeriod(currentPeriod())
      setAmount('')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the contribution.')
    } finally {
      setSaving(false)
    }
  }

  const selectedSub = subs.find((s) => s.id === subscriptionId)

  return (
    <div className="container-luma py-10">
      <h1 className="text-2xl font-bold text-luma-900">Contributions</h1>
      <p className="mt-1 text-sm text-stone-600">
        Recorded per package. A contribution marked Pending is checked by a finance admin before
        it is Verified.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <form onSubmit={record} className="rounded-2xl border border-stone-200 bg-white p-6 lg:col-span-1">
          <h2 className="font-semibold text-luma-900">Record this month&apos;s contribution</h2>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Package</label>
              <select
                value={subscriptionId}
                onChange={(e) => setSubscriptionId(e.target.value)}
                className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500"
              >
                <option value="" disabled>
                  {subs.length ? 'Select a package' : 'No active packages'}
                </option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.packages?.[0]?.name} — {s.package_tiers?.[0]?.name ?? ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Period (YYYY-MM)</label>
              <input
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                pattern="\d{4}-\d{2}"
                className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Amount (KSh)</label>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={selectedSub ? String(selectedSub.package_tiers?.[0]?.amount ?? '') : ''}
                className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500"
              />
              {selectedSub?.package_tiers?.[0]?.amount && (
                <p className="mt-1 text-xs text-stone-500">
                  Expected: KSh {selectedSub.package_tiers[0].amount} for this package.
                </p>
              )}
            </div>

            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button
              disabled={saving || subs.length === 0}
              className="w-full rounded-md bg-luma-600 py-2.5 text-sm font-semibold text-white hover:bg-luma-700 disabled:opacity-50"
            >
              {saving ? 'Recording…' : 'Record contribution'}
            </button>
            <p className="text-xs leading-relaxed text-stone-500">
              You still need to send the money to M-Pesa Paybill 522522, account 454545#. M-Pesa
              payment matching is being wired in phase 2; until then an admin verifies your
              contribution.
            </p>
          </div>
        </form>

        <div className="lg:col-span-2">
          {loading && <div className="py-16 text-center text-stone-500">Loading…</div>}

          {!loading && rows.length === 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-stone-500">
              No contributions yet. Record this month&apos;s contribution on the left.
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-stone-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-luma-900">{c.packages?.[0]?.name}</td>
                    <td className="px-4 py-3 text-stone-600">{c.period}</td>
                    <td className="px-4 py-3 text-stone-800">KSh {c.amount.toLocaleString('en-KE')}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[c.status] ?? 'bg-stone-100 text-stone-600'}`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}