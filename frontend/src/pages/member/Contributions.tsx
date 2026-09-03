import { useEffect, useState, useCallback } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { MobileCardTable } from '../../components/MobileCardTable'

type Subscription = { id: string; status: string; packages: { code: string; name: string }[]; package_tiers: { name: string; amount: number }[] }
type Contribution = { id: string; subscription_id: string; period: string; amount: number; status: string; packages: { code: string; name: string }[]; created_at: string; notes?: string | null }

type PaginatedResponse = {
  contributions: Contribution[]
  total: number
  page: number
  per_page: number
  pages: number
}

const statusStyle: Record<string, string> = {
  Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
  Late: 'bg-amber-50 text-amber-700 border-amber-200',
}

const PER_PAGE = 20

export function Contributions() {
  const { registrationFeePaid } = useAuth()
  const [rows, setRows] = useState<Contribution[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // Pagination state
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [paidCount, setPaidCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [pageLoading, setPageLoading] = useState(false)

  // Form state
  const [formSubId, setFormSubId] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formMethod, setFormMethod] = useState('m_pesa')
  const [formReference, setFormReference] = useState('')
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 7))
  const [formNotes, setFormNotes] = useState('')
  const [formError, setFormError] = useState('')

  const loadPage = useCallback(async (targetPage: number, isInitial = false) => {
    if (isInitial) setLoading(true)
    else setPageLoading(true)
    try {
      const [me, contribs] = await Promise.all([
        api<{ subscriptions: Subscription[] }>('/auth/me', { auth: true }),
        api<PaginatedResponse>(`/contributions?page=${targetPage}&per_page=${PER_PAGE}`, { auth: true }),
      ])
      setSubscriptions((me.subscriptions ?? []).filter((s: Subscription) => s.status === 'active'))
      setRows(contribs.contributions ?? [])
      setTotalPages(contribs.pages ?? 1)
      setTotalCount(contribs.total ?? 0)
      setPage(contribs.page ?? targetPage)

      // Fetch summary stats (total paid/pending) from first page with large limit for counts
      if (isInitial) {
        try {
          const [paidData, pendingData] = await Promise.all([
            api<PaginatedResponse>('/contributions?status=Paid&page=1&per_page=1', { auth: true }),
            api<PaginatedResponse>('/contributions?status=Pending&page=1&per_page=1', { auth: true }),
          ])
          setPaidCount(paidData.total ?? 0)
          setPendingCount(pendingData.total ?? 0)
        } catch {
          // Summary stats are non-critical — fall back to zero
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contributions.')
    } finally {
      setLoading(false)
      setPageLoading(false)
    }
  }, [])

  // eslint-disable-next-line oxc/react/set-state-in-effect — loading initialized true; setLoading(false) in finally after await
  useEffect(() => { loadPage(1, true) }, [loadPage])

  // Realtime: subscribe to contribution status changes (e.g. admin verifies payment)
  useEffect(() => {
    const channel = supabase
      .channel('member-contributions-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contributions' }, () => {
        loadPage(page)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contributions' }, () => {
        loadPage(1) // New contribution likely goes to page 1
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadPage, page])

  function goToPage(target: number) {
    if (target < 1 || target > totalPages || target === page || pageLoading) return
    loadPage(target)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setFormSubId('')
    setFormAmount('')
    setFormMethod('m_pesa')
    setFormReference('')
    setFormDate(new Date().toISOString().slice(0, 7))
    setFormNotes('')
    setFormError('')
    setSubmitSuccess(false)
    setShowForm(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (!formSubId) { setFormError('Please select a package.'); return }
    if (!formAmount || Number(formAmount) <= 0) { setFormError('Please enter a valid amount.'); return }
    if (!formDate) { setFormError('Please select a payment period.'); return }

    setSubmitting(true)
    try {
      await api('/contributions', {
        method: 'POST',
        auth: true,
        body: {
          subscriptionId: formSubId,
          period: formDate,
          amount: Number(formAmount),
        },
      })
      setSubmitSuccess(true)
      // Refresh to page 1 to show the new contribution
      await loadPage(1)
      setPaidCount((c) => c) // Will be refreshed on next initial load
    } catch (err: any) {
      setFormError(err.message || 'Failed to record payment.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubChange(subId: string) {
    setFormSubId(subId)
    setFormError('')
    const sub = subscriptions.find(s => s.id === subId)
    if (sub?.package_tiers?.[0]?.amount) {
      setFormAmount(String(sub.package_tiers[0].amount))
    }
  }

  if (!registrationFeePaid) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Registration Fee Required</h1>
          <p className="mt-2 text-sm text-gray-600">Please pay the one-time KSh 300 registration fee before recording contributions.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contributions</h1>
          <p className="mt-1 text-sm text-gray-500">Track your contribution history and record payments.</p>
        </div>
        {!showForm && subscriptions.length > 0 && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-luma-800 transition-colors min-h-[44px]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Record Payment
          </button>
        )}
      </div>

      {/* Summary stats */}
      {!loading && totalCount > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-center">
            <div className="text-lg font-bold text-gray-900">{totalCount.toLocaleString('en-KE')}</div>
            <div className="text-[10px] font-medium uppercase text-gray-400">Total</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center">
            <div className="text-lg font-bold text-emerald-700">{paidCount.toLocaleString('en-KE')}</div>
            <div className="text-[10px] font-medium uppercase text-emerald-600">Paid</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-center">
            <div className="text-lg font-bold text-amber-700">{pendingCount.toLocaleString('en-KE')}</div>
            <div className="text-[10px] font-medium uppercase text-amber-600">Pending</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="mt-8 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2" role="alert">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          <span className="flex-1">{error}</span>
          <button onClick={() => { setError(null); loadPage(1, true) }} className="font-medium underline flex-shrink-0">Retry</button>
        </div>
      )}

      {/* Record Payment Form */}
      {showForm && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
            <button onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700 min-h-[44px] px-2">Cancel</button>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Record a manual payment for admin verification. Your payment will be marked as <strong>Pending</strong> until an administrator reviews and approves it.
          </p>

          {submitSuccess ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-6 text-center">
              <svg className="h-10 w-10 mx-auto text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-semibold text-emerald-800">Payment Recorded</h3>
              <p className="mt-1 text-xs text-emerald-600">Your payment has been submitted for admin verification.</p>
              <button onClick={resetForm} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 transition-colors min-h-[44px]">
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contrib-pkg" className="block text-sm font-medium text-gray-700 mb-1">Package *</label>
                  <select
                    id="contrib-pkg"
                    value={formSubId}
                    onChange={(e) => handleSubChange(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                  >
                    <option value="">Select package</option>
                    {subscriptions.map(s => (
                      <option key={s.id} value={s.id}>{s.packages?.[0]?.name ?? 'Package'}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="contrib-amt" className="block text-sm font-medium text-gray-700 mb-1">Amount (KSh) *</label>
                  <input
                    id="contrib-amt"
                    type="number"
                    min="1"
                    value={formAmount}
                    onChange={(e) => { setFormAmount(e.target.value); setFormError('') }}
                    placeholder="e.g. 1200"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="contrib-date" className="block text-sm font-medium text-gray-700 mb-1">Period (YYYY-MM) *</label>
                  <input
                    id="contrib-date"
                    type="month"
                    value={formDate}
                    onChange={(e) => { setFormDate(e.target.value); setFormError('') }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="contrib-method" className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select
                    id="contrib-method"
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                  >
                    <option value="m_pesa">M-Pesa</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="contrib-ref" className="block text-sm font-medium text-gray-700 mb-1">Transaction Reference</label>
                  <input
                    id="contrib-ref"
                    type="text"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    placeholder="e.g. QJK1234ABCD"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="contrib-notes" className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <input
                    id="contrib-notes"
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Any additional details"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500 min-h-[44px]"
                  />
                </div>
              </div>

              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" role="alert">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-luma-800 disabled:opacity-50 transition-colors min-h-[44px]"
                >
                  {submitting ? 'Submitting…' : 'Submit Payment'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">No contributions yet</h2>
          <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
            Your contribution history will appear here once you start contributing. You can record a payment manually or pay via M-Pesa.
          </p>
          {subscriptions.length > 0 && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-all min-h-[44px]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Record First Payment
            </button>
          )}
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="mt-6">
          {/* Page loading overlay */}
          {pageLoading && (
            <div className="relative">
              <div className="absolute inset-0 bg-white/60 z-10 rounded-xl flex items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Loading…
                </div>
              </div>
            </div>
          )}

          {/* Mobile: Card layout */}
          <div className="sm:hidden space-y-3">
            {rows.map((c) => (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{c.packages?.[0]?.name ?? '—'}</span>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle[c.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                      <span>Period: {c.period}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(c.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-gray-900">KSh {c.amount.toLocaleString('en-KE')}</div>
                  </div>
                </div>
                {c.notes && (
                  <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    {c.notes}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden sm:block">
            <MobileCardTable
              data={rows}
              keyFn={c => c.id}
              emptyMessage="No contributions yet."
              columns={[
                {
                  key: 'package',
                  header: 'Package',
                  render: (c) => <span className="font-medium text-gray-900">{c.packages?.[0]?.name ?? '—'}</span>,
                },
                {
                  key: 'period',
                  header: 'Period',
                  render: (c) => <span className="text-gray-600">{c.period}</span>,
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  render: (c) => <span className="font-medium text-gray-900">KSh {c.amount.toLocaleString('en-KE')}</span>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (c) => (
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusStyle[c.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {c.status}
                    </span>
                  ),
                },
                {
                  key: 'date',
                  header: 'Date',
                  render: (c) => <span className="text-gray-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</span>,
                },
              ]}
            />
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-xs text-gray-500">
                Page {page} of {totalPages} · {totalCount.toLocaleString('en-KE')} contributions
              </div>
              <div className="flex items-center gap-1">
                {/* Previous */}
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1 || pageLoading}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                  aria-label="Previous page"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                </button>

                {/* Page numbers */}
                {generatePageNumbers(page, totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToPage(Number(p))}
                      disabled={pageLoading}
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center ${
                        p === page
                          ? 'bg-luma-700 text-white'
                          : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                      aria-label={`Page ${p}`}
                      aria-current={p === page ? 'page' : undefined}
                    >
                      {p}
                    </button>
                  )
                )}

                {/* Next */}
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages || pageLoading}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                  aria-label="Next page"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Generate page number array with ellipsis for large page counts */
function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | string)[] = []
  pages.push(1)

  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('...')

  pages.push(total)
  return pages
}
