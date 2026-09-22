import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { useToast } from '../../components/Toast'
import { FilterBar } from '../../components/FilterBar'
import { SearchInput } from '../../components/SearchInput'
import { StatusBadge } from '../../components/StatusBadge'
import { ErrorState } from '../../components/ErrorState'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { reportLoadError } from '../../lib/userFacingError'
import { displayEmail, formatKenyanPhone } from '../../lib/pii'

type MemberBrief = {
  full_name?: string
  membership_number?: string | null
  application_number?: string | null
  phone?: string
  email?: string | null
}

type Complaint = {
  id: string
  reference_number: string
  member_id: string
  subject: string
  body?: string
  status: string
  created_at: string
  resolution_notes?: string | null
  appeal_requested_at?: string | null
  members?: MemberBrief | null
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'under_review', label: 'Under review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'escalated', label: 'Escalated' },
]

const NEXT_ACTIONS: Record<string, { status: string; label: string }[]> = {
  submitted: [
    { status: 'acknowledged', label: 'Acknowledge' },
    { status: 'under_review', label: 'Start review' },
    { status: 'escalated', label: 'Escalate' },
  ],
  acknowledged: [
    { status: 'under_review', label: 'Start review' },
    { status: 'escalated', label: 'Escalate' },
  ],
  under_review: [
    { status: 'resolved', label: 'Resolve' },
    { status: 'closed', label: 'Close' },
    { status: 'escalated', label: 'Escalate' },
  ],
  escalated: [
    { status: 'under_review', label: 'Return to review' },
    { status: 'resolved', label: 'Resolve' },
    { status: 'closed', label: 'Close' },
  ],
  resolved: [{ status: 'closed', label: 'Close' }],
  closed: [],
}

export function AdminComplaints() {
  useHead('Complaints', undefined, { noindex: true })
  const { addToast } = useToast()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<Complaint | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filter) qs.set('status', filter)
      if (debouncedQuery.trim()) qs.set('q', debouncedQuery.trim())
      const d = await api<{ complaints: Complaint[] }>(`/admin/complaints?${qs}`, { auth: true })
      setComplaints(d.complaints ?? [])
      setError(null)
    } catch (e) {
      setError(reportLoadError(e, { page: 'admin-complaints' }, 'Could not load complaints.'))
    } finally {
      setLoading(false)
    }
  }, [filter, debouncedQuery])

  // eslint-disable-next-line oxc/react/set-state-in-effect
  useEffect(() => { load() }, [load])

  async function openDetail(id: string) {
    try {
      const d = await api<{ complaint: Complaint }>(`/admin/complaints/${id}`, { auth: true })
      setDetail(d.complaint)
      setNotes(d.complaint.resolution_notes ?? '')
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not load complaint.')
    }
  }

  async function updateStatus(status: string) {
    if (!detail) return
    if ((status === 'resolved' || status === 'closed') && notes.trim().length < 3) {
      addToast('warning', 'Add resolution notes before resolving or closing.')
      return
    }
    setBusy(true)
    try {
      const d = await api<{ complaint: Complaint }>(`/admin/complaints/${detail.id}`, {
        method: 'PATCH',
        auth: true,
        body: { status, resolutionNotes: notes.trim() || undefined },
      })
      setDetail({ ...detail, ...d.complaint })
      addToast('success', `Complaint marked ${status.replace(/_/g, ' ')}.`)
      await load()
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not update complaint.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Complaints</h1>
        <p className="mt-1 text-sm text-gray-500">Acknowledge, review, and communicate decisions on member complaints.</p>
      </div>

      <FilterBar
        options={STATUS_FILTERS}
        value={filter}
        onChange={setFilter}
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search reference or subject…" />}
      />

      {error && <ErrorState message={error} onRetry={load} />}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : complaints.length === 0 ? (
        <p className="text-sm text-gray-500">No complaints match this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {complaints.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button type="button" className="font-medium text-luma-700 hover:underline" onClick={() => openDetail(c.id)}>
                      {c.reference_number}
                    </button>
                    {c.appeal_requested_at && <div className="text-xs text-amber-700">Appeal requested</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.members?.full_name ?? '—'}</div>
                    <div className="text-xs text-gray-500">{c.members?.membership_number ?? c.members?.application_number ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate">{c.subject}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status}>{c.status.replace(/_/g, ' ')}</StatusBadge></td>
                  <td className="px-4 py-3 text-gray-500">{new Date(c.created_at).toLocaleDateString('en-KE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40" onClick={() => setDetail(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{detail.reference_number}</h2>
                <p className="text-sm text-gray-500">{detail.subject}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Close">×</button>
            </div>
            <div className="space-y-4 p-6 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Member</p>
                <p className="font-medium">{detail.members?.full_name ?? '—'}</p>
                <p className="text-gray-500">{displayEmail(detail.members?.email)} · {formatKenyanPhone(detail.members?.phone ?? '')}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Complaint</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-800">{detail.body}</p>
              </div>
              <div>
                <label htmlFor="resolution-notes" className="text-xs font-medium text-gray-600">Resolution notes</label>
                <textarea
                  id="resolution-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(NEXT_ACTIONS[detail.status] ?? []).map((a) => (
                  <button
                    key={a.status}
                    type="button"
                    disabled={busy}
                    onClick={() => updateStatus(a.status)}
                    className="min-h-11 rounded-lg bg-luma-700 px-3 text-xs font-semibold text-white hover:bg-luma-800 disabled:opacity-50"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
