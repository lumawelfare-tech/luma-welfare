import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../lib/api'

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
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').toLowerCase()

  useEffect(() => {
    api<{ packages: Package[] }>('/packages')
      .then((d) => setPackages(d.packages))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

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

  if (loading) return <div className="container-luma py-20 text-center text-stone-500">Loading packages…</div>
  if (error) return <div className="container-luma py-20 text-center text-red-600">{error}</div>

  return (
    <div className="container-luma py-14">
      <h1 className="text-3xl font-bold text-luma-900 sm:text-4xl">Our packages</h1>
      <p className="mt-3 max-w-2xl text-stone-600">
        Twelve support packages, each with its own monthly contribution, coverage and waiting
        period. Members can hold more than one package at a time.
      </p>
      {q && (
        <p className="mt-4 text-sm text-stone-500">
          {filtered.length} result{filtered.length === 1 ? '' : 's'} for “{q}”
        </p>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {filtered.map((p) => (
          <div key={p.id} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-bold text-luma-900">{p.name}</h2>
              <span className="rounded-full bg-luma-50 px-3 py-1 text-xs font-semibold text-luma-700">
                {waitingLabel(p)}
              </span>
            </div>

            {p.description && <p className="mt-2 text-sm leading-relaxed text-stone-600">{p.description}</p>}

            <div className="mt-4">
              <div className="text-sm font-medium text-luma-900">Contribution</div>
              {p.tiers.length === 1 ? (
                <div className="mt-1 text-2xl font-bold text-luma-700">
                  {formatAmount(p.tiers[0].amount)}
                  <span className="text-sm font-medium text-stone-500"> /month</span>
                </div>
              ) : (
                <ul className="mt-1 space-y-1">
                  {p.tiers.map((t) => (
                    <li key={t.id} className="flex justify-between text-sm">
                      <span className="text-stone-600">{t.name}</span>
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
                    <span key={c} className="rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-600">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 border-t border-stone-100 pt-4">
              <Link
                to="/register"
                className="rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700"
              >
                Join this package
              </Link>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="mt-10 rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
          No packages match “{q}”. Try a different search, or browse the full list.
        </div>
      )}
    </div>
  )
}