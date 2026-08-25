import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useHead } from '../../lib/seo'

type Qualification = {
  status: 'eligible' | 'not_eligible' | 'at_risk' | 'revoked'
  eligible_from: string | null
  criteria_met: Record<string, unknown>
}

type Card = {
  subscription_id: string
  package: { code: string | null; name: string | null } | null
  tier_name: string | null
  monthly_amount: number | null
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

function money(n: number | null | undefined): string {
  if (n == null || n === 0) return '—'
  return `KSh ${n.toLocaleString('en-KE')}`
}

function packageName(card: Card): string {
  return card.package?.name ?? 'Package'
}

function packageCode(card: Card): string {
  return card.package?.code ?? ''
}

function statusConfig(card: Card): { label: string; color: string; bg: string } {
  const q = card.qualification.status
  if (q === 'eligible') return { label: 'Qualified', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' }
  if (q === 'at_risk') return { label: 'Cover at risk', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' }
  if (q === 'revoked') return { label: 'Cover lapsed', color: 'text-red-700', bg: 'bg-red-50 border-red-200' }
  if (card.status === 'pending') return { label: 'Pending', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' }
  return { label: 'Contributing', color: 'text-luma-700', bg: 'bg-luma-50 border-luma-200' }
}

function progressPercent(card: Card): number {
  if (!card.waiting_period_months || card.waiting_period_months === 0) return 100
  return Math.min(100, Math.round((card.contributions.paid / card.waiting_period_months) * 100))
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="h-5 w-32 rounded bg-gray-200" />
        <div className="h-6 w-20 rounded-full bg-gray-200" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div><div className="h-3 w-16 rounded bg-gray-100" /><div className="mt-1 h-6 w-24 rounded bg-gray-200" /></div>
        <div><div className="h-3 w-16 rounded bg-gray-100" /><div className="mt-1 h-6 w-20 rounded bg-gray-200" /></div>
      </div>
      <div className="mt-4 h-2 w-full rounded-full bg-gray-100">
        <div className="h-2 w-1/3 rounded-full bg-gray-200" />
      </div>
    </div>
  )
}

export function Dashboard() {
  useHead('Dashboard', undefined, { noindex: true })
  const { member } = useAuth()
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [registrationFeePaid, setRegistrationFeePaid] = useState<boolean | null>(null)
  const [registrationFeeLoading, setRegistrationFeeLoading] = useState(true)
  const [payingFee, setPayingFee] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    api<{ cards: Card[]; registration_fee_paid: boolean }>('/member/dashboard', { auth: true })
      .then((d) => {
        setCards(d.cards ?? [])
        setRegistrationFeePaid(d.registration_fee_paid ?? false)
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        setLoading(false)
        setRegistrationFeeLoading(false)
      })
  }, [])

  async function handlePayRegistrationFee() {
    setPayingFee(true)
    try {
      await api('/member/registration-fee/initiate', { method: 'POST', auth: true })
      setNotice('Payment initiated. Please complete the M-Pesa payment on your phone. An admin will verify your payment shortly.')
    } catch {
      setError('Could not initiate registration fee. Please try again.')
    } finally {
      setPayingFee(false)
    }
  }

  const memberName = member?.full_name?.split(' ')[0] ?? 'there'
  const activeCount = cards.filter((c) => c.status === 'active').length
  const totalMonthly = cards.reduce((sum, c) => sum + (c.monthly_amount ?? 0), 0)
  const qualifiedCount = cards.filter((c) => c.qualification.status === 'eligible').length

  // Show registration fee prompt if not paid
  if (!loading && !registrationFeeLoading && registrationFeePaid === false) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-bold text-gray-900">Complete Your Membership</h2>
          <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
            Pay the one-time KSh 300 registration fee to activate your Luma Welfare membership and access available welfare packages.
          </p>
          {notice ? (
            <div className="mt-6 rounded-lg bg-amber-50 border border-amber-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-amber-800">Payment pending — waiting for admin verification.</span>
              </div>
              <p className="mt-1 text-xs text-amber-600">You will have access to packages once your payment is confirmed.</p>
            </div>
          ) : (
            <button
              onClick={handlePayRegistrationFee}
              disabled={payingFee}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-luma-700 px-6 py-3 text-sm font-semibold text-white hover:bg-luma-800 transition-all disabled:opacity-50"
            >
              {payingFee ? (
                <>Processing…</>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                  Pay KSh 300
                </>
              )}
            </button>
          )}
          <p className="mt-3 text-xs text-gray-500">
            This is a one-time fee. You will not be charged again.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {memberName}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here's an overview of your Luma Welfare membership.
        </p>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
                <div className="h-3 w-20 rounded bg-gray-100" />
                <div className="mt-2 h-7 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </div>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">We couldn't load your membership information.</p>
          <button onClick={() => { setError(null); setLoading(true); setRegistrationFeeLoading(true); api<{ cards: Card[]; registration_fee_paid: boolean }>('/member/dashboard', { auth: true }).then((d) => { setCards(d.cards ?? []); setRegistrationFeePaid(d.registration_fee_paid ?? false) }).catch((e) => setError(e.message)).finally(() => { setLoading(false); setRegistrationFeeLoading(false) }) }} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">
            Try Again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && cards.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">No packages yet</h2>
          <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
            You don't have any packages yet. Explore the available Luma Welfare packages and choose one that suits your needs.
          </p>
          <Link to="/join" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-all">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Explore Packages
          </Link>
        </div>
      )}

      {/* Content */}
      {!loading && !error && cards.length > 0 && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Active Packages</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{activeCount}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Monthly Total</div>
              <div className="mt-1 text-2xl font-bold text-luma-700">{totalMonthly > 0 ? `KSh ${totalMonthly.toLocaleString('en-KE')}` : '—'}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Qualified</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600">{qualifiedCount}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Total Packages</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{cards.length}</div>
            </div>
          </div>

          {/* Package cards */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Your Packages</h2>
            <Link to="/join" className="text-sm font-medium text-luma-600 hover:text-luma-700 hover:underline">
              + Join a package
            </Link>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {cards.map((card) => {
              const sc = statusConfig(card)
              const pct = progressPercent(card)
              return (
                <div key={card.subscription_id} className="rounded-xl border border-gray-200 bg-white p-5 transition-all hover:shadow-md">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{packageName(card)}</h3>
                      {card.tier_name && (
                        <span className="text-xs text-gray-500">{card.tier_name}</span>
                      )}
                    </div>
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${sc.color} ${sc.bg}`}>
                      {sc.label}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Monthly</div>
                      <div className="mt-0.5 text-base font-bold text-gray-900">{money(card.monthly_amount)}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Progress</div>
                      <div className="mt-0.5 text-base font-bold text-gray-900">
                        {card.waiting_period_months == null
                          ? 'Ongoing'
                          : `${card.contributions.paid}/${card.waiting_period_months}`}
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {card.waiting_period_months != null && card.waiting_period_months > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                        <span>{pct}% complete</span>
                        {card.contributions.months_to_go != null && card.contributions.months_to_go > 0 && (
                          <span>{card.contributions.months_to_go} month{card.contributions.months_to_go === 1 ? '' : 's'} to go</span>
                        )}
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-100">
                        <div
                          className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-luma-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Welfare cover warning */}
                  {packageCode(card) === 'welfare' && (
                    <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${card.welfare_cover_at_risk ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {card.welfare_cover_at_risk
                        ? 'Burial and emergency cover is at risk — this month\'s contribution is not recorded yet.'
                        : 'Burial and emergency cover is current for this month.'}
                    </div>
                  )}

                  {/* Qualification info */}
                  {card.qualification.status === 'eligible' && card.qualification.eligible_from && (
                    <div className="mt-3 text-xs text-emerald-600">
                      ✓ Eligible from {card.qualification.eligible_from}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3">
                    <Link to="/contributions" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      Contributions
                    </Link>
                    <button disabled className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-400 cursor-not-allowed">
                      Claim
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Quick actions */}
          <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
            <div className="flex flex-wrap gap-2">
              <Link to="/join" className="inline-flex items-center gap-1.5 rounded-lg bg-luma-50 px-3 py-2 text-xs font-medium text-luma-700 hover:bg-luma-100 transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Browse Packages
              </Link>
              <Link to="/family" className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
                Manage Family
              </Link>
              <Link to="/profile" className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                Edit Profile
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
