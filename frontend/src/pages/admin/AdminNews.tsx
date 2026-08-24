import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'

type NewsEvent = {
  id: string
  title: string
  body: string
  type: 'news' | 'event'
  event_date: string | null
  published_at: string | null
  is_published: boolean
  created_at: string
}

export function AdminNews() {
  useHead('News & Events', undefined, { noindex: true })
  const [items, setItems] = useState<NewsEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<NewsEvent | null>(null)
  const [form, setForm] = useState({ title: '', body: '', type: 'news' as 'news' | 'event', event_date: '' })
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    try {
      const d = await api<{ items: NewsEvent[] }>('/admin/settings?resource=news_events', { auth: true })
      setItems(d.items ?? [])
    } catch {
      // Fallback: try public-data
      try {
        const d = await api<{ items: NewsEvent[] }>('/news?resource=news', { auth: true })
        setItems(d.items ?? [])
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not load news.')
      }
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ title: '', body: '', type: 'news', event_date: '' })
    setShowForm(true)
  }

  function openEdit(item: NewsEvent) {
    setEditing(item)
    setForm({ title: item.title, body: item.body, type: item.type, event_date: item.event_date?.split('T')[0] ?? '' })
    setShowForm(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (editing) {
        await api(`/admin/settings/${editing.id}`, { method: 'PATCH', auth: true, body: form })
        setNotice('Item updated.')
      } else {
        await api('/admin/settings', { method: 'POST', auth: true, body: { ...form, resource: 'news_events' } })
        setNotice('Item created.')
      }
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.')
    }
  }

  async function togglePublish(item: NewsEvent) {
    setBusyId(item.id)
    try {
      await api(`/admin/settings/${item.id}`, { method: 'PATCH', auth: true, body: { is_published: !item.is_published } })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this item? This cannot be undone.')) return
    setBusyId(id)
    try {
      await api(`/admin/settings/${id}`, { method: 'DELETE', auth: true })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">News & Events</h1>
          <p className="mt-1 text-sm text-gray-500">Manage news articles and upcoming events.</p>
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
            <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value as 'news' | 'event' }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="news">News</option>
              <option value="event">Event</option>
            </select>
            <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title" required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <textarea value={form.body} onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Content" rows={6} required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            {form.type === 'event' && (
              <input type="date" value={form.event_date} onChange={(e) => setForm(f => ({ ...f, event_date: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            )}
            <div className="flex gap-2">
              <button type="submit" className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800">Save</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </form>
      )}

      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.type === 'event' ? 'bg-gold-400/20 text-gold-600' : 'bg-luma-50 text-luma-700'}`}>
                  {item.type === 'event' ? 'Event' : 'News'}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.is_published ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {item.is_published ? 'Published' : 'Draft'}
                </span>
              </div>
              <h3 className="mt-1 font-medium text-gray-900 truncate">{item.title}</h3>
              <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{item.body}</p>
            </div>
            <div className="ml-4 flex items-center gap-2">
              <button disabled={busyId === item.id} onClick={() => togglePublish(item)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                {item.is_published ? 'Unpublish' : 'Publish'}
              </button>
              <button onClick={() => openEdit(item)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Edit</button>
              <button disabled={busyId === item.id} onClick={() => remove(item.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">No news or events yet.</div>}
      </div>
    </div>
  )
}
