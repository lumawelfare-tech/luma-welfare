import { useEffect, useState, useRef } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { useToast } from '../../components/Toast'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonRow } from '../../components/Skeleton'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

type NewsEvent = {
  id: string
  title: string
  body: string
  type: 'news' | 'event'
  slug: string | null
  excerpt: string | null
  cover_image: string | null
  event_date: string | null
  event_time: string | null
  location: string | null
  is_published: boolean
  is_featured: boolean
  published_at: string | null
  created_at: string
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024

export function AdminNews() {
  useHead('News & Events', undefined, { noindex: true })
  const { addToast } = useToast()
  const [items, setItems] = useState<NewsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<NewsEvent | null>(null)
  const [form, setForm] = useState({
    title: '', body: '', type: 'news' as 'news' | 'event',
    excerpt: '', event_date: '', event_time: '', location: '', is_featured: false,
  })
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [filter, setFilter] = useState<{ type?: string; status?: string }>({})
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<NewsEvent | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    try {
      let path = '/admin/news'
      const params = new URLSearchParams()
      if (filter.type) params.set('type', filter.type)
      if (filter.status) params.set('status', filter.status)
      const qs = params.toString()
      if (qs) path += `?${qs}`
      const d = await api<{ items: NewsEvent[] }>(path, { auth: true })
      setItems(d.items ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load news.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  function openCreate() {
    setEditing(null)
    setForm({ title: '', body: '', type: 'news', excerpt: '', event_date: '', event_time: '', location: '', is_featured: false })
    setCoverPreview(null)
    setShowForm(true)
  }

  function openEdit(item: NewsEvent) {
    setEditing(item)
    setForm({
      title: item.title, body: item.body, type: item.type,
      excerpt: item.excerpt ?? '', event_date: item.event_date?.split('T')[0] ?? '',
      event_time: item.event_time ?? '', location: item.location ?? '', is_featured: item.is_featured,
    })
    setCoverPreview(item.cover_image)
    setShowForm(true)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ACCEPTED.includes(file.type)) { addToast('error', 'Only JPG, PNG, WEBP accepted.'); return }
    if (file.size > MAX_SIZE) { addToast('error', 'Max 5MB.'); return }
    setError(null)
    const reader = new FileReader()
    reader.onload = () => setCoverPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        ...form,
        event_date: form.event_date || null,
        event_time: form.event_time || null,
        location: form.location || null,
        excerpt: form.excerpt || null,
      }

      if (fileRef.current?.files?.[0]) {
        const file = fileRef.current.files[0]
        const dataUrl = await fileToBase64(file)
        payload.cover_image_data = dataUrl
        payload.cover_image_filename = file.name
      } else if (!editing) {
        payload.cover_image = null
      } else if (editing && coverPreview === null && editing.cover_image) {
        payload.cover_image = null
      }

      if (editing) {
        await api(`/admin/news/${editing.id}`, { method: 'PATCH', auth: true, body: payload })
        addToast('success', 'Item updated.')
      } else {
        await api('/admin/news', { method: 'POST', auth: true, body: payload })
        addToast('success', 'Item created as draft.')
      }
      setShowForm(false)
      setCoverPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not save.'
      addToast('error', msg)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function togglePublish(item: NewsEvent) {
    setBusyId(item.id)
    try {
      await api(`/admin/news/${item.id}`, { method: 'PATCH', auth: true, body: { is_published: !item.is_published } })
      addToast('success', item.is_published ? 'Unpublished.' : 'Published.')
      await load()
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Could not update.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(item: NewsEvent) {
    setBusyId(item.id)
    try {
      await api(`/admin/news/${item.id}`, { method: 'DELETE', auth: true })
      addToast('success', 'Item deleted.')
      await load()
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Could not delete.')
    } finally {
      setBusyId(null)
      setConfirmDelete(null)
    }
  }

  const filtered = debouncedSearch
    ? items.filter(i => i.title.toLowerCase().includes(debouncedSearch.toLowerCase()) || i.body.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : items

  return (
    <div className="py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">News & Events</h1>
          <p className="mt-1 text-sm text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} className="rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-colors">
          + New Item
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {showForm && (
        <form onSubmit={save} className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-gray-900">{editing ? 'Edit Item' : 'New Item'}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-3 md:col-span-2">
              <div className="flex gap-3">
                <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value as 'news' | 'event' }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <option value="news">News</option>
                  <option value="event">Event</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm(f => ({ ...f, is_featured: e.target.checked }))} className="rounded" />
                  Featured
                </label>
              </div>
              <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title" required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
              <input value={form.excerpt} onChange={(e) => setForm(f => ({ ...f, excerpt: e.target.value }))} placeholder="Excerpt / summary (optional)" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
              <textarea value={form.body} onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Content" rows={8} required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Cover Image</label>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-luma-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-luma-700 hover:file:bg-luma-100" />
                <p className="mt-1 text-xs text-gray-400">JPG, PNG, WEBP. Max 5MB.</p>
              </div>
              {coverPreview && (
                <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <img src={coverPreview} alt="Cover preview" className="max-h-40 w-full object-contain" />
                  <button type="button" onClick={() => { setCoverPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                    className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )}
            </div>

            {form.type === 'event' && (
              <div className="space-y-3">
                <input type="date" value={form.event_date} onChange={(e) => setForm(f => ({ ...f, event_date: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                <input type="time" value={form.event_time} onChange={(e) => setForm(f => ({ ...f, event_time: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                <input value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Location (optional)" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-60">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setCoverPreview(null) }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-wrap gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500" />
        <select value={filter.type ?? ''} onChange={(e) => setFilter(f => ({ ...f, type: e.target.value || undefined }))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="">All types</option>
          <option value="news">News</option>
          <option value="event">Events</option>
        </select>
        <select value={filter.status ?? ''} onChange={(e) => setFilter(f => ({ ...f, status: e.target.value || undefined }))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Items list */}
      {loading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4">
              {item.cover_image && (
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  <img src={item.cover_image} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.type === 'event' ? 'bg-gold-400/20 text-gold-600' : 'bg-luma-50 text-luma-700'}`}>
                    {item.type === 'event' ? 'Event' : 'News'}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.is_published ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {item.is_published ? 'Published' : 'Draft'}
                  </span>
                  {item.is_featured && <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">Featured</span>}
                  {item.slug && <span className="text-[10px] text-gray-400">/{item.slug}</span>}
                </div>
                <h3 className="mt-1 font-medium text-gray-900">{item.title}</h3>
                {item.excerpt && <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{item.excerpt}</p>}
                <div className="mt-1 flex gap-3 text-[10px] text-gray-400">
                  {item.event_date && <span>Event: {new Date(item.event_date).toLocaleDateString()}{item.event_time ? ` ${item.event_time}` : ''}</span>}
                  {item.location && <span>📍 {item.location}</span>}
                  <span>Created {new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button disabled={busyId === item.id} onClick={() => togglePublish(item)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  {item.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button onClick={() => openEdit(item)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Edit</button>
                <button disabled={busyId === item.id} onClick={() => setConfirmDelete(item)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <EmptyState
              icon="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5"
              title={debouncedSearch || filter.type || filter.status ? 'No items match your filters' : 'No news or events yet'}
              message={debouncedSearch || filter.type || filter.status ? 'Try adjusting your filters.' : 'Create your first news item or event.'}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Item"
        message={`Delete "${confirmDelete?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={busyId === confirmDelete?.id}
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
