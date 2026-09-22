import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { useToast } from '../../components/Toast'
import { SearchInput } from '../../components/SearchInput'
import { ErrorState } from '../../components/ErrorState'
import { EmptyState } from '../../components/EmptyState'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { reportLoadError } from '../../lib/userFacingError'
import { ConfirmDialog } from '../../components/ConfirmDialog'

type CommunityRecord = {
  id: string
  record_date: string
  location: string
  purpose: string
  resources_used: string | null
  responsible_officials: string | null
  partner_organization: string | null
  outcome: string | null
  notes: string | null
}

const emptyForm = {
  recordDate: '',
  location: '',
  purpose: '',
  resourcesUsed: '',
  responsibleOfficials: '',
  partnerOrganization: '',
  outcome: '',
  notes: '',
}

/**
 * Mission of Mercy / community outreach ops log (no child PII or images).
 */
export function AdminCommunity() {
  useHead('Community support', undefined, { noindex: true })
  const { addToast } = useToast()
  const [records, setRecords] = useState<CommunityRecord[]>([])
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (debouncedQuery.trim()) qs.set('q', debouncedQuery.trim())
      const d = await api<{ records: CommunityRecord[] }>(`/admin/community?${qs}`, { auth: true })
      setRecords(d.records ?? [])
      setError(null)
    } catch (e) {
      setError(reportLoadError(e, { page: 'admin-community' }, 'Could not load community records.'))
    } finally {
      setLoading(false)
    }
  }, [debouncedQuery])

  // eslint-disable-next-line oxc/react/set-state-in-effect
  useEffect(() => { load() }, [load])

  function startCreate() {
    setEditingId(null)
    setForm({ ...emptyForm, recordDate: new Date().toISOString().slice(0, 10) })
    setShowForm(true)
  }

  function startEdit(r: CommunityRecord) {
    setEditingId(r.id)
    setForm({
      recordDate: r.record_date,
      location: r.location,
      purpose: r.purpose,
      resourcesUsed: r.resources_used ?? '',
      responsibleOfficials: r.responsible_officials ?? '',
      partnerOrganization: r.partner_organization ?? '',
      outcome: r.outcome ?? '',
      notes: r.notes ?? '',
    })
    setShowForm(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (editingId) {
        await api(`/admin/community/${editingId}`, { method: 'PATCH', auth: true, body: form })
        addToast('success', 'Community record updated.')
      } else {
        await api('/admin/community', { method: 'POST', auth: true, body: form })
        addToast('success', 'Community record created.')
      }
      setShowForm(false)
      setEditingId(null)
      await load()
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Could not save record.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    setBusy(true)
    try {
      await api(`/admin/community/${deleteId}`, { method: 'DELETE', auth: true })
      addToast('success', 'Record deleted.')
      setDeleteId(null)
      await load()
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Could not delete record.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Community / Mission of Mercy</h1>
          <p className="mt-1 text-sm text-gray-500">
            Outreach support records (date, location, purpose, resources, partners, outcome). Do not store child PII or unauthorized images.
          </p>
        </div>
        <button type="button" onClick={startCreate} className="min-h-11 rounded-lg bg-luma-700 px-4 text-sm font-semibold text-white hover:bg-luma-800">
          Add record
        </button>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Search location, purpose, partner…" />

      {error && <ErrorState message={error} onRetry={load} />}

      {showForm && (
        <form onSubmit={save} className="grid gap-3 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="csr-date">Date</label>
            <input id="csr-date" type="date" required value={form.recordDate} onChange={(e) => setForm((f) => ({ ...f, recordDate: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="csr-location">Location</label>
            <input id="csr-location" required value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="csr-purpose">Purpose</label>
            <input id="csr-purpose" required value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="csr-resources">Resources used</label>
            <textarea id="csr-resources" value={form.resourcesUsed} onChange={(e) => setForm((f) => ({ ...f, resourcesUsed: e.target.value }))} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="csr-officials">Responsible officials</label>
            <input id="csr-officials" value={form.responsibleOfficials} onChange={(e) => setForm((f) => ({ ...f, responsibleOfficials: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="csr-partner">Partner / beneficiary org</label>
            <input id="csr-partner" value={form.partnerOrganization} onChange={(e) => setForm((f) => ({ ...f, partnerOrganization: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="csr-outcome">Outcome</label>
            <textarea id="csr-outcome" value={form.outcome} onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="csr-notes">Notes</label>
            <textarea id="csr-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-luma-700 px-4 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50">
              {busy ? 'Saving…' : editingId ? 'Update record' : 'Create record'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="min-h-11 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : records.length === 0 ? (
        <EmptyState title="No community records yet" message="Log outreach activities and Mission of Mercy support here." action={{ label: 'Add record', onClick: startCreate }} />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
          {records.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{r.purpose}</p>
                <p className="text-xs text-gray-500">
                  {r.record_date} · {r.location}
                  {r.partner_organization ? ` · ${r.partner_organization}` : ''}
                </p>
                {r.outcome && <p className="mt-1 text-sm text-gray-600">{r.outcome}</p>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => startEdit(r)} className="min-h-11 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">Edit</button>
                <button type="button" onClick={() => setDeleteId(r.id)} className="min-h-11 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete community record?"
        message="This removes the outreach log entry. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
