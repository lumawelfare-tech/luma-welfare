import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useHead } from '../../lib/seo'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { reportLoadError } from '../../lib/userFacingError'

type MemberDocument = {
  id: string
  claim_id: string
  file_name: string | null
  file_type: string | null
  created_at: string
  file_url?: string | null
  claim_number?: string | null
  claim_type?: string | null
  claim_status?: string | null
}

/**
 * Member-scoped documents inbox: claim evidence (signed URLs) + links to
 * receipts and membership records. Organizational KB arrives in Phase 6.
 */
export function MemberDocuments() {
  useHead('My documents', undefined, { noindex: true })
  const { member } = useAuth()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<MemberDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    api<{ documents: MemberDocument[] }>('/member/claims?action=documents', { auth: true })
      .then((d) => {
        setDocuments(d.documents ?? [])
        setError(null)
      })
      .catch((e) => setError(reportLoadError(e, { page: 'member-documents' }, 'Could not load documents.')))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line oxc/react/set-state-in-effect — load on mount
  useEffect(() => { load() }, [])

  const programs = member?.application_program_codes ?? []

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      <PageHeader
        title="My documents"
        description="Claim evidence and membership records for your account. Organizational policy documents will appear here when published for members."
        breadcrumbs={[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Documents' },
        ]}
      />

      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      <section className="mb-8 glass-panel p-5" aria-labelledby="membership-records-heading">
        <h2 id="membership-records-heading" className="text-sm font-semibold text-gray-900">Membership records</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-gray-500">Application number</dt>
            <dd className="font-medium text-gray-900">{member?.application_number ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Membership number</dt>
            <dd className="font-medium text-gray-900">{member?.membership_number ? `#${member.membership_number}` : 'Pending approval'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="font-medium capitalize text-gray-900">{member?.status?.replace(/_/g, ' ') ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Programs of interest</dt>
            <dd className="font-medium text-gray-900">
              {programs.length > 0 ? programs.join(', ') : (
                <Link to="/join" className="text-luma-700 hover:underline">Choose programs</Link>
              )}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link to="/receipts-statements" className="min-h-11 inline-flex items-center font-medium text-luma-700 hover:underline">
            Receipts &amp; statements
          </Link>
          <Link to="/profile" className="min-h-11 inline-flex items-center font-medium text-luma-700 hover:underline">
            Profile &amp; data export
          </Link>
        </div>
      </section>

      <section aria-labelledby="claim-evidence-heading">
        <h2 id="claim-evidence-heading" className="text-sm font-semibold text-gray-900 mb-3">Claim evidence</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : documents.length === 0 ? (
          <EmptyState
            title="No claim documents yet"
            message="Files you upload with a claim appear here. Start a claim when you need support."
            action={{ label: 'Go to claims', onClick: () => navigate('/claims') }}
          />
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
            {documents.map((doc) => (
              <li key={doc.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{doc.file_name ?? 'Document'}</p>
                  <p className="text-xs text-gray-500">
                    {doc.claim_number ? `Claim ${doc.claim_number}` : 'Claim'}
                    {doc.claim_type ? ` · ${doc.claim_type}` : ''}
                    {doc.claim_status ? ` · ${doc.claim_status}` : ''}
                    {' · '}
                    {new Date(doc.created_at).toLocaleDateString('en-KE')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {doc.file_url && (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Download
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  )}
                  <Link
                    to="/claims"
                    className="inline-flex min-h-11 items-center rounded-lg bg-luma-700 px-3 text-xs font-semibold text-white hover:bg-luma-800"
                  >
                    Open claims
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-gray-400">
        Downloads use short-lived secure links. Organizational handbooks and approved policies will be listed here after the knowledge-base phase.
      </p>
    </div>
  )
}
