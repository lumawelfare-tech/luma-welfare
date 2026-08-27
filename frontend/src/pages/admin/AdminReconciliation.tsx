import { useEffect, useState, useCallback } from 'react'
import { api } from '../../lib/api'
import { useHead } from '../../lib/seo'

type ReconciliationSummary = {
  total_payments: number
  completed_payments: number
  pending_payments: number
  failed_payments: number
  total_contributions: number
  paid_contributions: number
  pending_contributions: number
  payments_without_contributions: number
  contributions_without_payments: number
  open_exceptions: number
  total_amount_received: number
  total_amount_contributed: number
}

type Exception = {
  id: string
  exception_type: string
  severity: string
  status: string
  description: string
  reference_id: string | null
  reference_type: string | null
  expected_value: number | null
  actual_value: number | null
  resolution_notes: string | null
  created_at: string
  resolved_at: string | null
  members?: { full_name: string; membership_number: string } | null
}

type Payment = {
  id: string
  amount: number
  status: string
  mpesa_receipt: string | null
  checkout_request_id: string | null
  phone: string | null
  channel: string | null
  created_at: string
  member_id?: string
  subscription_id?: string
  package_id?: string
  failure_reason?: string
  members?: { full_name: string; membership_number: string; phone: string } | null
}

type Contribution = {
  id: string
  period: string
  amount: number
  status: string
  payment_id: string | null
  created_at: string
  member_id: string
  package_id: string
  members?: { full_name: string; membership_number: string } | null
  packages?: { name: string } | null
}

type Tab = 'overview' | 'orphan' | 'unmatched' | 'stale' | 'exceptions' | 'search'

function formatKes(amount: number) {
  return 'KSh ' + amount.toLocaleString()
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-amber-100 text-amber-700',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${colors[severity] ?? colors.low}`}>
      {severity}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Completed: 'bg-emerald-100 text-emerald-700',
    Verified: 'bg-emerald-100 text-emerald-700',
    Paid: 'bg-emerald-100 text-emerald-700',
    Pending: 'bg-amber-100 text-amber-700',
    Failed: 'bg-red-100 text-red-700',
    Reversed: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================

function OverviewTab({ summary }: { summary: ReconciliationSummary }) {
  const matchRate = summary.total_payments > 0
    ? Math.round((summary.paid_contributions / summary.total_payments) * 100)
    : 100

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="text-2xl font-extrabold text-gray-900">{summary.total_payments}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Total Payments</div>
          <div className="mt-1 text-xs text-gray-400">{formatKes(summary.total_amount_received)}</div>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
          <div className="text-2xl font-extrabold text-emerald-700">{summary.completed_payments}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">Completed</div>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
          <div className="text-2xl font-extrabold text-amber-700">{summary.pending_payments}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-600">Pending</div>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
          <div className="text-2xl font-extrabold text-red-700">{summary.open_exceptions}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-red-600">Open Exceptions</div>
        </div>
      </div>

      {/* Match Status + Financial Totals */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-base font-bold text-gray-900">Payment ↔ Contribution Match</h2>
          <p className="mt-1 text-xs text-gray-500">Every completed payment should have a matching contribution</p>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">Match Rate</span>
              <span className={`text-lg font-bold ${matchRate >= 95 ? 'text-emerald-600' : matchRate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                {matchRate}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div className={`h-2 rounded-full transition-all ${matchRate >= 95 ? 'bg-emerald-500' : matchRate >= 80 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${matchRate}%` }} />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3">
              <span className="text-sm font-medium text-emerald-800">Matched</span>
              <span className="text-lg font-bold text-emerald-700">{summary.paid_contributions}</span>
            </div>
            {summary.payments_without_contributions > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-red-50 p-3">
                <span className="text-sm font-medium text-red-800">Orphan Payments</span>
                <span className="text-lg font-bold text-red-700">{summary.payments_without_contributions}</span>
              </div>
            )}
            {summary.contributions_without_payments > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3">
                <span className="text-sm font-medium text-amber-800">Unmatched Contributions</span>
                <span className="text-lg font-bold text-amber-700">{summary.contributions_without_payments}</span>
              </div>
            )}
            {summary.payments_without_contributions === 0 && summary.contributions_without_payments === 0 && (
              <div className="rounded-lg bg-emerald-50 p-3 text-center text-sm font-medium text-emerald-700">
                ✓ All payments and contributions are matched
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-base font-bold text-gray-900">Financial Totals</h2>
          <p className="mt-1 text-xs text-gray-500">Amount verification across the system</p>
          <div className="mt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total Received (Payments)</span>
              <span className="font-semibold text-gray-900">{formatKes(summary.total_amount_received)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total Contributed</span>
              <span className="font-semibold text-gray-900">{formatKes(summary.total_amount_contributed)}</span>
            </div>
            <div className="border-t border-gray-100 pt-3 flex justify-between text-sm">
              <span className="text-gray-500">Difference</span>
              <span className={`font-semibold ${Math.abs(summary.total_amount_received - summary.total_amount_contributed) < 1 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {formatKes(Math.abs(summary.total_amount_received - summary.total_amount_contributed))}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Failed Payments</span>
              <span className="font-semibold text-red-600">{summary.failed_payments}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Pending Contributions</span>
              <span className="font-semibold text-amber-600">{summary.pending_contributions}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ORPHAN PAYMENTS TAB
// ============================================================================

function OrphanPaymentsTab() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState<string | null>(null)
  const [linkModal, setLinkModal] = useState<string | null>(null) // payment id to link
  const [linkSearch, setLinkSearch] = useState('')
  const [linkResults, setLinkResults] = useState<Contribution[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const data = await api<{ payments: Payment[]; total: number }>(
        `/admin/reconciliation?action=orphan-payments&page=${p}&per_page=20`, { auth: true }
      )
      setPayments(data.payments)
      setTotal(data.total)
      setPage(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const searchContributions = async (q: string) => {
    if (!q.trim()) { setLinkResults([]); return }
    try {
      const data = await api<{ contributions: Contribution[] }>(
        `/admin/contributions?q=${encodeURIComponent(q)}&per_page=10`, { auth: true }
      )
      setLinkResults(data.contributions ?? [])
    } catch { /* ignore */ }
  }

  const linkPayment = async (paymentId: string, contributionId: string) => {
    setLinking(paymentId)
    try {
      await api(`/admin/reconciliation?action=link-payment&id=${paymentId}`, {
        method: 'PATCH', auth: true,
        body: JSON.stringify({ contribution_id: contributionId }),
      })
      setPayments(prev => prev.filter(p => p.id !== paymentId))
      setTotal(prev => prev - 1)
      setLinkModal(null)
      setLinkSearch('')
      setLinkResults([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link')
    } finally {
      setLinking(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Orphan Payments</h3>
          <p className="text-xs text-gray-500">Completed payments with no matching contribution record</p>
        </div>
        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">{total} found</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : payments.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-12 text-center">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-sm font-medium text-emerald-700">No orphan payments found</p>
          <p className="mt-1 text-xs text-emerald-600">All completed payments have matching contributions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map(p => (
            <div key={p.id} className="rounded-2xl border border-red-200 bg-white p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={p.status} />
                    <span className="text-xs text-gray-400">{timeAgo(new Date(p.created_at))}</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="text-lg font-bold text-gray-900">{formatKes(p.amount)}</span>
                    {p.members && (
                      <span className="text-sm text-gray-500">{p.members.full_name} ({p.members.membership_number})</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-gray-400">
                    {p.mpesa_receipt && <span>Receipt: <span className="font-mono">{p.mpesa_receipt}</span></span>}
                    {p.phone && <span>Phone: {p.phone}</span>}
                  </div>
                </div>
                <button
                  onClick={() => setLinkModal(p.id)}
                  className="rounded-lg bg-luma-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-luma-700 transition-colors ml-4"
                >
                  Link to Contribution
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={() => fetchData(page - 1)} disabled={page <= 1}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Previous</button>
          <span className="text-xs text-gray-500">Page {page} of {Math.ceil(total / 20)}</span>
          <button onClick={() => fetchData(page + 1)} disabled={page >= Math.ceil(total / 20)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Next</button>
        </div>
      )}

      {/* Link Modal */}
      {linkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">Link Payment to Contribution</h3>
            <p className="mt-1 text-xs text-gray-500">Search for the contribution this payment should be linked to</p>
            <div className="mt-4 relative">
              <input
                type="text"
                value={linkSearch}
                onChange={(e) => { setLinkSearch(e.target.value); searchContributions(e.target.value) }}
                placeholder="Search by member name, period..."
                className="w-full rounded-lg border border-gray-200 py-2 pl-3 pr-4 text-sm outline-none focus:border-luma-500"
                autoFocus
              />
              {linkResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto">
                  {linkResults.map(c => (
                    <button
                      key={c.id}
                      onClick={() => linkPayment(linkModal, c.id)}
                      disabled={linking === linkModal}
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900">{c.members?.full_name ?? 'Unknown'}</div>
                        <div className="text-xs text-gray-400">{c.packages?.name} · {c.period} · {c.status}</div>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{formatKes(c.amount)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setLinkModal(null); setLinkSearch(''); setLinkResults([]) }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
    </div>
  )
}

// ============================================================================
// UNMATCHED CONTRIBUTIONS TAB
// ============================================================================

function UnmatchedContributionsTab() {
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const data = await api<{ contributions: Contribution[]; total: number }>(
        `/admin/reconciliation?action=unmatched-contributions&page=${p}&per_page=20`, { auth: true }
      )
      setContributions(data.contributions)
      setTotal(data.total)
      setPage(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Unmatched Contributions</h3>
          <p className="text-xs text-gray-500">Contributions recorded without a linked payment transaction</p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">{total} found</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : contributions.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-12 text-center">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-sm font-medium text-emerald-700">No unmatched contributions</p>
          <p className="mt-1 text-xs text-emerald-600">All contributions have linked payment records</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contributions.map(c => (
            <div key={c.id} className="rounded-2xl border border-amber-200 bg-white p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    <span className="text-xs text-gray-400">{c.period}</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="text-lg font-bold text-gray-900">{formatKes(c.amount)}</span>
                    {c.members && (
                      <span className="text-sm text-gray-500">{c.members.full_name} ({c.members.membership_number})</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {c.packages?.name ?? 'Unknown package'} · Created {new Date(c.created_at).toLocaleDateString('en-KE')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 20 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={() => fetchData(page - 1)} disabled={page <= 1}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Previous</button>
          <span className="text-xs text-gray-500">Page {page} of {Math.ceil(total / 20)}</span>
          <button onClick={() => fetchData(page + 1)} disabled={page >= Math.ceil(total / 20)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Next</button>
        </div>
      )}
      {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
    </div>
  )
}

// ============================================================================
// STALE PENDING TAB
// ============================================================================

function StalePendingTab() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ payments: Payment[]; total: number }>(
        '/admin/reconciliation?action=stale-pending', { auth: true }
      )
      setPayments(data.payments)
      setTotal(data.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const markFailed = async (paymentId: string) => {
    setMarking(paymentId)
    try {
      await api(`/admin/reconciliation?action=mark-failed&id=${paymentId}`, {
        method: 'PATCH', auth: true,
        body: JSON.stringify({ reason: 'No M-Pesa callback received within 30 minutes' }),
      })
      setPayments(prev => prev.filter(p => p.id !== paymentId))
      setTotal(prev => prev - 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark as failed')
    } finally {
      setMarking(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Stale Pending Payments</h3>
          <p className="text-xs text-gray-500">Payments pending for over 30 minutes without an M-Pesa callback</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${total > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {total} stale
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : payments.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-12 text-center">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-sm font-medium text-emerald-700">No stale pending payments</p>
          <p className="mt-1 text-xs text-emerald-600">All pending payments have received callbacks or are recent</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map(p => {
            const ageMinutes = Math.round((Date.now() - new Date(p.created_at).getTime()) / 60000)
            return (
              <div key={p.id} className="rounded-2xl border border-red-200 bg-white p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status="Pending" />
                      <span className="text-xs font-medium text-red-500">Stale for {ageMinutes} minutes</span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-3">
                      <span className="text-lg font-bold text-gray-900">{formatKes(p.amount)}</span>
                      {p.members && (
                        <span className="text-sm text-gray-500">{p.members.full_name} ({p.members.membership_number})</span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-xs text-gray-400">
                      {p.checkout_request_id && <span>Checkout: <span className="font-mono">{p.checkout_request_id.slice(0, 20)}...</span></span>}
                      {p.phone && <span>Phone: {p.phone}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => markFailed(p.id)}
                    disabled={marking === p.id}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors ml-4"
                  >
                    {marking === p.id ? 'Marking...' : 'Mark as Failed'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
    </div>
  )
}

// ============================================================================
// EXCEPTIONS TAB
// ============================================================================

function ExceptionsTab() {
  const [exceptions, setExceptions] = useState<Exception[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('open')
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (p = 1, s = status) => {
    setLoading(true)
    try {
      const data = await api<{ exceptions: Exception[]; total: number; page: number }>(
        `/admin/reconciliation?action=exceptions&status=${s}&page=${p}&per_page=20`, { auth: true }
      )
      setExceptions(data.exceptions)
      setTotal(data.total)
      setPage(data.page)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { fetchData() }, [fetchData])

  const resolve = async (id: string, newStatus: 'resolved' | 'ignored') => {
    setResolving(id)
    try {
      await api(`/admin/reconciliation?id=${id}`, {
        method: 'PATCH', auth: true,
        body: JSON.stringify({ status: newStatus }),
      })
      setExceptions(prev => prev.filter(e => e.id !== id))
      setTotal(prev => prev - 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setResolving(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {['open', 'resolved', 'ignored'].map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${status === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{total} total</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : exceptions.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-sm font-medium text-gray-500">No {status} exceptions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exceptions.map(ex => (
            <div key={ex.id} className={`rounded-2xl border bg-white p-5 ${ex.severity === 'critical' ? 'border-red-200' : ex.severity === 'high' ? 'border-amber-200' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={ex.severity} />
                    <span className="text-xs font-medium text-gray-500">{ex.exception_type.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-gray-400">{timeAgo(new Date(ex.created_at))}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-700">{ex.description}</p>
                  {ex.members && <p className="mt-1 text-xs text-gray-400">Member: {ex.members.full_name} ({ex.members.membership_number})</p>}
                  {ex.expected_value != null && ex.actual_value != null && (
                    <p className="mt-1 text-xs text-gray-400">Expected: {formatKes(ex.expected_value)} · Actual: {formatKes(ex.actual_value)}</p>
                  )}
                </div>
                {ex.status === 'open' && (
                  <div className="flex items-center gap-2 ml-4">
                    <button onClick={() => resolve(ex.id, 'resolved')} disabled={resolving === ex.id}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      {resolving === ex.id ? '...' : 'Resolve'}
                    </button>
                    <button onClick={() => resolve(ex.id, 'ignored')} disabled={resolving === ex.id}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      Ignore
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 20 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={() => fetchData(page - 1)} disabled={page <= 1}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Previous</button>
          <span className="text-xs text-gray-500">Page {page} of {Math.ceil(total / 20)}</span>
          <button onClick={() => fetchData(page + 1)} disabled={page >= Math.ceil(total / 20)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Next</button>
        </div>
      )}
      {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AdminReconciliation() {
  useHead('Financial Reconciliation', undefined, { noindex: true })
  const [tab, setTab] = useState<Tab>('overview')
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Payment[]>([])
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchPage, setSearchPage] = useState(1)

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api<{ summary: ReconciliationSummary }>('/admin/reconciliation?action=summary', { auth: true })
      setSummary(data.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load summary')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchSummary().finally(() => setLoading(false))
  }, [fetchSummary])

  const searchPayments = async (q: string, page = 1) => {
    if (!q.trim()) { setSearchResults([]); setSearchTotal(0); return }
    try {
      const data = await api<{ payments: Payment[]; total: number; page: number }>(
        `/admin/reconciliation?action=search&q=${encodeURIComponent(q)}&page=${page}&per_page=20`, { auth: true }
      )
      setSearchResults(data.payments)
      setSearchTotal(data.total)
      setSearchPage(data.page)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    }
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'orphan', label: 'Orphan Payments', badge: summary?.payments_without_contributions },
    { key: 'unmatched', label: 'Unmatched', badge: summary?.contributions_without_payments },
    { key: 'stale', label: 'Stale Pending', badge: summary?.pending_payments },
    { key: 'exceptions', label: 'Exceptions', badge: summary?.open_exceptions },
    { key: 'search', label: 'Search' },
  ]

  if (loading && !summary) {
    return (
      <div className="container-luma py-10">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      </div>
    )
  }

  if (error && !summary) {
    return (
      <div className="container-luma py-16 text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <button onClick={() => { setError(null); setLoading(true); fetchSummary().finally(() => setLoading(false)) }}
          className="mt-4 rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800">Try Again</button>
      </div>
    )
  }

  return (
    <div className="container-luma py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Reconciliation</h1>
          <p className="mt-1 text-sm text-gray-500">Monitor payment health, orphan records, and financial integrity</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`relative rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {t.badge > 99 ? '99+' : t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {tab === 'overview' && summary && <OverviewTab summary={summary} />}
        {tab === 'orphan' && <OrphanPaymentsTab />}
        {tab === 'unmatched' && <UnmatchedContributionsTab />}
        {tab === 'stale' && <StalePendingTab />}
        {tab === 'exceptions' && <ExceptionsTab />}

        {tab === 'search' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-md">
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') searchPayments(searchQuery) }}
                  placeholder="Search by receipt #, checkout ID, phone..."
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500" />
              </div>
              <button onClick={() => searchPayments(searchQuery)}
                className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 transition-colors">Search</button>
            </div>
            {searchResults.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-3">{searchTotal} results</p>
                <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Member</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Receipt</th>
                        <th className="px-4 py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map(p => (
                        <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{p.members?.full_name ?? 'Unknown'}</div>
                            <div className="text-xs text-gray-400">{p.members?.membership_number}</div>
                          </td>
                          <td className="px-4 py-3 font-semibold">{formatKes(p.amount)}</td>
                          <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-500">{p.mpesa_receipt ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {new Date(p.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {searchTotal > 20 && (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button onClick={() => searchPayments(searchQuery, searchPage - 1)} disabled={searchPage <= 1}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Previous</button>
                    <span className="text-xs text-gray-500">Page {searchPage}</span>
                    <button onClick={() => searchPayments(searchQuery, searchPage + 1)} disabled={searchPage >= Math.ceil(searchTotal / 20)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Next</button>
                  </div>
                )}
              </div>
            )}
            {searchQuery && searchResults.length === 0 && !loading && (
              <div className="mt-8 text-center text-sm text-gray-400">No payments found matching "{searchQuery}"</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
