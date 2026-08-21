import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useHead } from '../../lib/seo'

type Qualification = {
  status: 'eligible' | 'not_eligible' | 'at_risk' | 'revoked'
  eligible_from: string | null
  criteria_met: Record<string, unknown>
}

type Card = {
  subscription_id: string
  package: { code: string; name: string }
  tier_name: string | null
  monthly_amount: number
  status: string
  waiting_period_months: number | null
  contributions: {
    paid: number
    required: number | null
    months_to_go: number | null
    current_month_paid: boolean
  }
  qualification: Qualification
  welfare_cover_at_risk: boolean
  next_due_date: string | null
}

function money(n: number): string {
  return `KSh ${n.toLocaleString('en-KE')}`
}

function statusBadge(card: Card): { label: string; cls: string } {
  const q = card.qualification.status
  if (q === 'eligible') return { label: 'QUALIFIED — ready to claim', cls: 'bg-luma-600 text-white' }
  if (q === 'at_risk') return { label: 'Cover at risk', cls: 'bg-gold-500 text-luma-950' }
  if (q === 'revoked') return { label: 'Cover lapsed', cls: 'bg-red-600 text-white' }
  if (card.status === 'pending') return { label: 'Awaiting approval', cls: 'bg-stone-200 text-stone-700' }
  return { label: 'Contributing', cls: 'bg-luma-100 text-luma-800' }
}

export function Dashboard() {
  useHead('Dashboard', undefined, { noindex: true })
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ cards: Card[] }>('/member/dashboard', { auth: true })
      .then((d) => setCards(d.cards))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="container-luma py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-luma-900">Your packages</h1>
          <p className="mt-1 text-sm text-stone-600">
            One card per package — each tracks its own contributions and waiting period.
          </p>
        </div>
        <Link to="/join" className="rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700">
          + Join a package
        </Link>
      </div>

      {loading && <div className="py-16 text-center text-stone-500">Loading your packages…</div>}
      {error && <div className="py-16 text-center text-red-600">{error}</div>}

      {!loading && !error && cards.length === 0 && (
        <div className="mt-8 rounded-xl border border-stone-200 bg-white p-10 text-center">
          <p className="text-stone-600">You are not in any packages yet.</p>
          <Link to="/join" className="mt-4 inline-block rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700">
            Browse packages
          </Link>
        </div>
      )}

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {cards.map((card) => {
          const badge = statusBadge(card)
          const label = card.package.name + (card.tier_name ? ` (${card.tier_name})` : '')
          return (
            <div key={card.subscription_id} className="rounded-2xl border border-stone-200 bg-white p-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-bold text-luma-900">{label}</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Monthly</div>
                  <div className="mt-1 text-lg font-bold text-luma-700">{money(card.monthly_amount)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Progress</div>
                  <div className="mt-1 text-lg font-bold text-stone-800">
                    {card.waiting_period_months === null
                      ? 'Ongoing'
                      : `${card.contributions.paid}/${card.waiting_period_months} months`}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Position</div>
                  <div className="mt-1 text-sm font-medium text-stone-600">
                    {card.qualification.status === 'eligible'
                      ? `Eligible from ${card.qualification.eligible_from ?? '—'}`
                      : card.contributions.months_to_go != null
                        ? `${card.contributions.months_to_go} month${card.contributions.months_to_go === 1 ? '' : 's'} to go`
                        : 'Contributions must stay current'}
                  </div>
                </div>
              </div>

              {card.package.code === 'welfare' && (
                <div
                  className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                    card.welfare_cover_at_risk
                      ? 'bg-red-50 text-red-700'
                      : 'bg-luma-50 text-luma-800'
                  }`}
                >
                  {card.welfare_cover_at_risk
                    ? 'Your burial and emergency cover is at risk. This month\'s contribution is not recorded yet.'
                    : 'Burial and emergency cover is current for this month.'}
                </div>
              )}

              <div className="mt-5 flex gap-3 border-t border-stone-100 pt-4">
                <Link
                  to="/contributions"
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
                >
                  Contributions
                </Link>
                <button
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
                  title="Claims open in phase 2"
                >
                  Claim
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}