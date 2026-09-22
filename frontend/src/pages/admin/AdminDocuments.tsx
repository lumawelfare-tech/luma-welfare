import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { useToast } from '../../components/Toast'
import { FilterBar } from '../../components/FilterBar'
import { SearchInput } from '../../components/SearchInput'
import { StatusBadge } from '../../components/StatusBadge'
import { ErrorState } from '../../components/ErrorState'
import { EmptyState } from '../../components/EmptyState'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { reportLoadError } from '../../lib/userFacingError'

type KbDocument = {
  id: string
  title: string
  slug: string | null
  summary: string | null
  category: string | null
  access_level: string
  status: string
  file_name: string
  mime_type: string | null
  file_size: number | null
  version: number
  approved_at: string | null
  archived_at: string | null
  created_at: string
  file_url?: string
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'archived', label: 'Archived' },
]

const ACCESS_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'member', label: 'Member' },
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
  { value: 'restricted', label: 'Restricted' },
]

const CATEGORY_OPTIONS = [
  { value: 'ORGANIZATIONAL', label: 'Organizational' },
  { value: 'PUBLIC_CONTENT', label: 'Public content' },
  { value: 'MEMBERSHIP', label: 'Membership' },
  { value: 'POLICY', label: 'Policy' },
  { value: 'PROGRAM', label: 'Program' },
  { value: 'CLAIMS', label: 'Claims' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'COMMUNITY', label: 'Community' },
  { value: 'OTHER', label: 'Other' },
]

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Admin org knowledge-base documents — ACL + Draft→Approved→Archived.
 * Private storage; downloads use signed URLs. Rebuild index runs secure KB ingest (approved public/member only).
 */
export function AdminDocuments() {
  useHead('Documents', undefined, { noindex: true })
  const { addToast } = useToast()
  const [documents, setDocuments] = useState<KbDocument[]>([])
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [category, setCategory] = useState('')
  const [accessLevel, setAccessLevel] = useState('member')
  const [file, setFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filter) qs.set('status', filter)
      if (debouncedQuery.trim()) qs.set('q', debouncedQuery.trim())
      const d = await api<{ documents: KbDocument[] }>(`/admin/documents?${qs}`, { auth: true })
      setDocuments(d.documents ?? [])
      setError(null)
    } catch (e) {
      setError(reportLoadError(e, { page: 'admin-documents' }, 'Could not load documents.'))
    } finally {
      setLoading(false)
    }
  }, [filter, debouncedQuery])

  // eslint-disable-next-line oxc/react/set-state-in-effect
  useEffect(() => { load() }, [load])

  async function createDoc(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      addToast('warning', 'Choose a file to upload.')
      return
    }
    setBusy(true)
    try {
      const fileBase64 = await fileToBase64(file)
      await api('/admin/documents', {
        method: 'POST',
        auth: true,
        body: {
          title: title.trim(),
          summary: summary.trim() || undefined,
          category: category.trim() || undefined,
          accessLevel,
          fileName: file.name,
          fileBase64,
        },
      })
      addToast('success', 'Document uploaded as draft.')
      setShowForm(false)
      setTitle('')
      setSummary('')
      setCategory('')
      setAccessLevel('member')
      setFile(null)
      await load()
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Could not upload document.')
    } finally {
      setBusy(false)
    }
  }

  async function reindexKb() {
    setBusy(true)
    try {
      const d = await api<{ chunks: number; kb_documents: number }>('/admin/kb-ingest', { method: 'POST', auth: true })
      addToast('success', `Assistant index rebuilt (${d.chunks} chunks, ${d.kb_documents} org docs).`)
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Could not rebuild index (is AI_ASSISTANT_ENABLED set?).')
    } finally {
      setBusy(false)
    }
  }

  async function lifecycle(id: string, action: 'approve' | 'archive' | 'draft' | 'under_review') {
    setBusy(true)
    try {
      await api(`/admin/documents/${id}`, {
        method: 'PATCH',
        auth: true,
        body: { lifecycle: action },
      })
      const label =
        action === 'draft' ? 'returned to draft'
        : action === 'under_review' ? 'submitted for review'
        : action === 'approve' ? 'approved'
        : 'archived'
      addToast('success', `Document ${label}.`)
      await load()
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Could not update document.')
    } finally {
      setBusy(false)
    }
  }

  async function download(id: string) {
    try {
      const d = await api<{ document: KbDocument }>(`/admin/documents/${id}`, { auth: true })
      if (!d.document.file_url) {
        addToast('warning', 'Download link unavailable.')
        return
      }
      window.open(d.document.file_url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Could not open document.')
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    setBusy(true)
    try {
      await api(`/admin/documents/${deleteId}`, { method: 'DELETE', auth: true })
      addToast('success', 'Document deleted.')
      setDeleteId(null)
      await load()
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Could not delete document.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="mt-1 text-sm text-gray-500">
            Organization knowledge base — Draft → Under review → Approved → Archived. Public access_level still requires Approved before members/public see it. Files stay private with signed downloads.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void reindexKb()} disabled={busy} className="min-h-11 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Rebuild assistant index
          </button>
          <button type="button" onClick={() => setShowForm((v) => !v)} className="min-h-11 rounded-lg bg-luma-700 px-4 text-sm font-semibold text-white hover:bg-luma-800">
            {showForm ? 'Cancel' : 'Upload document'}
          </button>
        </div>
      </div>

      <FilterBar
        options={STATUS_FILTERS}
        value={filter}
        onChange={setFilter}
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search title, category, file…" />}
      />

      {error && <ErrorState message={error} onRetry={load} />}

      {showForm && (
        <form onSubmit={createDoc} className="grid gap-3 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="kb-title">Title</label>
            <input id="kb-title" required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="kb-summary">Summary</label>
            <textarea id="kb-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="kb-category">Category</label>
            <select id="kb-category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="">Select category</option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="kb-access">Access level</label>
            <select id="kb-access" value={accessLevel} onChange={(e) => setAccessLevel(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              {ACCESS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="kb-file">File (PDF, DOCX, JPEG, PNG, WebP — max 20MB)</label>
            <input id="kb-file" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full text-sm" />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-luma-700 px-4 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50">
              {busy ? 'Uploading…' : 'Save as draft'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : documents.length === 0 ? (
        <EmptyState title="No documents yet" message="Upload handbooks and policies, then approve for the right audience." action={{ label: 'Upload document', onClick: () => setShowForm(true) }} />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                  <StatusBadge status={doc.status}>{doc.status}</StatusBadge>
                  <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{doc.access_level}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {doc.file_name}
                  {doc.category ? ` · ${doc.category}` : ''}
                  {' · '}
                  {new Date(doc.created_at).toLocaleDateString('en-KE')}
                </p>
                {doc.summary && <p className="mt-1 text-sm text-gray-600 line-clamp-2">{doc.summary}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => download(doc.id)} className="min-h-11 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">Download</button>
                {doc.status === 'draft' && (
                  <button type="button" disabled={busy} onClick={() => lifecycle(doc.id, 'under_review')} className="min-h-11 rounded-lg border border-luma-200 px-3 text-xs font-medium text-luma-800 hover:bg-luma-50 disabled:opacity-50">Submit review</button>
                )}
                {doc.status !== 'approved' && doc.status !== 'archived' && (
                  <button type="button" disabled={busy} onClick={() => lifecycle(doc.id, 'approve')} className="min-h-11 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
                )}
                {doc.status === 'approved' && (
                  <button type="button" disabled={busy} onClick={() => lifecycle(doc.id, 'archive')} className="min-h-11 rounded-lg border border-amber-200 px-3 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50">Archive</button>
                )}
                {doc.status !== 'draft' && (
                  <button type="button" disabled={busy} onClick={() => lifecycle(doc.id, 'draft')} className="min-h-11 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">To draft</button>
                )}
                <button type="button" onClick={() => setDeleteId(doc.id)} className="min-h-11 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete document?"
        message="Removes the knowledge-base entry and its private file. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
