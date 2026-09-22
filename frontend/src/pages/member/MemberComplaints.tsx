import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { StatusBadge } from '../../components/StatusBadge'
import { reportLoadError } from '../../lib/userFacingError'

type Complaint = {
  id: string
  reference_number: string
  subject: string
  body?: string
  status: string
  created_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  resolution_notes?: string | null
  appeal_requested_at: string | null
}

/**
 * Member complaints channel (constitutional written complaints process).
 */
export function MemberComplaints() {
  useHead('Complaints', undefined, { noindex: true })
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [detail, setDetail] = useState<Complaint | null>(null)
  const [appealBusy, setAppealBusy] = useState(false)

  function load() {
    setLoading(true)
    api<{ complaints: Complaint[] }>('/member/complaints', { auth: true })
      .then((d) => {
        setComplaints(d.complaints ?? [])
        setError(null)
      })
      .catch((e) => setError(reportLoadError(e, { page: 'member-complaints' }, 'Could not load complaints.')))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line oxc/react/set-state-in-effect — load on mount
  useEffect(() => { load() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (subject.trim().length < 3 || body.trim().length < 10) {
      setFormError('Provide a short subject and enough detail for review (at least 10 characters).')
      return
    }
    setSubmitting(true)
    try {
      await api('/member/complaints', {
        method: 'POST',
        auth: true,
        body: { subject: subject.trim(), body: body.trim() },
      })
      setSubject('')
      setBody('')
      setShowForm(false)
      load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not submit complaint.')
    } finally {
      setSubmitting(false)
    }
  }

  async function openDetail(id: string) {
    try {
      const d = await api<{ complaint: Complaint }>(`/member/complaints?id=${encodeURIComponent(id)}`, { auth: true })
      setDetail(d.complaint)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load complaint.')
    }
  }

  async function requestAppeal() {
    if (!detail) return
    setAppealBusy(true)
    try {
      const d = await api<{ complaint: Complaint }>(`/member/complaints?id=${encodeURIComponent(detail.id)}`, {
        method: 'PATCH',
        auth: true,
        body: {},
      })
      setDetail(d.complaint)
      load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not request appeal.')
    } finally {
      setAppealBusy(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      <PageHeader
        title="Complaints"
        description="Submit a written complaint for review. You will receive a reference number for follow-up."
        breadcrumbs={[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Complaints' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="min-h-11 rounded-lg bg-luma-700 px-4 text-sm font-semibold text-white hover:bg-luma-800"
          >
            {showForm ? 'Cancel' : 'New complaint'}
          </button>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="mb-8 glass-panel p-5 space-y-4">
          <div>
            <label htmlFor="complaint-subject" className="mb-1 block text-xs font-medium text-gray-600">Subject</label>
            <input
              id="complaint-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white"
              required
            />
          </div>
          <div>
            <label htmlFor="complaint-body" className="mb-1 block text-xs font-medium text-gray-600">Details</label>
            <textarea
              id="complaint-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              rows={5}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white"
              required
            />
          </div>
          {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="min-h-11 rounded-lg bg-luma-700 px-4 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit complaint'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : complaints.length === 0 ? (
        <EmptyState
          title="No complaints yet"
          message="Use this channel for formal written complaints. For general questions, contact support from the public site."
          action={{ label: 'New complaint', onClick: () => setShowForm(true) }}
        />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
          {complaints.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => openDetail(c.id)}
                className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{c.subject}</p>
                  <p className="text-xs text-gray-500">
                    {c.reference_number} · {new Date(c.created_at).toLocaleDateString('en-KE')}
                  </p>
                </div>
                <StatusBadge status={c.status}>{c.status.replace(/_/g, ' ')}</StatusBadge>
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setDetail(null)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="complaint-detail-title"
          >
            <h2 id="complaint-detail-title" className="text-lg font-semibold text-gray-900">{detail.subject}</h2>
            <p className="mt-1 text-xs text-gray-500">{detail.reference_number}</p>
            <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{detail.body}</p>
            {detail.resolution_notes && (
              <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Decision</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-700">{detail.resolution_notes}</p>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {['resolved', 'closed'].includes(detail.status) && !detail.appeal_requested_at && (
                <button
                  type="button"
                  disabled={appealBusy}
                  onClick={requestAppeal}
                  className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {appealBusy ? 'Requesting…' : 'Request appeal'}
                </button>
              )}
              {detail.appeal_requested_at && (
                <p className="text-xs text-gray-500">Appeal requested {new Date(detail.appeal_requested_at).toLocaleDateString('en-KE')}</p>
              )}
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="min-h-11 rounded-lg bg-luma-700 px-3 text-sm font-semibold text-white hover:bg-luma-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
