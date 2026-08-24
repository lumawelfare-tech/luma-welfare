import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'

type GalleryItem = {
  id: string
  title: string | null
  image_url: string
  caption: string | null
  created_at: string
}

export function AdminGallery() {
  useHead('Gallery', undefined, { noindex: true })
  const [items, setItems] = useState<GalleryItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<GalleryItem | null>(null)
  const [form, setForm] = useState({ title: '', caption: '', image_url: '' })
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    try {
      const d = await api<{ items: GalleryItem[] }>('/gallery?resource=gallery', { auth: true })
      setItems(d.items ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load gallery.')
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ title: '', caption: '', image_url: '' })
    setShowForm(true)
  }

  function openEdit(item: GalleryItem) {
    setEditing(item)
    setForm({ title: item.title ?? '', caption: item.caption ?? '', image_url: item.image_url })
    setShowForm(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (editing) {
        await api(`/admin/settings/${editing.id}`, { method: 'PATCH', auth: true, body: { ...form, resource: 'gallery_items' } })
        setNotice('Image updated.')
      } else {
        await api('/admin/settings', { method: 'POST', auth: true, body: { ...form, resource: 'gallery_items' } })
        setNotice('Image added.')
      }
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.')
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this image? This cannot be undone.')) return
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
          <h1 className="text-2xl font-bold text-gray-900">Gallery</h1>
          <p className="mt-1 text-sm text-gray-500">Manage gallery images and media.</p>
        </div>
        <button onClick={openCreate} className="rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-colors">
          + Add Image
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

      {showForm && (
        <form onSubmit={save} className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-gray-900">{editing ? 'Edit Image' : 'Add Image'}</h2>
          <div className="mt-4 space-y-3">
            <input value={form.image_url} onChange={(e) => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="Image URL" required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title (optional)" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <input value={form.caption} onChange={(e) => setForm(f => ({ ...f, caption: e.target.value }))} placeholder="Caption (optional)" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <div className="flex gap-2">
              <button type="submit" className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800">Save</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </form>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="group overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="aspect-video overflow-hidden bg-gray-100">
              <img src={item.image_url} alt={item.title ?? 'Gallery image'} className="h-full w-full object-cover" />
            </div>
            <div className="p-3">
              {item.title && <div className="font-medium text-gray-900 text-sm truncate">{item.title}</div>}
              {item.caption && <div className="mt-0.5 text-xs text-gray-500 truncate">{item.caption}</div>}
              <div className="mt-2 flex gap-2">
                <button onClick={() => openEdit(item)} className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">Edit</button>
                <button disabled={busyId === item.id} onClick={() => remove(item.id)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="col-span-full rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">No images yet.</div>}
      </div>
    </div>
  )
}
