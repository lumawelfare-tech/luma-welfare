import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

type Tier = { id: string; name: string; amount: number }
type Package = {
  id: string
  code: string
  name: string
  description: string
  waiting_period_months: number | null
  tiers: Tier[]
}
type Subscription = { id: string; package_id: string; status: string; packages?: { name: string }[] }

export function JoinPackages() {
  const { member, registrationFeePaid } = useAuth()
  const [packages, setPackages] = useState<Package[]>([])
  const [mine, setMine] = useState<Subscription[]>([])
  const [tierChoice, setTierChoice] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function reloadSubscriptions() {
    api<{ subscriptions: Subscription[] }>('/auth/me', { auth: true })
      .then((d) => setMine(d.subscriptions ?? []))
      .catch(() => {})
  }

  useEffect(() => {
    api<{ packages: Package[] }>('/packages?resource=packages')
      .then((d) => setPackages(d.packages))
      .catch((e) => setError(e.message))
    reloadSubscriptions()
  }, [])

  const joinedIds = new Set(mine.filter((s) => s.status !== 'cancelled').map((s) => s.package_id))

  async function join(p: Package) {
    setError(null)
    setNotice(null)
    setBusyId(p.id)
    try {
      const tierId = tierChoice[p.id]
      await api('/member/subscriptions', {
        method: 'POST',
        auth: true,
        body: { packageId: p.id, packageTierId: tierId || undefined },
      })
      setNotice(`${p.name} added! Your subscription is pending activation.`)
      reloadSubscriptions()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not join this package.')
    } finally {
      setBusyId(null)
    }
  }

  async function cancelSubscription(sub: Subscription) {
    if (!confirm(`Are you sure you want to cancel your ${sub.packages?.[0]?.name ?? 'package'} subscription? This action cannot be undone.`)) return
    setCancelingId(sub.id)
    setError(null)
    try {
      await api(`/member/subscriptions/${sub.id}`, {
        method: 'DELETE',
        auth: true,
      })
      setNotice('Subscription cancelled successfully.')
      reloadSubscriptions()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not cancel subscription.')
    } finally {
      setCancelingId(null)
    }
  }

  if (member && (member.status === 'suspended' || member.status === 'closed')) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Account {member.status}</h1>
          <p className="mt-2 text-sm text-gray-500">Your account has been {member.status}. Please contact support.</p>
          <Link to="/dashboard" className="mt-4 inline-block rounded-lg bg-luma-700 px-4 py-2 text-sm font-medium text-white hover:bg-luma-800">Dashboard</Link>
        </div>
      </div>
    )
  }

  // Block package access if registration fee is not paid
  if (!registrationFeePaid) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Registration Fee Required</h1>
          <p className="mt-2 text-sm text-gray-600">
            Please pay the one-time KSh 300 registration fee to activate your membership and access welfare packages.
          </p>
          <Link to="/dashboard" className="mt-4 inline-block rounded-lg bg-luma-700 px-4 py-2 text-sm font-medium text-white hover:bg-luma-800">Go to Dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Explore Packages</h1>
        <p className="mt-1 text-sm text-gray-500">Find the welfare packages available to you. Each is tracked separately.</p>
      </div>

      {notice && <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Active Subscriptions */}
      {mine.filter(s => s.status !== 'cancelled').length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Your Active Subscriptions</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.filter(s => s.status !== 'cancelled').map((sub) => (
              <div key={sub.id} className="flex items-center justify-between rounded-xl border border-luma-200 bg-luma-50/50 px-4 py-3">
                <div>
                  <span className="text-sm font-medium text-gray-900">{sub.packages?.[0]?.name ?? 'Package'}</span>
                  <span className={`ml-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sub.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {sub.status}
                  </span>
                </div>
                <button
                  onClick={() => cancelSubscription(sub)}
                  disabled={cancelingId === sub.id}
                  className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
                >
                  {cancelingId === sub.id ? 'Cancelling…' : 'Cancel'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => {
          const joined = joinedIds.has(p.id)
          const minAmount = p.tiers.length > 0 ? Math.min(...p.tiers.map(t => t.amount)) : 0
          const maxAmount = p.tiers.length > 0 ? Math.max(...p.tiers.map(t => t.amount)) : 0
          return (
            <div key={p.id} className={`flex flex-col rounded-xl border bg-white p-5 transition-all ${joined ? 'border-luma-200 bg-luma-50/50' : 'border-gray-200 hover:shadow-md'}`}>
              {/* Header with badge */}
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-gray-900">{p.name}</h2>
                {joined && <span className="inline-flex rounded-full bg-luma-100 px-2 py-0.5 text-[10px] font-semibold text-luma-700">Joined</span>}
              </div>
              <p className="mt-2 flex-1 text-sm text-gray-500 line-clamp-3">{p.description}</p>

              {/* Pricing card */}
              <div className="mt-4 rounded-lg bg-gray-50 p-3">
                {p.tiers.length === 1 ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-luma-700">KSh {p.tiers[0].amount.toLocaleString('en-KE')}</span>
                    <span className="text-sm text-gray-500">/month</span>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-luma-700">KSh {minAmount.toLocaleString('en-KE')}</span>
                      {minAmount !== maxAmount && <span className="text-sm text-gray-500">– KSh {maxAmount.toLocaleString('en-KE')}</span>}
                      <span className="text-sm text-gray-500">/month</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">Multiple contribution tiers available</p>
                  </div>
                )}
              </div>

              {/* Benefits list */}
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <svg className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>Monthly welfare contributions</span>
                </div>
                {p.waiting_period_months != null && p.waiting_period_months > 0 ? (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <svg className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>{p.waiting_period_months}-month waiting period before claims</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <svg className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                    <span>No waiting period — eligible immediately</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <svg className="h-3.5 w-3.5 text-luma-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>Welfare support when you need it</span>
                </div>
              </div>

              {/* Tier selector */}
              {p.tiers.length > 1 && (
                <select
                  value={tierChoice[p.id] ?? ''}
                  onChange={(e) => setTierChoice((t) => ({ ...t, [p.id]: e.target.value }))}
                  className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                  aria-label="Select contribution tier"
                >
                  <option value="" disabled>Choose your contribution tier</option>
                  {p.tiers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} — KSh {t.amount.toLocaleString('en-KE')}/month</option>
                  ))}
                </select>
              )}

              <button
                onClick={() => join(p)}
                disabled={joined || busyId === p.id || (p.tiers.length > 1 && !tierChoice[p.id])}
                className={`mt-4 w-full rounded-lg py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed min-h-[44px] ${
                  joined
                    ? 'bg-gray-100 text-gray-400'
                    : 'bg-luma-700 text-white hover:bg-luma-800 active:bg-luma-900 disabled:bg-gray-200 disabled:text-gray-400'
                }`}
              >
                {joined ? 'Already joined' : busyId === p.id ? 'Joining…' : 'Join Package'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
