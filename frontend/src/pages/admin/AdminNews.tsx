import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'

type NewsEvent = {
  id: string
  title: string
  body: string
  type: 'news' | 'event'
  event_date: string | null
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

export function AdminNews() {
  useHead('News & Events', undefined, { noindex: true })
  const [items, setItems] = useState<NewsEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<NewsEvent | null>(null)
  const [form, setForm] = useState({ title: '', body: '', type: 'news' as 'news' | 'event', event_date: '' })
  const [filter, setFilter] = useState<{ type?: string; status?: string }>({})
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
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
    }
  }

  useEffect(() => { load() }, [filter])

  function openCreate() {
    setEditing(null)
    setForm({ title: '', body: '', type: 'news', event_date: '' })
    setShowForm(true)
  }

  function openEdit(item: NewsEvent) {
    setEditing(item)
    setForm({
      title: item.title,
      body: item.body,
      type: item.type,
      event_date: item.event_date?.split('T')[0] ?? '',
    })
    setShowForm(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSaving(true)
    try {
      if (editing) {
        await api(`/admin/news/${editing.id}`, {
          method: 'PATCH', auth: true,
          body: { title: form.title, body: form.body, type: form.type, event_date: form.event_date || null },
        })
        setNotice('Item updated.')
      } else {
        await api('/admin/news', {
          method: 'POST', auth: true,
          body: { title: form.title, body: form.body, type: form.type, event_date: form.event_date || null },
        })
        setNotice('Item created as draft.')
      }
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function togglePublish(item: NewsEvent) {
    setBusyId(item.id)
    try {
      await api(`/admin/news/${item.id}`, {
        method: 'PATCH', auth: true,
        body: { is_published: !item.is_published },
      })
      setNotice(item.is_published ? 'Unpublished.' : 'Published.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(item: NewsEvent) {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    setBusyId(item.id)
    try {
      await api(`/admin/news/${item.id}`, { method: 'DELETE', auth: true })
      setNotice('Item deleted.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete.')
    } finally {
      setBusyId(null)
    }
  }

  const filtered = search
    ? items.filter(i => i.title.toLowerCase().includes(search.toLowerCase()) || i.body.toLowerCase().includes(search.toLowerCase()))
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
      {notice && <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

      {showForm && (
        <form onSubmit={save} className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-gray-900">{editing ? 'Edit Item' : 'New Item'}</h2>
          <div className="mt-4 space-y-3">
            <div className="flex gap-3">
              <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value as 'news' | 'event' }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="news">News</option>
                <option value="event">Event</option>
              </select>
              {form.type === 'event' && (
                <input type="date" value={form.event_date} onChange={(e) => setForm(f => ({ ...f, event_date: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              )}
            </div>
            <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title" required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <textarea value={form.body} onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Content" rows={8} required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-60">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-wrap gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500" />
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
      <div className="mt-4 space-y-3">
        {filtered.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.type === 'event' ? 'bg-gold-400/20 text-gold-600' : 'bg-luma-50 text-luma-700'}`}>
                  {item.type === 'event' ? 'Event' : 'News'}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.is_published ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {item.is_published ? 'Published' : 'Draft'}
                </span>
                {item.published_at && (
                  <span className="text-[10px] text-gray-400">Published {new Date(item.published_at).toLocaleDateString()}</span>
                )}
              </div>
              <h3 className="mt-1 font-medium text-gray-900">{item.title}</h3>
              <p className="mt-0.5 text-sm text-gray-500 line-clamp-2">{item.body}</p>
              {item.event_date && (
                <p className="mt-1 text-xs text-gray-400">Event date: {new Date(item.event_date).toLocaleDateString()}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button disabled={busyId === item.id} onClick={() => togglePublish(item)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                {item.is_published ? 'Unpublish' : 'Publish'}
              </button>
              <button onClick={() => openEdit(item)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Edit</button>
              <button disabled={busyId === item.id} onClick={() => remove(item)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
            {search || filter.type || filter.status ? 'No items match your filters.' : 'No news or events yet. Create one to get started.'}
          </div>
        )}
      </div>
    </div>
  )
}
