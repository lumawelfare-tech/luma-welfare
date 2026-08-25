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
type Subscription = { id: string; package_id: string; status: string }

export function JoinPackages() {
  const { member, registrationFeePaid } = useAuth()
  const [packages, setPackages] = useState<Package[]>([])
  const [mine, setMine] = useState<Subscription[]>([])
  const [tierChoice, setTierChoice] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    api<{ packages: Package[] }>('/packages?resource=packages')
      .then((d) => setPackages(d.packages))
      .catch((e) => setError(e.message))
    api<{ subscriptions: Subscription[] }>('/auth/me', { auth: true })
      .then((d) => setMine(d.subscriptions ?? []))
      .catch(() => {})
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
      const d = await api<{ subscriptions: Subscription[] }>('/auth/me', { auth: true })
      setMine(d.subscriptions ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not join this package.')
    } finally {
      setBusyId(null)
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => {
          const joined = joinedIds.has(p.id)
          return (
            <div key={p.id} className={`flex flex-col rounded-xl border bg-white p-5 transition-all ${joined ? 'border-luma-200 bg-luma-50/50' : 'border-gray-200 hover:shadow-md'}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-gray-900">{p.name}</h2>
                {joined && <span className="inline-flex rounded-full bg-luma-100 px-2 py-0.5 text-[10px] font-semibold text-luma-700">Joined</span>}
              </div>
              <p className="mt-2 flex-1 text-sm text-gray-500 line-clamp-3">{p.description}</p>

              {p.tiers.length > 1 && (
                <select
                  value={tierChoice[p.id] ?? ''}
                  onChange={(e) => setTierChoice((t) => ({ ...t, [p.id]: e.target.value }))}
                  className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-luma-500 focus:bg-white"
                >
                  <option value="" disabled>Choose your tier</option>
                  {p.tiers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} — KSh {t.amount}/month</option>
                  ))}
                </select>
              )}

              <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                {p.tiers.length === 1 && <span className="font-medium text-gray-700">KSh {p.tiers[0].amount}/month</span>}
                <span>·</span>
                <span>{p.waiting_period_months == null ? 'No waiting period' : `${p.waiting_period_months}-month wait`}</span>
              </div>

              <button
                onClick={() => join(p)}
                disabled={joined || busyId === p.id || (p.tiers.length > 1 && !tierChoice[p.id])}
                className={`mt-4 w-full rounded-lg py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed ${
                  joined
                    ? 'bg-gray-100 text-gray-400'
                    : 'bg-luma-700 text-white hover:bg-luma-800 disabled:bg-gray-200 disabled:text-gray-400'
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
