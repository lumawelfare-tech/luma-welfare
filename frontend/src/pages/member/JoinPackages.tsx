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
  const { member } = useAuth()
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
      setNotice(
        `${p.name} added! Your subscription is pending activation. Browse your dashboard to track contributions and qualification.`,
      )
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
      <div className="container-luma py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-luma-900">Account {member.status}</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Your account has been {member.status}. Please contact support for assistance.
          </p>
          <Link to="/dashboard" className="mt-5 inline-block rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700">
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container-luma py-10">
      <h1 className="text-2xl font-bold text-luma-900">Join a package</h1>
      <p className="mt-1 text-sm text-stone-600">
        You can hold several packages. Each one is tracked and qualified separately.
      </p>

      {notice && <p className="mt-4 rounded-md bg-luma-50 px-4 py-3 text-sm text-luma-800">{notice}</p>}
      {error && <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => {
          const joined = joinedIds.has(p.id)
          return (
            <div key={p.id} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="font-semibold text-luma-900">{p.name}</h2>
              <p className="mt-1 flex-1 text-sm text-stone-600">{p.description}</p>

              {p.tiers.length > 1 && (
                <select
                  value={tierChoice[p.id] ?? ''}
                  onChange={(e) => setTierChoice((t) => ({ ...t, [p.id]: e.target.value }))}
                  className="mt-3 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-luma-500"
                >
                  <option value="" disabled>
                    Choose your tier
                  </option>
                  {p.tiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — KSh {t.amount}/month
                    </option>
                  ))}
                </select>
              )}

              <div className="mt-3 text-sm text-stone-500">
                {p.tiers.length === 1 ? `KSh ${p.tiers[0].amount}/month · ` : ''}
                {p.waiting_period_months === null
                  ? 'No waiting period — keep contributions current'
                  : `${p.waiting_period_months}-month waiting period`}
              </div>

              <button
                onClick={() => join(p)}
                disabled={joined || busyId === p.id || (p.tiers.length > 1 && !tierChoice[p.id])}
                className="mt-4 rounded-md bg-luma-600 px-3 py-2 text-sm font-semibold text-white hover:bg-luma-700 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {joined ? 'Joined' : busyId === p.id ? 'Joining…' : 'Join'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}