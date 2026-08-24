import { useEffect, useState, useRef } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'

type GalleryItem = {
  id: string
  title: string | null
  image_url: string
  caption: string | null
  created_at: string
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export function AdminGallery() {
  useHead('Gallery', undefined, { noindex: true })
  const [items, setItems] = useState<GalleryItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<GalleryItem | null>(null)
  const [form, setForm] = useState({ title: '', caption: '' })
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const d = await api<{ items: GalleryItem[] }>('/admin/gallery', { auth: true })
      setItems(d.items ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load gallery.')
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ title: '', caption: '' })
    setPreview(null)
    setSelectedFile(null)
    setShowForm(true)
  }

  function openEdit(item: GalleryItem) {
    setEditing(item)
    setForm({ title: item.title ?? '', caption: item.caption ?? '' })
    setPreview(item.image_url)
    setSelectedFile(null)
    setShowForm(true)
  }

  function validateAndPreview(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Please upload a JPEG, PNG, or WEBP image.')
      return
    }
    if (file.size > MAX_SIZE) {
      setError('Image must be 5MB or smaller.')
      return
    }
    setError(null)
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) validateAndPreview(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) validateAndPreview(file)
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
    setNotice(null)
    setUploading(true)

    try {
      const body: Record<string, unknown> = {
        title: form.title || null,
        caption: form.caption || null,
      }

      if (selectedFile) {
        body.image_data = await fileToBase64(selectedFile)
        body.image_filename = selectedFile.name
      } else if (!editing) {
        setError('Please select an image.')
        setUploading(false)
        return
      }

      if (editing) {
        await api(`/admin/gallery/${editing.id}`, {
          method: 'PATCH', auth: true,
          body,
        })
        setNotice('Image updated.')
      } else {
        await api('/admin/gallery', {
          method: 'POST', auth: true,
          body,
        })
        setNotice('Image uploaded.')
      }
      setShowForm(false)
      setPreview(null)
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  async function remove(item: GalleryItem) {
    if (!confirm('Delete this image? This cannot be undone.')) return
    setBusyId(item.id)
    setError(null)
    try {
      await api(`/admin/gallery/${item.id}`, { method: 'DELETE', auth: true })
      setNotice('Image deleted.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete.')
    } finally {
      setBusyId(null)
    }
  }

  const filtered = search
    ? items.filter(i => (i.title?.toLowerCase().includes(search.toLowerCase())) || (i.caption?.toLowerCase().includes(search.toLowerCase())))
    : items

  return (
    <div className="py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gallery</h1>
          <p className="mt-1 text-sm text-gray-500">{items.length} image{items.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} className="rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-colors">
          + Upload Image
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

      {showForm && (
        <form onSubmit={save} className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-gray-900">{editing ? 'Edit Image' : 'Upload Image'}</h2>
          <div className="mt-4 space-y-4">
            {/* File upload with drag-and-drop */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Image</label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                  dragOver ? 'border-luma-500 bg-luma-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect}
                  className="absolute inset-0 cursor-pointer opacity-0" />
                <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="mt-2 text-sm text-gray-600">Click or drag to upload</p>
                <p className="mt-1 text-xs text-gray-400">JPG, PNG, WEBP. Max 5MB.</p>
              </div>
              {selectedFile && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-medium">{selectedFile.name}</span>
                  <span>({formatSize(selectedFile.size)})</span>
                  <button type="button" onClick={() => { setSelectedFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = '' }} className="text-red-500 hover:text-red-700">Remove</button>
                </div>
              )}
            </div>

            {/* Preview */}
            {preview && (
              <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                <img src={preview} alt="Preview" className="max-h-48 w-full object-contain" />
                <button type="button" onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}

            <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title (optional)" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />
            <input value={form.caption} onChange={(e) => setForm(f => ({ ...f, caption: e.target.value }))} placeholder="Caption (optional)" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500" />

            <div className="flex gap-2">
              <button type="submit" disabled={uploading} className="rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-60">
                {uploading ? 'Uploading…' : editing ? 'Save Changes' : 'Upload'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setPreview(null) }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="mt-6">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search gallery…"
          className="w-full max-w-sm rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-luma-500" />
      </div>

      {/* Image grid */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((item) => (
          <div key={item.id} className="group overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="aspect-square overflow-hidden bg-gray-100">
              <img src={item.image_url} alt={item.title ?? 'Gallery image'} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
            </div>
            <div className="p-3">
              {item.title && <div className="font-medium text-gray-900 text-sm truncate">{item.title}</div>}
              {item.caption && <div className="mt-0.5 text-xs text-gray-500 truncate">{item.caption}</div>}
              <div className="mt-1 text-[10px] text-gray-400">{new Date(item.created_at).toLocaleDateString()}</div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => openEdit(item)} className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">Edit</button>
                <button disabled={busyId === item.id} onClick={() => remove(item)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="col-span-full rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
          {search ? 'No images match your search.' : 'No images yet. Upload one to get started.'}
        </div>}
      </div>
    </div>
  )
}
