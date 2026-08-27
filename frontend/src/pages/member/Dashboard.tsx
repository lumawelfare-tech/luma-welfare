import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useHead } from '../../lib/seo'
import { supabase } from '../../lib/supabase'

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

type Notification = {
  id: string
  subject: string | null
  body: string
  status: string
  created_at: string
}

const claimTypes = [
  'Burial Support',
  'Hospital Insurance',
  'Education Support',
  'Business Support',
  'Building Support',
  'Land Purchase Support',
  'Farming Support',
  'Wedding Support',
  'Dowry/Ruracio Support',
  'Disaster Relief',
  'Youth Empowerment',
  'Senior Citizen Support',
  'Other',
]

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

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const now = new Date()
  const due = new Date(dateStr)
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
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
  const [notifications, setNotifications] = useState<Notification[]>([])

  // Activation payment flow
  const [showPayModal, setShowPayModal] = useState(false)
  const [payPhone, setPayPhone] = useState(member?.phone ?? '')
  const [payStep, setPayStep] = useState<'phone' | 'waiting' | 'success' | 'failed'>('phone')
  const [payError, setPayError] = useState('')

  // Quick-claim modal
  const [quickClaimOpen, setQuickClaimOpen] = useState(false)
  const [claimSubId, setClaimSubId] = useState('')
  const [claimType, setClaimType] = useState('')
  const [claimDesc, setClaimDesc] = useState('')
  const [claimAmount, setClaimAmount] = useState('')
  const [claimError, setClaimError] = useState('')
  const [claimSubmitting, setClaimSubmitting] = useState(false)
  const [claimSuccess, setClaimSuccess] = useState(false)
  const claimModalRef = useRef<HTMLDivElement>(null)

  const loadDashboard = useCallback(async () => {
    try {
      const [dashboard, notifData] = await Promise.all([
        api<{ cards: Card[]; registration_fee_paid: boolean }>('/member/dashboard', { auth: true }),
        api<{ notifications: Notification[] }>('/member/notifications', { auth: true }).catch(() => ({ notifications: [] })),
      ])
      setCards(dashboard.cards ?? [])
      setRegistrationFeePaid(dashboard.registration_fee_paid ?? false)
      setNotifications((notifData.notifications ?? []).slice(0, 3))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard.')
    } finally {
      setLoading(false)
      setRegistrationFeeLoading(false)
    }
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  // Realtime: subscribe to payment and contribution updates affecting dashboard
  useEffect(() => {
    const channel = supabase
      .channel('member-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contributions' }, () => {
        loadDashboard()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        loadDashboard()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claims' }, () => {
        loadDashboard()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadDashboard])

  async function handleSendStkPush() {
    setPayError('')
    setPayingFee(true)
    try {
      const d = await api<{ status: string; checkout_request_id?: string; payments_enabled?: boolean; message?: string }>(
        '/member/registration-fee',
        { method: 'POST', auth: true, body: { phone: payPhone } },
      )
      if (d.status === 'paid') {
        setRegistrationFeePaid(true)
        setPayStep('success')
        return
      }
      if (d.payments_enabled === false) {
        setNotice(d.message ?? 'Payment recorded. M-Pesa is not yet enabled — an admin will verify your payment.')
        setShowPayModal(false)
        return
      }
      setPayStep('waiting')
      startPolling()
    } catch (e: any) {
      setPayError(e.message || 'Could not initiate payment. Please try again.')
    } finally {
      setPayingFee(false)
    }
  }

  function startPolling() {
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      if (attempts > 60) {
        clearInterval(interval)
        setPayStep('failed')
        setPayError('Payment timed out. Please try again.')
        return
      }
      try {
        const d = await api<{ status: string }>('/member/registration-fee?action=check-status', { auth: true })
        if (d.status === 'paid') {
          clearInterval(interval)
          setRegistrationFeePaid(true)
          setPayStep('success')
        } else if (d.status === 'failed') {
          clearInterval(interval)
          setPayStep('failed')
          setPayError('Payment was not completed. Please try again.')
        }
      } catch {
        // Continue polling
      }
    }, 5000)
  }

  function openPayModal() {
    setShowPayModal(true)
    setPayStep('phone')
    setPayError('')
    setPayPhone(member?.phone ?? '')
  }

  async function submitQuickClaim(e: React.FormEvent) {
    e.preventDefault()
    setClaimError('')
    if (!claimSubId) { setClaimError('Select a package.'); return }
    if (!claimType) { setClaimError('Select a claim type.'); return }
    if (!claimDesc.trim()) { setClaimError('Describe your claim.'); return }

    setClaimSubmitting(true)
    try {
      await api('/member/claims', {
        method: 'POST',
        auth: true,
        body: {
          subscriptionId: claimSubId,
          claimType,
          description: claimDesc.trim(),
          amountRequested: claimAmount ? Number(claimAmount) : undefined,
          submit: true,
        },
      })
      setClaimSuccess(true)
    } catch (e) {
      setClaimError(e instanceof ApiError ? e.message : 'Could not submit claim.')
    } finally {
      setClaimSubmitting(false)
    }
  }

  function closeQuickClaim() {
    setQuickClaimOpen(false)
    setClaimSubId('')
    setClaimType('')
    setClaimDesc('')
    setClaimAmount('')
    setClaimError('')
    setClaimSuccess(false)
  }

  function openQuickClaim() {
    setClaimSuccess(false)
    setClaimError('')
    setQuickClaimOpen(true)
  }

  // Focus management for quick claim modal
  useEffect(() => {
    if (quickClaimOpen && claimModalRef.current) {
      const firstInput = claimModalRef.current.querySelector('select, input, textarea') as HTMLElement
      if (firstInput) firstInput.focus()
    }
  }, [quickClaimOpen])

  const memberName = member?.full_name?.split(' ')[0] ?? 'there'
  const activeCount = cards.filter((c) => c.status === 'active').length
  const totalMonthly = cards.reduce((sum, c) => sum + (c.monthly_amount ?? 0), 0)
  const qualifiedCount = cards.filter((c) => c.qualification.status === 'eligible').length
  const activeCards = cards.filter(c => c.status === 'active')

  // Find the next upcoming due date
  const upcomingDue = cards
    .filter(c => c.next_due_date)
    .sort((a, b) => new Date(a.next_due_date!).getTime() - new Date(b.next_due_date!).getTime())[0]
  const dueDays = upcomingDue ? daysUntil(upcomingDue.next_due_date) : null

  const unreadCount = notifications.filter(n => n.status === 'queued').length

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
          <h2 className="mt-4 text-xl font-bold text-gray-900">Activate Your Luma Welfare Membership</h2>
          <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
            Pay the one-time KSh 300 activation fee to activate your membership and access available welfare packages.
          </p>
          {notice ? (
            <div className="mt-6 rounded-lg bg-amber-50 border border-amber-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-amber-800">{notice}</span>
              </div>
            </div>
          ) : (
            <button
              onClick={openPayModal}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-luma-700 px-6 py-3 text-sm font-semibold text-white hover:bg-luma-800 active:bg-luma-900 transition-all min-h-[44px]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
              Pay KSh 300
            </button>
          )}
          <p className="mt-3 text-xs text-gray-500">
            This is a one-time fee. You will not be charged again.
          </p>
        </div>

        {/* Payment Modal */}
        {showPayModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Payment">
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
              {payStep === 'phone' && (
                <>
                  <div className="px-6 py-5 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Pay KSh 300</h3>
                      <button onClick={() => setShowPayModal(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">Enter the M-Pesa phone number you want to use for payment.</p>
                  </div>
                  <div className="px-6 py-4 space-y-4">
                    <div>
                      <label htmlFor="pay-phone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                      <input
                        id="pay-phone"
                        type="tel"
                        value={payPhone}
                        onChange={(e) => { setPayPhone(e.target.value); setPayError('') }}
                        placeholder="07XXXXXXXX or 2547XXXXXXXX"
                        className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                        autoComplete="tel"
                      />
                    </div>
                    {payError && (
                      <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700" role="alert">{payError}</div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end border-t border-gray-200 px-6 py-4">
                    <button onClick={() => setShowPayModal(false)} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]">Cancel</button>
                    <button
                      onClick={handleSendStkPush}
                      disabled={payingFee || !payPhone.trim()}
                      className="rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50 transition-colors min-h-[44px]"
                    >
                      {payingFee ? 'Sending…' : 'Send STK Push'}
                    </button>
                  </div>
                </>
              )}

              {payStep === 'waiting' && (
                <div className="px-6 py-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                    <svg className="h-6 w-6 text-amber-600 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-gray-900">Check Your Phone</h3>
                  <p className="mt-1 text-sm text-gray-500">An M-Pesa payment request has been sent to your phone. Enter your M-Pesa PIN to complete the KSh 300 activation payment.</p>
                  <p className="mt-3 text-xs text-gray-400">Waiting for payment confirmation…</p>
                  {payError && (
                    <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700" role="alert">{payError}</div>
                  )}
                  <button onClick={() => { setPayStep('phone'); setPayError('') }} className="mt-4 text-xs font-medium text-gray-500 hover:text-gray-700 min-h-[44px]">
                    Use a different number
                  </button>
                </div>
              )}

              {payStep === 'success' && (
                <div className="px-6 py-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                    <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-gray-900">Membership Activated!</h3>
                  <p className="mt-1 text-sm text-gray-500">Your KSh 300 activation payment was successful. Your Luma Welfare membership is now active.</p>
                  <button onClick={() => setShowPayModal(false)} className="mt-5 rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-colors min-h-[44px]">
                    Explore Packages
                  </button>
                </div>
              )}

              {payStep === 'failed' && (
                <div className="px-6 py-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                    <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-gray-900">Payment Not Completed</h3>
                  <p className="mt-1 text-sm text-gray-500">{payError || 'The payment was not completed.'}</p>
                  <div className="mt-5 flex gap-2 justify-center">
                    <button onClick={() => { setPayStep('phone'); setPayError('') }} className="rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-colors min-h-[44px]">
                      Try Again
                    </button>
                    <button onClick={() => setShowPayModal(false)} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      {/* Welcome */}
      <div className="mb-6">
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
          <button onClick={() => { setError(null); setLoading(true); setRegistrationFeeLoading(true); loadDashboard() }} className="mt-3 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors min-h-[44px]">
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
          <Link to="/join" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-all min-h-[44px]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Explore Packages
          </Link>
        </div>
      )}

      {/* Content */}
      {!loading && !error && cards.length > 0 && (
        <>
          {/* Next Due Reminder — prominent banner if payment is due soon */}
          {dueDays !== null && dueDays <= 7 && upcomingDue && (
            <div className={`mb-6 rounded-xl border p-4 ${
              dueDays <= 0
                ? 'border-red-200 bg-red-50'
                : dueDays <= 3
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-luma-200 bg-luma-50'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 ${
                  dueDays <= 0 ? 'bg-red-100 text-red-600' : dueDays <= 3 ? 'bg-amber-100 text-amber-600' : 'bg-luma-100 text-luma-600'
                }`}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${
                    dueDays <= 0 ? 'text-red-800' : dueDays <= 3 ? 'text-amber-800' : 'text-luma-800'
                  }`}>
                    {dueDays <= 0
                      ? `${packageName(upcomingDue)} contribution is overdue`
                      : dueDays === 1
                        ? `${packageName(upcomingDue)} contribution is due tomorrow`
                        : `${packageName(upcomingDue)} contribution is due in ${dueDays} days`
                    }
                  </p>
                  <p className={`text-xs mt-0.5 ${dueDays <= 0 ? 'text-red-600' : dueDays <= 3 ? 'text-amber-600' : 'text-luma-600'}`}>
                    Due date: {new Date(upcomingDue.next_due_date!).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {upcomingDue.monthly_amount ? ` · KSh ${upcomingDue.monthly_amount.toLocaleString('en-KE')}` : ''}
                  </p>
                </div>
                <Link to="/contributions" className="flex-shrink-0 rounded-lg bg-white border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px] flex items-center">
                  Pay Now
                </Link>
              </div>
            </div>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-luma-50 text-luma-600 flex-shrink-0">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Active Packages</div>
                  <div className="text-2xl font-bold text-gray-900">{activeCount}</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 flex-shrink-0">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Monthly Total</div>
                  <div className="text-2xl font-bold text-luma-700">{totalMonthly > 0 ? `KSh ${totalMonthly.toLocaleString('en-KE')}` : '—'}</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 flex-shrink-0">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Qualified</div>
                  <div className="text-2xl font-bold text-emerald-600">{qualifiedCount}</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 text-gray-500 flex-shrink-0">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Total Packages</div>
                  <div className="text-2xl font-bold text-gray-900">{cards.length}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Two-column layout: Packages + Recent Activity */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Package cards — 2 columns */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Your Packages</h2>
                <Link to="/join" className="text-sm font-medium text-luma-600 hover:text-luma-700 hover:underline">
                  + Join a package
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
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
                          <div className="h-2 w-full rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% complete`}>
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
                            ? "Burial and emergency cover is at risk — this month's contribution is not recorded yet."
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
                        <Link to="/contributions" className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-center text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px] flex items-center justify-center">
                          Contributions
                        </Link>
                        <Link to="/claims" className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-center text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px] flex items-center justify-center">
                          Claim
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sidebar — Quick Actions + Recent Notifications */}
            <div className="space-y-5">
              {/* Quick Actions */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  {qualifiedCount > 0 && (
                    <button
                      onClick={openQuickClaim}
                      className="w-full inline-flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200 min-h-[44px]"
                    >
                      <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                      File a Claim
                    </button>
                  )}
                  <Link to="/join" className="w-full inline-flex items-center gap-2.5 rounded-lg bg-luma-50 px-3 py-2.5 text-xs font-medium text-luma-700 hover:bg-luma-100 transition-colors min-h-[44px]">
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Browse Packages
                  </Link>
                  <Link to="/contributions" className="w-full inline-flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors min-h-[44px]">
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                    Record Payment
                  </Link>
                  <Link to="/receipts-statements" className="w-full inline-flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors min-h-[44px]">
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    View Receipts
                  </Link>
                  <Link to="/family" className="w-full inline-flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors min-h-[44px]">
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
                    Manage Family
                  </Link>
                  <Link to="/profile" className="w-full inline-flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors min-h-[44px]">
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                    Edit Profile
                  </Link>
                </div>
              </div>

              {/* Recent Notifications */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-luma-100 px-2 py-0.5 text-[10px] font-bold text-luma-700">{unreadCount} unread</span>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No notifications yet.</p>
                ) : (
                  <div className="space-y-2">
                    {notifications.map((n) => (
                      <div key={n.id} className={`rounded-lg px-3 py-2.5 text-xs ${n.status === 'queued' ? 'bg-luma-50/50' : 'bg-gray-50'}`}>
                        <div className="flex items-start gap-2">
                          {n.status === 'queued' && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-luma-500 flex-shrink-0" />}
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{n.subject ?? 'Notification'}</div>
                            <div className="mt-0.5 text-gray-500 line-clamp-2">{n.body}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <Link to="/notifications" className="block text-center text-xs font-medium text-luma-600 hover:text-luma-700 pt-1">
                      View all →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Quick Claim Modal */}
      {quickClaimOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeQuickClaim} role="dialog" aria-modal="true" aria-label="File a claim" onKeyDown={(e) => { if (e.key === 'Escape') closeQuickClaim() }}>
          <div ref={claimModalRef} className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} tabIndex={-1}>
            {claimSuccess ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">Claim Submitted</h3>
                <p className="mt-1 text-sm text-gray-500">Your claim has been submitted for review. You can track it on the Claims page.</p>
                <div className="mt-5 flex gap-2 justify-center">
                  <Link to="/claims" onClick={closeQuickClaim} className="rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-luma-800 transition-colors min-h-[44px] flex items-center">
                    View Claims
                  </Link>
                  <button onClick={closeQuickClaim} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]">
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="px-6 py-5 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">File a Claim</h3>
                    <button onClick={closeQuickClaim} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">Submit a welfare claim for admin review.</p>
                </div>
                <form onSubmit={submitQuickClaim} className="px-6 py-4 space-y-3">
                  <div>
                    <label htmlFor="qc-package" className="block text-sm font-medium text-gray-700 mb-1">Package *</label>
                    <select
                      id="qc-package"
                      value={claimSubId}
                      onChange={(e) => { setClaimSubId(e.target.value); setClaimError('') }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                      aria-required="true"
                    >
                      <option value="">Select package</option>
                      {activeCards.map(c => (
                        <option key={c.subscription_id} value={c.subscription_id}>{c.package?.name ?? 'Package'}{c.qualification.status === 'eligible' ? ' ✓' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="qc-type" className="block text-sm font-medium text-gray-700 mb-1">Claim Type *</label>
                    <select
                      id="qc-type"
                      value={claimType}
                      onChange={(e) => { setClaimType(e.target.value); setClaimError('') }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                      aria-required="true"
                    >
                      <option value="">Select type</option>
                      {claimTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="qc-amount" className="block text-sm font-medium text-gray-700 mb-1">Amount Requested (KSh, optional)</label>
                    <input
                      id="qc-amount"
                      type="number"
                      min="0"
                      value={claimAmount}
                      onChange={(e) => setClaimAmount(e.target.value)}
                      placeholder="e.g. 50000"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="qc-desc" className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                    <textarea
                      id="qc-desc"
                      value={claimDesc}
                      onChange={(e) => { setClaimDesc(e.target.value); setClaimError('') }}
                      rows={3}
                      placeholder="Describe your claim…"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 resize-none"
                      aria-required="true"
                    />
                  </div>
                  {claimError && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700" role="alert">{claimError}</div>
                  )}
                  <div className="flex gap-2 pt-1 pb-1">
                    <button
                      type="submit"
                      disabled={claimSubmitting}
                      className="flex-1 rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50 transition-colors min-h-[44px]"
                    >
                      {claimSubmitting ? 'Submitting…' : 'Submit Claim'}
                    </button>
                    <button
                      type="button"
                      onClick={closeQuickClaim}
                      className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
