import { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../../lib/api'

type Claim = {
  id: string
  claim_number: string
  claim_type: string | null
  amount_requested: number | null
  description: string | null
  status: string
  admin_notes: string | null
  created_at: string
  submitted_at: string | null
  decided_at: string | null
  member_id: string
  members: { full_name: string | null; phone: string | null; email: string | null } | null
  packages: { code: string | null; name: string | null } | null
}

type ClaimDocument = {
  id: string
  document_type: string
  file_name: string
  file_url: string
  uploaded_at: string
}

const statusStyles: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600 border-gray-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  'Under Review': 'bg-amber-50 text-amber-700 border-amber-200',
  'Additional Information Required': 'bg-orange-50 text-orange-700 border-orange-200',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
  Paid: 'bg-purple-50 text-purple-700 border-purple-200',
}

const filterTabs = [
  { value: '', label: 'All' },
  { value: 'Submitted', label: 'Submitted' },
  { value: 'Under Review', label: 'Under Review' },
  { value: 'Additional Information Required', label: 'Info Needed' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Rejected', label: 'Rejected' },
]

export function AdminClaims() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Detail modal
  const [detail, setDetail] = useState<Claim | null>(null)
  const [documents, setDocuments] = useState<ClaimDocument[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Dialogs
  const [approveTarget, setApproveTarget] = useState<Claim | null>(null)
  const [approveNotes, setApproveNotes] = useState('')
  const [approveAmount, setApproveAmount] = useState('')

  const [rejectTarget, setRejectTarget] = useState<Claim | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')

  const [infoTarget, setInfoTarget] = useState<Claim | null>(null)
  const [infoMessage, setInfoMessage] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const d = await api<{ claims: Claim[] }>(
        `/admin/claims${filter ? `?status=${filter}` : ''}`,
        { auth: true },
      )
      setClaims(d.claims ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load claims.')
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function viewDetail(claim: Claim) {
    setDetail(claim)
    setDocuments([])
    setLoadingDetail(true)
    try {
      const d = await api<{ claim: Claim; documents: ClaimDocument[] }>(`/admin/claims/${claim.id}`, { auth: true })
      setDocuments(d.documents ?? [])
    } catch {
      // Silently fail — we still show the claim info
    } finally {
      setLoadingDetail(false)
    }
  }

  async function approve(claim: Claim) {
    setBusyId(claim.id)
    setNotice(null)
    try {
      await api(`/admin/claims/${claim.id}`, {
        method: 'PATCH',
        auth: true,
        body: {
          decision: 'approve',
          adminNotes: approveNotes.trim() || undefined,
          amount: approveAmount ? Number(approveAmount) : undefined,
        },
      })
      setNotice(`Claim ${claim.claim_number} approved.`)
      setApproveTarget(null)
      setApproveNotes('')
      setApproveAmount('')
      setDetail(null)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not approve claim.')
    } finally {
      setBusyId(null)
    }
  }

  async function reject(claim: Claim) {
    setBusyId(claim.id)
    setNotice(null)
    try {
      await api(`/admin/claims/${claim.id}`, {
        method: 'PATCH',
        auth: true,
        body: { decision: 'reject', adminNotes: rejectNotes.trim() || undefined },
      })
      setNotice(`Claim ${claim.claim_number} rejected.`)
      setRejectTarget(null)
      setRejectNotes('')
      setDetail(null)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reject claim.')
    } finally {
      setBusyId(null)
    }
  }

  async function requestInfo(claim: Claim) {
    setBusyId(claim.id)
    setNotice(null)
    try {
      await api(`/admin/claims/${claim.id}`, {
        method: 'PATCH',
        auth: true,
        body: { decision: 'request-info', adminNotes: infoMessage.trim() || undefined },
      })
      setNotice(`Additional information requested for ${claim.claim_number}.`)
      setInfoTarget(null)
      setInfoMessage('')
      setDetail(null)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update claim.')
    } finally {
      setBusyId(null)
    }
  }

  const submittedCount = claims.filter(c => c.status === 'Submitted').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Claims</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review member claims. Approved claims are recorded for future payout processing.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1">
        {filterTabs.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.value ? 'bg-luma-100 text-luma-700' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {f.label}
            {f.value === 'Submitted' && submittedCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-100 px-1 text-[10px] font-bold text-blue-700">
                {submittedCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">{notice}</div>
      )}

      {/* Claims Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Claim</th>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((cl) => (
              <tr key={cl.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <button
                    onClick={() => viewDetail(cl)}
                    className="font-medium text-luma-700 hover:text-luma-800 hover:underline text-left"
                  >
                    {cl.claim_number}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{cl.members?.full_name ?? 'Unknown'}</div>
                  <div className="text-xs text-gray-500">{cl.members?.phone ?? ''}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{cl.packages?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{cl.claim_type ?? '—'}</td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {cl.amount_requested != null ? `KSh ${cl.amount_requested.toLocaleString('en-KE')}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyles[cl.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                    {cl.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(cl.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {cl.status === 'Submitted' && (
                    <div className="flex justify-end gap-1.5">
                      <button
                        disabled={busyId === cl.id}
                        onClick={() => {
                          setApproveTarget(cl)
                          setApproveAmount(cl.amount_requested != null ? String(cl.amount_requested) : '')
                          setApproveNotes('')
                        }}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busyId === cl.id}
                        onClick={() => { setInfoTarget(cl); setInfoMessage('') }}
                        className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
                      >
                        Info
                      </button>
                      <button
                        disabled={busyId === cl.id}
                        onClick={() => { setRejectTarget(cl); setRejectNotes('') }}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {cl.status !== 'Submitted' && cl.admin_notes && (
                    <span className="text-xs text-gray-400 italic max-w-[140px] block truncate" title={cl.admin_notes}>
                      {cl.admin_notes}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {claims.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            <p className="text-sm">No {filter ? filter.toLowerCase() : ''} claims found.</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-12 overflow-y-auto" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{detail.claim_number}</h3>
                  <span className={`mt-1 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyles[detail.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                    {detail.status}
                  </span>
                </div>
                <button onClick={() => setDetail(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-gray-400 text-xs">Member</span>
                  <div className="font-medium text-gray-900">{detail.members?.full_name ?? '—'}</div>
                  <div className="text-gray-500 text-xs">{detail.members?.phone ?? ''}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Package</span>
                  <div className="font-medium text-gray-900">{detail.packages?.name ?? '—'}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Claim Type</span>
                  <div className="text-gray-700">{detail.claim_type ?? '—'}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Amount Requested</span>
                  <div className="font-medium text-gray-900">
                    {detail.amount_requested != null ? `KSh ${detail.amount_requested.toLocaleString('en-KE')}` : '—'}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Submitted</span>
                  <div className="text-gray-700">{detail.submitted_at ? new Date(detail.submitted_at).toLocaleString() : '—'}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Created</span>
                  <div className="text-gray-700">{new Date(detail.created_at).toLocaleString()}</div>
                </div>
              </div>
              {detail.description && (
                <div>
                  <span className="text-gray-400 text-xs">Description</span>
                  <p className="mt-1 text-gray-700 whitespace-pre-wrap">{detail.description}</p>
                </div>
              )}
              {detail.admin_notes && (
                <div>
                  <span className="text-gray-400 text-xs">Admin Notes</span>
                  <p className="mt-1 text-gray-700 whitespace-pre-wrap">{detail.admin_notes}</p>
                </div>
              )}
              {documents.length > 0 && (
                <div>
                  <span className="text-gray-400 text-xs">Documents</span>
                  <div className="mt-1 space-y-1">
                    {documents.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-luma-700 hover:bg-gray-50 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                        {doc.file_name}
                        <span className="text-xs text-gray-400">({doc.document_type})</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {loadingDetail && (
                <div className="text-center text-gray-400 text-xs py-2">Loading documents…</div>
              )}
            </div>
            {detail.status === 'Submitted' && (
              <div className="border-t border-gray-200 px-6 py-4 flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setApproveTarget(detail)
                    setApproveAmount(detail.amount_requested != null ? String(detail.amount_requested) : '')
                    setApproveNotes('')
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => { setInfoTarget(detail); setInfoMessage('') }}
                  className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
                >
                  Request Info
                </button>
                <button
                  onClick={() => { setRejectTarget(detail); setRejectNotes('') }}
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approve Dialog */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setApproveTarget(null)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">Approve Claim</h3>
              <p className="mt-1 text-sm text-gray-500">
                Approve <strong>{approveTarget.claim_number}</strong> from{' '}
                <strong>{approveTarget.members?.full_name ?? 'member'}</strong>?
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Payout Amount (KSh)</label>
                  <input
                    type="number"
                    value={approveAmount}
                    onChange={(e) => setApproveAmount(e.target.value)}
                    placeholder={approveTarget.amount_requested != null ? String(approveTarget.amount_requested) : 'e.g. 100000'}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Admin Notes (optional)</label>
                  <textarea
                    value={approveNotes}
                    onChange={(e) => setApproveNotes(e.target.value)}
                    placeholder="Any notes about this approval…"
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setApproveTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => approve(approveTarget)}
                disabled={busyId === approveTarget.id}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busyId === approveTarget.id ? 'Approving…' : 'Approve Claim'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRejectTarget(null)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">Reject Claim</h3>
              <p className="mt-1 text-sm text-gray-500">
                Reject <strong>{rejectTarget.claim_number}</strong> from{' '}
                <strong>{rejectTarget.members?.full_name ?? 'member'}</strong>?
              </p>
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
                <textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="e.g. Insufficient documentation, not eligible…"
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setRejectTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => reject(rejectTarget)}
                disabled={busyId === rejectTarget.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busyId === rejectTarget.id ? 'Rejecting…' : 'Reject Claim'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Info Dialog */}
      {infoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setInfoTarget(null)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">Request Additional Information</h3>
              <p className="mt-1 text-sm text-gray-500">
                Ask <strong>{infoTarget.members?.full_name ?? 'member'}</strong> for more information on claim{' '}
                <strong>{infoTarget.claim_number}</strong>.
              </p>
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-600">Message *</label>
                <textarea
                  value={infoMessage}
                  onChange={(e) => setInfoMessage(e.target.value)}
                  placeholder="e.g. Please upload a copy of the hospital bill…"
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setInfoTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => requestInfo(infoTarget)}
                disabled={busyId === infoTarget.id || !infoMessage.trim()}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {busyId === infoTarget.id ? 'Sending…' : 'Request Info'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
