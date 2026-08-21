import { useEffect, useState, useRef, useCallback } from 'react'
import { api, ApiError } from '../../lib/api'

type Subscription = {
  id: string
  status: string
  package_id: string
  packages: { code: string; name: string }[]
  package_tiers: { name: string; amount: number }[]
}

type Contribution = {
  id: string
  subscription_id: string
  period: string
  amount: number
  status: string
  notes: string | null
  created_at: string
  packages: { code: string; name: string }[]
}

type Payment = {
  id: string
  amount: number
  status: string
  mpesa_receipt: string | null
  checkout_request_id: string | null
  created_at: string
}

type MemberProfile = {
  phone?: string
  alt_phone?: string
}

const statusStyle: Record<string, string> = {
  Paid: 'bg-luma-100 text-luma-800',
  Verified: 'bg-luma-100 text-luma-800',
  Pending: 'bg-gold-400/20 text-gold-600',
  Failed: 'bg-red-50 text-red-700',
  Reversed: 'bg-red-50 text-red-700',
  Late: 'bg-gold-400/20 text-gold-600',
}

const paymentStatusStyle: Record<string, string> = {
  Pending: 'bg-gold-400/20 text-gold-600',
  Completed: 'bg-luma-100 text-luma-800',
  Failed: 'bg-red-50 text-red-700',
  Reversed: 'bg-red-50 text-red-700',
}

/** Generate a UUID v4 for idempotency. */
function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}

export function Contributions() {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [rows, setRows] = useState<Contribution[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subscriptionId, setSubscriptionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null)
  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null)

  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey())
  const [activeIdempotencyKey, setActiveIdempotencyKey] = useState(idempotencyKeyRef.current)

  async function load() {
    try {
      const [me, contribs, pays] = await Promise.all([
        api<{ subscriptions: Subscription[]; member?: MemberProfile }>('/auth/me', { auth: true }),
        api<{ contributions: Contribution[] }>('/contributions', { auth: true }),
        api<{ payments: Payment[] }>('/payments', { auth: true }).catch(() => ({ payments: [] })),
      ])
      const active = (me.subscriptions ?? []).filter((s) => s.status === 'active')
      setSubs(active)
      if (active.length > 0) setSubscriptionId((id) => id || active[0].id)
      setRows(contribs.contributions ?? [])
      setPayments(pays.payments ?? [])
      if (me.member) {
        setMemberProfile(me.member)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function startNewPayment() {
    const key = generateIdempotencyKey()
    idempotencyKeyRef.current = key
    setActiveIdempotencyKey(key)
    setPaymentMessage(null)
    setError(null)
  }

  /**
   * Initiate M-Pesa payment.
   * Does NOT send phone — backend uses member profile phone.
   * Does NOT send amount — backend determines from subscription.
   */
  const handlePay = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPaymentMessage(null)
    setSaving(true)

    try {
      const result = await api<{
        message: string
        paymentId: string
        checkoutRequestId?: string
        status?: string
      }>('/payments/initiate', {
        method: 'POST',
        auth: true,
        body: {
          subscriptionId,
          idempotencyKey: activeIdempotencyKey,
          // phone and amount intentionally omitted — backend uses profile and DB
        },
      })

      setPaymentMessage(result.message)

      if (result.status === 'processing' || result.status === 'pending') {
        setPaymentMessage(`Payment already in progress. Status: ${result.status}`)
      }

      const pays = await api<{ payments: Payment[] }>('/payments', { auth: true }).catch(() => ({ payments: [] }))
      setPayments(pays.payments ?? [])
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'PAYMENTS_DISABLED') {
          setPaymentMessage('M-Pesa payments are not yet enabled. This feature will be available in a future phase.')
        } else if (err.message.includes('already')) {
          setPaymentMessage('Payment already initiated. Check your phone.')
        } else {
          setError(err.message)
        }
      } else {
        setError('Could not initiate payment. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }, [subscriptionId, activeIdempotencyKey])

  function handleNewPayment() {
    startNewPayment()
  }

  const selectedSub = subs.find((s) => s.id === subscriptionId)

  return (
    <div className="container-luma py-10">
      <h1 className="text-2xl font-bold text-luma-900">Contributions</h1>
      <p className="mt-1 text-sm text-stone-600">
        Pay via M-Pesa to contribute to your active packages. Payments are processed automatically.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Payment form */}
        <form onSubmit={handlePay} className="rounded-2xl border border-stone-200 bg-white p-6 lg:col-span-1">
          <h2 className="font-semibold text-luma-900">Pay via M-Pesa</h2>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Package</label>
              <select
                value={subscriptionId}
                onChange={(e) => { setSubscriptionId(e.target.value); startNewPayment() }}
                className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500"
              >
                <option value="" disabled>
                  {subs.length ? 'Select a package' : 'No active packages'}
                </option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.packages?.[0]?.name} — {s.package_tiers?.[0]?.name ?? ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedSub?.package_tiers?.[0]?.amount && (
              <p className="text-sm text-stone-600">
                Amount: <strong>KSh {selectedSub.package_tiers[0].amount}</strong> will be charged via M-Pesa.
              </p>
            )}

            {memberProfile?.phone && (
              <p className="text-xs text-stone-500">
                M-Pesa will prompt on <strong>{memberProfile.phone}</strong>.
              </p>
            )}

            {!memberProfile?.phone && (
              <p className="rounded-md bg-gold-400/20 px-3 py-2 text-xs text-gold-600">
                No phone number on file. Update your profile before making a payment.
              </p>
            )}

            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {paymentMessage && <p className="rounded-md bg-luma-50 px-3 py-2 text-sm text-luma-700">{paymentMessage}</p>}

            <button
              disabled={saving || subs.length === 0}
              className="w-full rounded-md bg-luma-600 py-2.5 text-sm font-semibold text-white hover:bg-luma-700 disabled:opacity-50"
              type="submit"
            >
              {saving ? 'Sending STK Push...' : 'Pay now'}
            </button>

            <button
              type="button"
              onClick={handleNewPayment}
              className="w-full rounded-md border border-stone-300 py-2 text-sm text-stone-600 hover:bg-stone-50"
            >
              Start new payment
            </button>

            <p className="text-xs leading-relaxed text-stone-500">
              You will receive an M-Pesa prompt on your registered phone number.
              Complete the payment to record your contribution automatically.
            </p>
          </div>
        </form>

        {/* Contributions + Payments tables */}
        <div className="lg:col-span-2">
          {loading && <div className="py-16 text-center text-stone-500">Loading...</div>}

          {/* Recent payments */}
          {!loading && payments.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 font-semibold text-luma-900">Recent Payments</h3>
              <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.slice(0, 5).map((p) => (
                      <tr key={p.id} className="border-b border-stone-100 last:border-0">
                        <td className="px-4 py-3 text-stone-600">
                          {new Date(p.created_at).toLocaleDateString('en-KE')}
                        </td>
                        <td className="px-4 py-3 text-stone-800">KSh {p.amount.toLocaleString('en-KE')}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paymentStatusStyle[p.status] ?? 'bg-stone-100 text-stone-600'}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-stone-500">
                          {p.mpesa_receipt ?? '---'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Contributions */}
          {!loading && rows.length === 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-stone-500">
              No contributions yet. Record this month's contribution on the left.
            </div>
          )}

          {rows.length > 0 && (
            <div>
              <h3 className="mb-3 font-semibold text-luma-900">Contributions</h3>
              <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Package</th>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} className="border-b border-stone-100 last:border-0">
                        <td className="px-4 py-3 font-medium text-luma-900">{c.packages?.[0]?.name}</td>
                        <td className="px-4 py-3 text-stone-600">{c.period}</td>
                        <td className="px-4 py-3 text-stone-800">KSh {c.amount.toLocaleString('en-KE')}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[c.status] ?? 'bg-stone-100 text-stone-600'}`}>
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
