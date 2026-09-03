import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { useHead } from '../lib/seo'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type MediaItem = {
  id: string
  title: string
  description: string | null
  media_type: string
  file_url: string
  thumbnail_url: string | null
  mime_type: string | null
  file_size: number | null
  duration: number | null
  category: string | null
  tags: string[] | null
  is_featured: boolean
  sort_order: number
  created_at: string
}

type ApiResponse = {
  items: MediaItem[]
  total: number
  page: number
  per_page: number
  pages: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Photos' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documents' },
]

const PER_PAGE = 24

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Media() {
  useHead('Media', 'Explore Luma Welfare\'s latest photos, videos, publications and media content.')

  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [activeType, setActiveType] = useState('all')
  const [viewerItem, setViewerItem] = useState<MediaItem | null>(null)

  const load = useCallback(async (pageNum: number, type: string) => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      qs.set('resource', 'media')
      qs.set('page', String(pageNum))
      qs.set('per_page', String(PER_PAGE))
      if (type !== 'all') qs.set('type', type)

      const d = await api<ApiResponse>(`/media?${qs.toString()}`)
      setItems(d.items ?? [])
      setTotalCount(d.total ?? 0)
      setTotalPages(d.pages ?? 1)
      setPage(d.page ?? pageNum)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load media.')
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line oxc/react/set-state-in-effect — loading initialized true; setLoading(false) in finally after await
  useEffect(() => { load(1, activeType) }, [activeType, load])

  return (
    <div>
      {/* ---- Hero ---- */}
      <section className="bg-gradient-to-br from-luma-800 to-luma-900 py-16 lg:py-20">
        <div className="container-luma">
          <span className="text-sm font-semibold uppercase tracking-wider text-luma-300">Our Content</span>
          <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">Media</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            Explore Luma Welfare's latest photos, videos, publications and media content.
          </p>
          <div className="mt-3 h-1 w-12 rounded-full bg-luma-400" />
        </div>
      </section>

      {/* ---- Featured ---- */}
      {!loading && items.some((i) => i.is_featured) && activeType === 'all' && page === 1 && (
        <section className="bg-luma-50 py-10">
          <div className="container-luma">
            <h2 className="text-lg font-bold text-gray-900">Featured</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.filter((i) => i.is_featured).slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setViewerItem(item)}
                  className="group overflow-hidden rounded-xl border border-luma-200 bg-white text-left transition-all hover:shadow-lg hover:border-luma-300"
                >
                  <div className="aspect-video overflow-hidden bg-gray-100">
                    {item.media_type === 'image' ? (
                      <img src={item.thumbnail_url || item.file_url} alt={item.title}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d={typeIcon(item.media_type)} />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="font-semibold text-gray-900 text-sm">{item.title}</div>
                    <div className="mt-1 text-xs text-gray-500 capitalize">{item.media_type}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---- Main content ---- */}
      <div className="container-luma py-14">
        {/* Type filter tabs */}
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setActiveType(f.value); setPage(1) }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeType === f.value
                  ? 'bg-luma-700 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
          {totalCount > 0 && (
            <span className="ml-auto flex items-center text-sm text-gray-500">
              {totalCount} item{totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-100 bg-white">
                <div className="aspect-square bg-gray-200 rounded-t-xl" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-16 text-center text-red-600">{error}</div>
        )}

        {/* Empty */}
        {!loading && !error && items.length === 0 && (
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </div>
            <p className="mt-4 text-gray-500">No media available yet. Check back soon for updates.</p>
          </div>
        )}

        {/* Media grid */}
        {!loading && !error && items.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => setViewerItem(item)}
                className="group overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition-all hover:shadow-lg hover:border-luma-200"
              >
                {/* Thumbnail */}
                <div className="relative aspect-square overflow-hidden bg-gray-100">
                  {item.media_type === 'image' ? (
                    <img src={item.thumbnail_url || item.file_url} alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d={typeIcon(item.media_type)} />
                      </svg>
                    </div>
                  )}

                  {/* Type badge */}
                  <span className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-700 shadow-sm capitalize">
                    {item.media_type}
                  </span>

                  {item.is_featured && (
                    <span className="absolute right-2 top-2 rounded-md bg-luma-600/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                      ★ Featured
                    </span>
                  )}

                  {/* Hover play/view icon */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors opacity-0 group-hover:opacity-100">
                    <div className="rounded-full bg-white/90 p-3 shadow-lg">
                      <svg className="h-6 w-6 text-luma-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 text-sm line-clamp-1">{item.title}</h3>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    {item.category && <span>{item.category}</span>}
                    {item.category && <span>·</span>}
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1, activeType)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="px-3 text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => load(page + 1, activeType)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* ---- Viewer Modal ---- */}
      {viewerItem && (
        <ViewerModal item={viewerItem} onClose={() => setViewerItem(null)} />
      )}
    </div>
  )
}

/* ================================================================== */
/*  Viewer Modal                                                        */
/* ================================================================== */

function ViewerModal({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`View: ${item.title}`}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
          aria-label="Close viewer"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-col">
          {/* Media content */}
          {item.media_type === 'image' && (
            <img src={item.thumbnail_url || item.file_url} alt={item.title}
              className="max-h-[60vh] w-full object-contain bg-gray-50" />
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
                className="mt-4 rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-colors">
                Open Document
              </a>
            </div>
          )}

          {/* Metadata */}
          <div className="border-t border-gray-100 p-5">
            <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
            {item.description && <p className="mt-1 text-sm text-gray-600">{item.description}</p>}
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
              <span className="rounded bg-gray-100 px-2 py-0.5 font-medium capitalize">{item.media_type}</span>
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
  )
}
