import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useHead } from '../../lib/seo'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { reportLoadError } from '../../lib/userFacingError'
import { useToast } from '../../components/Toast'
import { formatApplicationProgramCodes, memberStatusLabel } from '../../lib/applicationPrograms'
import { identityDocLabel, identityDocStatusLabel } from '../../lib/identityDocs'
import { StatusBadge } from '../../components/StatusBadge'

type ClaimDocument = {
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

type OrgDocument = {
  id: string
  title: string
  summary: string | null
  category: string | null
  file_name: string
  access_level: string
  approved_at: string | null
  created_at: string
  file_url?: string
}

/**
 * Member-scoped documents inbox: org KB (approved public/member) + claim evidence.
 */
export function MemberDocuments() {
  useHead('My documents', undefined, { noindex: true })
  const { member } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<ClaimDocument[]>([])
  const [orgDocs, setOrgDocs] = useState<OrgDocument[]>([])
  const [identityDocs, setIdentityDocs] = useState<{
    id: string
    document_type: string
    verification_status: string
    original_filename?: string | null
    created_at: string
  }[]>([])
  const [loading, setLoading] = useState(true)
  const [orgLoading, setOrgLoading] = useState(true)
  const [identityLoading, setIdentityLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [identityBusy, setIdentityBusy] = useState<string | null>(null)

  function load() {
    setLoading(true)
    setOrgLoading(true)
    api<{ documents: ClaimDocument[] }>('/member/claims?action=documents', { auth: true })
      .then((d) => {
        setDocuments(d.documents ?? [])
        setError(null)
      })
      .catch((e) => setError(reportLoadError(e, { page: 'member-documents' }, 'Could not load documents.')))
      .finally(() => setLoading(false))

    api<{ documents: OrgDocument[] }>('/member/documents', { auth: true })
      .then((d) => setOrgDocs(d.documents ?? []))
      .catch(() => setOrgDocs([]))
      .finally(() => setOrgLoading(false))

    setIdentityLoading(true)
    api<{ documents: typeof identityDocs }>('/member/identity-docs', { auth: true })
      .then((d) => setIdentityDocs(d.documents ?? []))
      .catch(() => setIdentityDocs([]))
      .finally(() => setIdentityLoading(false))
  }

  // eslint-disable-next-line oxc/react/set-state-in-effect — load on mount
  useEffect(() => { load() }, [])

  async function openIdentityDoc(id: string) {
    setIdentityBusy(id)
    try {
      const d = await api<{ file_url: string }>('/member/identity-docs?action=download', {
        method: 'POST',
        auth: true,
        body: { documentId: id },
      })
      if (d.file_url) window.open(d.file_url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not open document.')
    } finally {
      setIdentityBusy(null)
    }
  }

  async function downloadOrg(id: string) {
    try {
      const d = await api<{ document: OrgDocument }>(`/member/documents?id=${encodeURIComponent(id)}`, { auth: true })
      if (!d.document.file_url) {
        addToast('warning', 'Download link unavailable.')
        return
      }
      window.open(d.document.file_url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Could not open document.')
    }
  }

  const programs = member?.application_program_codes ?? []

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
      <PageHeader
        title="My documents"
        description="Organization policies published for members, plus your claim evidence and membership records."
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
            <dd className="font-medium text-gray-900">{member?.membership_number ? `#${member.membership_number}` : 'Pending verification'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="font-medium text-gray-900">{memberStatusLabel(member?.status)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Programs of interest</dt>
            <dd className="font-medium text-gray-900">
              {programs.length > 0 ? formatApplicationProgramCodes(programs) : (
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

      <section className="mb-8" aria-labelledby="identity-docs-heading">
        <h2 id="identity-docs-heading" className="text-sm font-semibold text-gray-900 mb-3">Identity documents</h2>
        {identityLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : identityDocs.length === 0 ? (
          <p className="text-sm text-gray-500">
            No National ID or KRA PDF uploaded yet.{' '}
            <Link to="/profile" className="font-medium text-luma-700 hover:underline">Upload on your profile</Link>.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
            {identityDocs.map((doc) => (
              <li key={doc.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{identityDocLabel(doc.document_type)}</p>
                  <p className="text-xs text-gray-500">
                    {doc.original_filename ?? 'PDF'}
                    {' · '}
                    {new Date(doc.created_at).toLocaleDateString('en-KE')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={doc.verification_status}>{identityDocStatusLabel(doc.verification_status)}</StatusBadge>
                  <button
                    type="button"
                    disabled={identityBusy === doc.id}
                    onClick={() => void openIdentityDoc(doc.id)}
                    className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {identityBusy === doc.id ? 'Opening…' : 'Open'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8" aria-labelledby="org-docs-heading">
        <h2 id="org-docs-heading" className="text-sm font-semibold text-gray-900 mb-3">Organization documents</h2>
        {orgLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : orgDocs.length === 0 ? (
          <p className="text-sm text-gray-500">No handbooks or policies have been published for members yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
            {orgDocs.map((doc) => (
              <li key={doc.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{doc.title}</p>
                  <p className="text-xs text-gray-500">
                    {doc.category ? `${doc.category} · ` : ''}
                    {doc.file_name}
                    {doc.approved_at ? ` · ${new Date(doc.approved_at).toLocaleDateString('en-KE')}` : ''}
                  </p>
                  {doc.summary && <p className="mt-1 text-xs text-gray-600 line-clamp-2">{doc.summary}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => downloadOrg(doc.id)}
                  className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Download
                  <span className="sr-only"> (opens in a new tab)</span>
                </button>
              </li>
            ))}
          </ul>
        )}
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
        Downloads use short-lived secure links. Staff-only and restricted documents are never listed here.
      </p>
    </div>
  )
}
