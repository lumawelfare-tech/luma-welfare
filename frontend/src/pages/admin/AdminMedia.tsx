import { useEffect, useState, useRef, useCallback } from 'react'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { useToast } from '../../components/Toast'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonCard } from '../../components/Skeleton'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type MediaItem = {
  id: string
  title: string
  description: string | null
  media_type: string
  file_url: string
  storage_path: string | null
  thumbnail_url: string | null
  mime_type: string | null
  file_size: number | null
  duration: number | null
  category: string | null
  tags: string[] | null
  is_published: boolean
  is_featured: boolean
  sort_order: number
  created_at: string
  updated_at: string
  created_by: string | null
}

type ApiResponse = {
  items: MediaItem[]
  total: number
  page: number
  per_page: number
  pages: number
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ACCEPTED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ACCEPTED_VIDEO = ['video/mp4', 'video/webm']
const ACCEPTED_AUDIO = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a']
const ACCEPTED_DOCS = ['application/pdf']
const ALL_ACCEPTED = [...ACCEPTED_IMAGE, ...ACCEPTED_VIDEO, ...ACCEPTED_AUDIO, ...ACCEPTED_DOCS]
const MAX_SIZE = 50 * 1024 * 1024 // 50MB

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documents' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
]

const FEATURED_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'true', label: 'Featured' },
  { value: 'false', label: 'Not Featured' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'title_asc', label: 'Title A–Z' },
  { value: 'title_desc', label: 'Title Z–A' },
]

const PER_PAGE = 24

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function detectMediaType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'document'
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function typeIcon(type: string): string {
  switch (type) {
    case 'image':
      return 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z'
    case 'video':
      return 'M3.375 19.5h17.25c.621 0 1.125-.504 1.125-1.125v-15c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v15c0 .621.504 1.125 1.125 1.125zM12 10.5V19.5m-4.5-4.5h9'
    case 'audio':
      return 'M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V3.375a2.25 2.25 0 00-2.25-2.25H9.375A2.25 2.25 0 007.125 3.375V7.5'
    default:
      return 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'
  }
}

/* ------------------------------------------------------------------ */
/*  Upload form file entry                                              */
/* ------------------------------------------------------------------ */

type PendingFile = {
  file: File
  preview: string | null
  mediaType: string
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AdminMedia() {
  useHead('Media', undefined, { noindex: true })
  const { addToast } = useToast()

  /* ---- list state ---- */
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  /* ---- filters ---- */
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterFeatured, setFilterFeatured] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  /* ---- form / upload state ---- */
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<MediaItem | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    tags: '',
    is_published: false,
    is_featured: false,
    sort_order: 0,
  })
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /* ---- preview modal ---- */
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null)

  /* ---- edit/replace state ---- */
  const [replaceFile, setReplaceFile] = useState<PendingFile | null>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  /* ---- delete ---- */
  const [confirmDelete, setConfirmDelete] = useState<MediaItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  /* ---- error ---- */
  const [error, setError] = useState<string | null>(null)

  /* ---- categories (derived) ---- */
  const [categories, setCategories] = useState<string[]>([])

  /* ================================================================ */
  /*  Data loading                                                     */
  /* ================================================================ */

  const load = useCallback(async (pageNum = 1) => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      qs.set('page', String(pageNum))
      qs.set('per_page', String(PER_PAGE))
      if (debouncedSearch.trim()) qs.set('q', debouncedSearch.trim())
      if (filterType !== 'all') qs.set('type', filterType)
      if (filterStatus !== 'all') qs.set('status', filterStatus)
      if (filterFeatured !== 'all') qs.set('featured', filterFeatured)
      if (filterCategory !== 'all') qs.set('category', filterCategory)
      qs.set('sort', sortBy)

      const d = await api<ApiResponse>(`/admin/media?${qs.toString()}`, { auth: true })
      setItems(d.items ?? [])
      setTotalCount(d.total ?? 0)
      setTotalPages(d.pages ?? 1)
      setPage(d.page ?? pageNum)

      // Collect unique categories
      const cats = new Set<string>()
      for (const it of d.items ?? []) {
        if (it.category) cats.add(it.category)
      }
      setCategories((prev) => {
        const merged = new Set([...prev, ...cats])
        return [...merged].sort()
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load media.')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, filterType, filterStatus, filterFeatured, filterCategory, sortBy])

  useEffect(() => { load(1) }, [load])

  /* ================================================================ */
  /*  File validation & selection                                      */
  /* ================================================================ */

  function validateFile(file: File): string | null {
    if (!ALL_ACCEPTED.includes(file.type)) {
      return `"${file.name}" is not a supported file type.`
    }
    if (file.size > MAX_SIZE) {
      return `"${file.name}" exceeds the 50MB limit (${formatSize(file.size)}).`
    }
    return null
  }

  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    const newPending: PendingFile[] = []
    for (const f of files) {
      const err = validateFile(f)
      if (err) {
        addToast('error', err)
        continue
      }
      const mediaType = detectMediaType(f.type)
      let preview: string | null = null
      if (mediaType === 'image') {
        preview = URL.createObjectURL(f)
      }
      newPending.push({ file: f, preview, mediaType })
    }
    setPendingFiles((prev) => [...prev, ...newPending])
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => {
      const removed = prev[index]
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  /* ================================================================ */
  /*  Form open / close                                                */
  /* ================================================================ */

  function openCreate() {
    setEditing(null)
    setForm({ title: '', description: '', category: '', tags: '', is_published: false, is_featured: false, sort_order: 0 })
    setPendingFiles([])
    setReplaceFile(null)
    setError(null)
    setShowForm(true)
  }

  function openEdit(item: MediaItem) {
    setEditing(item)
    setForm({
      title: item.title,
      description: item.description ?? '',
      category: item.category ?? '',
      tags: (item.tags ?? []).join(', '),
      is_published: item.is_published,
      is_featured: item.is_featured,
      sort_order: item.sort_order,
    })
    setPendingFiles([])
    setReplaceFile(null)
    setError(null)
    setShowForm(true)
  }

  /* ================================================================ */
  /*  Save (create / update)                                           */
  /* ================================================================ */

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.title.trim()) {
      addToast('error', 'Title is required.')
      return
    }

    if (!editing && pendingFiles.length === 0) {
      addToast('error', 'Please select at least one file to upload.')
      return
    }

    setUploading(true)

    try {
      if (editing) {
        // Single-file update (with optional replacement)
        const body: Record<string, unknown> = {
          title: form.title.trim(),
          description: form.description || null,
          category: form.category || null,
          tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : null,
          is_published: form.is_published,
          is_featured: form.is_featured,
          sort_order: form.sort_order,
        }

        if (replaceFile) {
          setUploadProgress('Uploading new file…')
          body.file_data = await fileToBase64(replaceFile.file)
          body.file_filename = replaceFile.file.name
          body.media_type = replaceFile.mediaType
        }

        setUploadProgress('Saving…')
        await api(`/admin/media/${editing.id}`, { method: 'PATCH', auth: true, body })
        addToast('success', 'Media updated successfully.')
        setShowForm(false)
        setEditing(null)
        setReplaceFile(null)
        await load(page)
      } else {
        // Create one-by-one for multiple files
        for (let i = 0; i < pendingFiles.length; i++) {
          const pf = pendingFiles[i]
          setUploadProgress(`Uploading ${i + 1} of ${pendingFiles.length}…`)
          const tags = form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : null
          await api('/admin/media', {
            method: 'POST',
            auth: true,
            body: {
              title: pendingFiles.length === 1 ? form.title.trim() : pf.file.name.replace(/\.[^.]+$/, ''),
              description: form.description || null,
              category: form.category || null,
              tags,
              is_published: form.is_published,
              is_featured: form.is_featured,
              sort_order: form.sort_order,
              file_data: await fileToBase64(pf.file),
              file_filename: pf.file.name,
              media_type: pf.mediaType,
            },
          })
        }
        addToast('success', `${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''} uploaded successfully.`)
        setShowForm(false)
        setPendingFiles([])
        await load(1)
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not save. Please try again.'
      addToast('error', msg)
      setError(msg)
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }

  /* ================================================================ */
  /*  Quick actions                                                    */
  /* ================================================================ */

  async function togglePublished(item: MediaItem) {
    setBusyId(item.id)
    try {
      await api(`/admin/media/${item.id}`, {
        method: 'PATCH',
        auth: true,
        body: { is_published: !item.is_published },
      })
      addToast('success', item.is_published ? 'Unpublished.' : 'Published.')
      await load(page)
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Action failed.')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleFeatured(item: MediaItem) {
    setBusyId(item.id)
    try {
      await api(`/admin/media/${item.id}`, {
        method: 'PATCH',
        auth: true,
        body: { is_featured: !item.is_featured },
      })
      addToast('success', item.is_featured ? 'Removed from featured.' : 'Marked as featured.')
      await load(page)
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Action failed.')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteItem(item: MediaItem) {
    setBusyId(item.id)
    try {
      await api(`/admin/media/${item.id}`, { method: 'DELETE', auth: true })
      addToast('success', 'Media deleted.')
      await load(page)
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Could not delete.')
    } finally {
      setBusyId(null)
      setConfirmDelete(null)
    }
  }

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="py-6">
      {/* ---- Header ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Media</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage photos, videos, documents and other media published on the Luma Welfare website.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Upload Media
        </button>
      </div>

      {/* ---- Stats bar ---- */}
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg bg-gray-100 px-3 py-1.5 font-medium text-gray-700">
          {totalCount} item{totalCount !== 1 ? 's' : ''}
        </span>
        <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700">
          {items.filter((i) => i.is_published).length} published on this page
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ---- Upload / Edit Form ---- */}
      {showForm && (
        <form onSubmit={save} className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {editing ? 'Edit Media' : 'Upload Media'}
            </h2>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); setReplaceFile(null) }}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close form">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-5 space-y-5">
            {/* File upload zone (create mode) or replace zone (edit mode) */}
            {!editing ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Files</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                    dragOver ? 'border-luma-500 bg-luma-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept={ALL_ACCEPTED.join(',')}
                    onChange={handleFileSelect}
                    aria-label="Upload media files"
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                  <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-gray-700">Click or drag files to upload</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Images (JPG, PNG, WEBP, GIF) · Videos (MP4, WEBM) · Audio (MP3, WAV, M4A) · Documents (PDF) · Max 50MB each
                  </p>
                </div>

                {/* Pending files list */}
                {pendingFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {pendingFiles.map((pf, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        {pf.preview ? (
                          <img src={pf.preview} alt="" className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-200">
                            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d={typeIcon(pf.mediaType)} />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">{pf.file.name}</div>
                          <div className="text-xs text-gray-500">{formatSize(pf.file.size)} · {pf.mediaType}</div>
                        </div>
                        <button type="button" onClick={() => removePendingFile(i)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-red-600" aria-label={`Remove ${pf.file.name}`}>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Edit mode: replace file */
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Replace File (optional)</label>
                <div className="flex items-center gap-4">
                  {editing.thumbnail_url || editing.media_type === 'image' ? (
                    <img src={editing.thumbnail_url || editing.file_url} alt="" className="h-20 w-20 rounded-lg object-cover border border-gray-200" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-gray-100 border border-gray-200">
                      <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d={typeIcon(editing.media_type)} />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1">
                    <input ref={replaceRef} type="file" accept={ALL_ACCEPTED.join(',')}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) {
                          const err = validateFile(f)
                          if (err) { addToast('error', err); return }
                          setReplaceFile({ file: f, preview: URL.createObjectURL(f), mediaType: detectMediaType(f.type) })
                        }
                      }}
                      className="hidden" />
                    <button type="button" onClick={() => replaceRef.current?.click()}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      Choose new file
                    </button>
                    {replaceFile && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-medium">{replaceFile.file.name}</span>
                        <span>({formatSize(replaceFile.file.size)})</span>
                        <button type="button" onClick={() => setReplaceFile(null)} className="text-red-500 hover:text-red-700">Remove</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Metadata fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Media title"
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Category</label>
                <input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Events, News, Community"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Tags</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="Comma-separated tags"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Sort Order</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-luma-600 focus:ring-luma-500"
                />
                Publish immediately
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-luma-600 focus:ring-luma-500"
                />
                Featured
              </label>
            </div>

            {/* Upload progress */}
            {uploadProgress && (
              <div className="flex items-center gap-2 rounded-lg bg-luma-50 px-4 py-2 text-sm text-luma-700">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {uploadProgress}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={uploading || (!editing && pendingFiles.length === 0)}
                className="rounded-lg bg-luma-700 px-5 py-2 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? 'Saving…' : editing ? 'Save Changes' : `Upload ${pendingFiles.length > 1 ? `${pendingFiles.length} Files` : 'File'}`}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditing(null); setReplaceFile(null) }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ---- Filters & Search ---- */}
      <div className="mt-6 space-y-3">
        {/* Search */}
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search media…"
            aria-label="Search media"
            className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-luma-500 focus:ring-1 focus:ring-luma-500"
          />
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-2">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-luma-500">
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-luma-500">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filterFeatured} onChange={(e) => setFilterFeatured(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-luma-500">
            {FEATURED_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {categories.length > 0 && (
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-luma-500">
              <option value="all">All Categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-luma-500">
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* ---- Media Grid ---- */}
      {loading ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} lines={2} />)}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <div key={item.id} className="group overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:shadow-md">
              {/* Thumbnail */}
              <div className="relative aspect-square overflow-hidden bg-gray-100">
                {item.media_type === 'image' ? (
                  <img src={item.thumbnail_url || item.file_url} alt={item.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d={typeIcon(item.media_type)} />
                    </svg>
                  </div>
                )}

                {/* Status badges */}
                <div className="absolute left-2 top-2 flex gap-1">
                  <span className="rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-700 shadow-sm">
                    {item.media_type}
                  </span>
                  {!item.is_published && (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Draft</span>
                  )}
                  {item.is_featured && (
                    <span className="rounded-md bg-luma-100 px-2 py-0.5 text-[10px] font-semibold text-luma-700">★</span>
                  )}
                </div>

                {/* Hover actions overlay */}
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 group-hover:bg-black/30 transition-colors opacity-0 group-hover:opacity-100">
                  <button onClick={() => setPreviewItem(item)}
                    className="rounded-full bg-white/90 p-2 text-gray-700 hover:bg-white shadow-sm" aria-label="Preview">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                  <button onClick={() => openEdit(item)}
                    className="rounded-full bg-white/90 p-2 text-gray-700 hover:bg-white shadow-sm" aria-label="Edit">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <div className="font-medium text-gray-900 text-sm truncate" title={item.title}>{item.title}</div>
                {item.category && (
                  <div className="mt-0.5 text-xs text-gray-500">{item.category}</div>
                )}
                <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
                  <span>{item.file_size ? formatSize(item.file_size) : '—'}</span>
                  <span>·</span>
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>

                {/* Action buttons */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => togglePublished(item)}
                    disabled={busyId === item.id}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                      item.is_published
                        ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {item.is_published ? 'Published' : 'Draft'}
                  </button>
                  <button
                    onClick={() => toggleFeatured(item)}
                    disabled={busyId === item.id}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                      item.is_featured
                        ? 'border-luma-200 text-luma-700 hover:bg-luma-50'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {item.is_featured ? '★ Featured' : 'Feature'}
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmDelete(item)}
                    disabled={busyId === item.id}
                    className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="col-span-full">
              <EmptyState
                icon="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                title={debouncedSearch || filterType !== 'all' || filterStatus !== 'all' || filterFeatured !== 'all' || filterCategory !== 'all'
                  ? 'No media match your filters' : 'No media yet'}
                message={debouncedSearch || filterType !== 'all' || filterStatus !== 'all' || filterFeatured !== 'all' || filterCategory !== 'all'
                  ? 'Try adjusting your search or filters.'
                  : 'Upload photos, videos, documents and more to your media library.'}
                action={!debouncedSearch && filterType === 'all' && filterStatus === 'all' && filterFeatured === 'all' && filterCategory === 'all'
                  ? { label: 'Upload Media', onClick: openCreate } : undefined}
              />
            </div>
          )}
        </div>
      )}

      {/* ---- Pagination ---- */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-sm text-gray-500">
            Page {page} of {totalPages} · {totalCount} total
          </div>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => load(page + 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ================================================================
        Preview Modal
      ================================================================ */}
      {previewItem && (
        <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}

      {/* ================================================================
        Delete Confirmation
      ================================================================ */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Media"
        message={
          <span>
            Are you sure you want to delete <strong>"{confirmDelete?.title}"</strong>?
            This will remove it from the website and delete the associated stored file. This action cannot be undone.
          </span>
        }
        confirmLabel="Delete"
        variant="danger"
        loading={busyId === confirmDelete?.id}
        onConfirm={() => confirmDelete && deleteItem(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

/* ================================================================== */
/*  Preview Modal                                                       */
/* ================================================================== */

function PreviewModal({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Preview: ${item.title}`}>
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
          aria-label="Close preview"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="flex flex-col">
          {item.media_type === 'image' && (
            <img src={item.thumbnail_url || item.file_url} alt={item.title} className="max-h-[60vh] w-full object-contain bg-gray-50" />
          )}
          {item.media_type === 'video' && (
            <video src={item.file_url} controls className="max-h-[60vh] w-full bg-black" preload="metadata" />
          )}
          {item.media_type === 'audio' && (
            <div className="flex flex-col items-center justify-center bg-gray-50 p-12">
              <svg className="h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d={typeIcon('audio')} />
              </svg>
              <audio src={item.file_url} controls className="mt-4 w-full max-w-md" preload="metadata" />
            </div>
          )}
          {item.media_type === 'document' && (
            <div className="flex flex-col items-center justify-center bg-gray-50 p-12">
              <svg className="h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d={typeIcon('document')} />
              </svg>
              <a href={item.file_url} target="_blank" rel="noopener noreferrer"
                className="mt-4 rounded-lg bg-luma-700 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-800 transition-colors">
                Open Document
              </a>
            </div>
          )}

          {/* Metadata */}
          <div className="border-t border-gray-100 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                {item.description && <p className="mt-1 text-sm text-gray-600">{item.description}</p>}
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                  <span className="rounded bg-gray-100 px-2 py-0.5 font-medium">{item.media_type}</span>
                  {item.category && <span className="rounded bg-gray-100 px-2 py-0.5">{item.category}</span>}
                  {item.file_size && <span>{formatSize(item.file_size)}</span>}
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
                {item.tags && item.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-luma-50 px-2.5 py-0.5 text-[11px] font-medium text-luma-700">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
