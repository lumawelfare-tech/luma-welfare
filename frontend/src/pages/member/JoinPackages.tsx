import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useHead } from '../../lib/seo'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { reportLoadError } from '../../lib/userFacingError'

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
  useHead('Join Packages', undefined, { noindex: true })
  const { member, registrationFeePaid } = useAuth()
  const [packages, setPackages] = useState<Package[]>([])
  const [mine, setMine] = useState<Subscription[]>([])
  const [tierChoice, setTierChoice] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  function reloadSubscriptions() {
    api<{ subscriptions: Subscription[] }>('/auth/me', { auth: true })
      .then((d) => setMine(d.subscriptions ?? []))
      .catch(() => {})
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api<{ packages: Package[] }>('/packages?resource=packages'),
      api<{ subscriptions: Subscription[] }>('/auth/me', { auth: true }).catch(() => ({ subscriptions: [] as Subscription[] })),
    ])
      .then(([pkgData, meData]) => {
        setPackages(pkgData.packages ?? [])
        setMine(meData.subscriptions ?? [])
      })
      .catch((e) => setError(reportLoadError(e, { page: 'member-join-packages' }, 'Could not load packages.')))
      .finally(() => setLoading(false))
  }, [])

  const joinedIds = new Set(mine.filter((s) => s.status !== 'cancelled').map((s) => s.package_id))
  const activeSubs = mine.filter((s) => s.status !== 'cancelled')

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
      setNotice(`${p.name} added. Your subscription is pending activation. Next: record your first contribution under Contributions.`)
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
        <div className="glass-panel p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Account {member.status}</h1>
          <p className="mt-2 text-sm text-gray-500">Your account has been {member.status}. Please contact support.</p>
          <Link to="/dashboard" className="mt-4 inline-block rounded-lg bg-luma-700 px-4 py-2 text-sm font-medium text-white hover:bg-luma-800">Dashboard</Link>
        </div>
      </div>
    )
  }

  if (!registrationFeePaid) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
        <PageHeader
          title="Activation fee required"
          breadcrumbs={[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Explore Packages' },
          ]}
        />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-900">Complete your KSh 300 activation fee</h2>
          <p className="mt-2 text-sm text-gray-600">
            Online M-Pesa is not live yet. An administrator can verify your fee, or you can try online payment from the dashboard if it has been enabled.
          </p>
          <Link to="/dashboard" className="mt-4 inline-block rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-luma-800 min-h-[44px]">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      <PageHeader
        title="Explore Packages"
        description="Choose welfare packages available to you. Each package is tracked separately with its own contributions and qualification rules."
        breadcrumbs={[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Explore Packages' },
        ]}
      />

      {notice && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={() => { setError(null); reloadSubscriptions() }} />
        </div>
      )}

      {activeSubs.length > 0 && (
        <section className="mb-8" aria-labelledby="your-packages-heading">
          <h2 id="your-packages-heading" className="text-sm font-semibold text-gray-900 mb-3">Your packages</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {activeSubs.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between gap-3 glass-panel px-4 py-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900">{sub.packages?.[0]?.name ?? 'Package'}</span>
                  <div className="mt-1">
                    <StatusBadge status={sub.status}>{sub.status}</StatusBadge>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => cancelSubscription(sub)}
                  disabled={cancelingId === sub.id}
                  className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors min-h-[44px] px-2"
                >
                  {cancelingId === sub.id ? 'Cancelling…' : 'Cancel'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 luma-skeleton rounded-xl" />
          ))}
        </div>
      )}

      {!loading && packages.length === 0 && !error && (
        <EmptyState
          title="No packages available"
          message="Welfare packages will appear here when they are published."
          icon="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      )}

      {!loading && packages.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((p) => {
            const joined = joinedIds.has(p.id)
            const minAmount = p.tiers.length > 0 ? Math.min(...p.tiers.map((t) => t.amount)) : 0
            const maxAmount = p.tiers.length > 0 ? Math.max(...p.tiers.map((t) => t.amount)) : 0
            return (
              <article
                key={p.id}
                className={`flex flex-col glass-panel p-5 transition-shadow duration-[var(--motion-fast)] ${
                  joined ? 'ring-1 ring-luma-200' : 'hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-gray-900">{p.name}</h2>
                  {joined && <StatusBadge tone="success">Joined</StatusBadge>}
                </div>
                <p className="mt-2 flex-1 text-sm text-gray-500 line-clamp-3">{p.description}</p>

                <div className="mt-4 rounded-lg bg-gray-50/80 p-3">
                  {p.tiers.length === 1 ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-luma-700">KSh {p.tiers[0].amount.toLocaleString('en-KE')}</span>
                      <span className="text-sm text-gray-500">/month</span>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1 flex-wrap">
                        <span className="text-2xl font-bold text-luma-700">KSh {minAmount.toLocaleString('en-KE')}</span>
                        {minAmount !== maxAmount && (
                          <span className="text-sm text-gray-500">– KSh {maxAmount.toLocaleString('en-KE')}</span>
                        )}
                        <span className="text-sm text-gray-500">/month</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">Multiple contribution tiers available</p>
                    </div>
                  )}
                </div>

                <ul className="mt-3 space-y-1.5">
                  <li className="flex items-center gap-2 text-xs text-gray-600">
                    <svg className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Monthly welfare contributions
                  </li>
                  <li className="flex items-center gap-2 text-xs text-gray-600">
                    {p.waiting_period_months != null && p.waiting_period_months > 0 ? (
                      <svg className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    ) : (
                      <svg className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    )}
                    {p.waiting_period_months != null && p.waiting_period_months > 0
                      ? `${p.waiting_period_months}-month waiting period before claims`
                      : 'No fixed waiting period — stay current on contributions'}
                  </li>
                </ul>

                {p.tiers.length > 1 && (
                  <select
                    value={tierChoice[p.id] ?? ''}
                    onChange={(e) => setTierChoice((t) => ({ ...t, [p.id]: e.target.value }))}
                    className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                    aria-label={`Select contribution tier for ${p.name}`}
                    disabled={joined}
                  >
                    <option value="" disabled>Choose your contribution tier</option>
                    {p.tiers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} — KSh {t.amount.toLocaleString('en-KE')}/month</option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => join(p)}
                  disabled={joined || busyId === p.id || (p.tiers.length > 1 && !tierChoice[p.id])}
                  className={`mt-4 w-full rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed min-h-[44px] ${
                    joined
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-luma-700 text-white hover:bg-luma-800 disabled:bg-gray-200 disabled:text-gray-400'
                  }`}
                >
                  {joined ? 'Already joined' : busyId === p.id ? 'Joining…' : 'Join Package'}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
