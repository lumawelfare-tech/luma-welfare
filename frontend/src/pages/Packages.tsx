import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { api } from '../lib/api'
import { useHead } from '../lib/seo'
import { MotionSection, MotionCard } from '../components/MotionSection'
import { SkeletonPackageGrid } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'

type Tier = { id: string; package_id: string; name: string; amount: number }
type RuleMap = Record<string, unknown>

type Package = {
  id: string
  code: string
  name: string
  description: string
  coverage: string[]
  waiting_period_months: number | null
  sort_order: number
  tiers: Tier[]
  rules: RuleMap
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 })
}

function waitingLabel(p: Package): string {
  if (p.waiting_period_months === null) return 'No fixed waiting period — contributions must stay current'
  return `${p.waiting_period_months} month${p.waiting_period_months === 1 ? '' : 's'}`
}

export function PackagesPage() {
  useHead('Packages', 'Explore Luma Welfare packages — affordable community welfare plans for hospital costs, education, business, building, and more.', {
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Packages', path: '/packages' },
    ],
  })
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const q = (params.get('q') ?? '').toLowerCase()
  const reduceMotion = useReducedMotion()

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api<{ packages: Package[] }>('/packages?resource=packages')
      .then((d) => setPackages(d.packages))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load packages.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(
    () =>
      q
        ? packages.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.description ?? '').toLowerCase().includes(q) ||
              p.coverage.some((c) => c.toLowerCase().includes(q)),
          )
        : packages,
    [packages, q],
  )

  return (
    <MotionSection className="container-luma py-14" as="div">
      <h1 className="text-3xl font-bold text-luma-900 sm:text-4xl">Our packages</h1>
      <p className="mt-3 max-w-2xl text-gray-600">
        Twelve support packages, each with its own monthly contribution, coverage and waiting
        period. Members can hold more than one package at a time.
      </p>
      {q && !loading && !error && (
        <p className="mt-4 text-sm text-gray-600">
          {filtered.length} result{filtered.length === 1 ? '' : 's'} for “{q}”
        </p>
      )}

      {loading && (
        <div className="mt-10">
          <SkeletonPackageGrid count={4} />
        </div>
      )}

      {!loading && error && (
        <div className="mt-10">
          <EmptyState
            title="Couldn’t load packages"
            message={error}
            icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            action={{ label: 'Retry', onClick: load }}
          />
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {filtered.map((p, i) => (
              <MotionCard key={p.id}>
                <motion.div
                  className="glass-card flex h-full flex-col p-6"
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : Math.min(i * 0.04, 0.24), duration: 0.35 }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-lg font-bold text-luma-900">{p.name}</h2>
                    <span className="rounded-full border border-luma-100 bg-luma-50/90 px-3 py-1 text-xs font-semibold text-luma-800">
                      {waitingLabel(p)}
                    </span>
                  </div>

                  {p.description && <p className="mt-2 text-sm leading-relaxed text-gray-600">{p.description}</p>}

                  <div className="mt-4">
                    <div className="text-sm font-medium text-luma-900">Contribution</div>
                    {p.tiers.length === 1 ? (
                      <div className="mt-1 text-2xl font-bold text-luma-700">
                        {formatAmount(p.tiers[0].amount)}
                        <span className="text-sm font-medium text-gray-500"> /month</span>
                      </div>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {p.tiers.map((t) => (
                          <li key={t.id} className="flex justify-between text-sm">
                            <span className="text-gray-600">{t.name}</span>
                            <span className="font-semibold text-luma-700">{formatAmount(t.amount)}/month</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {p.coverage.length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-luma-900">Covers</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.coverage.map((c) => (
                          <span key={c} className="rounded-md border border-white/60 bg-white/60 px-2 py-1 text-xs text-gray-700">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-auto border-t border-white/50 pt-4 mt-6">
                    <motion.div whileHover={reduceMotion ? undefined : { scale: 1.02 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }} className="inline-block">
                      <Link
                        to="/register"
                        className="inline-block rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-luma-700/25 hover:bg-luma-800"
                      >
                        Join this package
                      </Link>
                    </motion.div>
                  </div>
                </motion.div>
              </MotionCard>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="mt-10">
              <EmptyState
                title="No matching packages"
                message={q ? `No packages match “${q}”. Try a different search, or browse the full list.` : 'No packages are available right now.'}
                icon="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                action={
                  q
                    ? { label: 'Clear search', onClick: () => navigate('/packages') }
                    : { label: 'Retry', onClick: load }
                }
              />
            </div>
          )}
        </>
      )}
    </MotionSection>
  )
}
