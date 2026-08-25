import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { MobileCardTable } from '../../components/MobileCardTable'

type Subscription = { id: string; status: string; packages: { code: string; name: string }[]; package_tiers: { name: string; amount: number }[] }
type Contribution = { id: string; subscription_id: string; period: string; amount: number; status: string; packages: { code: string; name: string }[]; created_at: string; notes?: string | null }

const statusStyle: Record<string, string> = {
  Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
  Late: 'bg-amber-50 text-amber-700 border-amber-200',
}

export function Contributions() {
  const { registrationFeePaid } = useAuth()
  const [rows, setRows] = useState<Contribution[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // Form state
  const [formSubId, setFormSubId] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formMethod, setFormMethod] = useState('m_pesa')
  const [formReference, setFormReference] = useState('')
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [formNotes, setFormNotes] = useState('')
  const [formError, setFormError] = useState('')

  async function load() {
    try {
      const [me, contribs] = await Promise.all([
        api<{ subscriptions: Subscription[] }>('/auth/me', { auth: true }),
        api<{ contributions: Contribution[] }>('/contributions', { auth: true }),
      ])
      setSubscriptions((me.subscriptions ?? []).filter((s: Subscription) => s.status === 'active'))
      setRows(contribs.contributions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contributions.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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
      // Reload contributions
      const contribs = await api<{ contributions: Contribution[] }>('/contributions', { auth: true })
      setRows(contribs.contributions ?? [])
    } catch (err: any) {
      setFormError(err.message || 'Failed to record payment.')
    } finally {
      setSubmitting(false)
    }
  }

  // Auto-fill amount when subscription changes
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
            className="inline-flex items-center gap-2 rounded-lg bg-luma-700 px-4 py-2 text-sm font-medium text-white hover:bg-luma-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Record Payment
          </button>
        )}
      </div>

      {loading && (
        <div className="mt-8 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button onClick={() => { setError(null); setLoading(true); load() }} className="ml-3 font-medium underline">Retry</button>
        </div>
      )}

      {/* Record Payment Form */}
      {showForm && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
            <button onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
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
              <button onClick={resetForm} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 transition-colors">
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Package *</label>
                  <select
                    value={formSubId}
                    onChange={(e) => handleSubChange(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                  >
                    <option value="">Select package</option>
                    {subscriptions.map(s => (
                      <option key={s.id} value={s.id}>{s.packages?.[0]?.name ?? 'Package'}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KSh) *</label>
                  <input
                    type="number"
                    min="1"
                    value={formAmount}
                    onChange={(e) => { setFormAmount(e.target.value); setFormError('') }}
                    placeholder="e.g. 1200"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Period (YYYY-MM) *</label>
                  <input
                    type="month"
                    value={formDate}
                    onChange={(e) => { setFormDate(e.target.value); setFormError('') }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                  >
                    <option value="m_pesa">M-Pesa</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Reference</label>
                  <input
                    type="text"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    placeholder="e.g. QJK1234ABCD"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Any additional details"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                  />
                </div>
              </div>

              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-luma-800 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Submitting…' : 'Submit Payment'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
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
          <p className="mt-2 text-sm text-gray-500">Your contribution history will appear here once you start contributing.</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="mt-6">
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
                mobileLabel: 'Period',
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
                hideOnMobile: true,
              },
            ]}
          />
        </div>
      )}
    </div>
  )
}
