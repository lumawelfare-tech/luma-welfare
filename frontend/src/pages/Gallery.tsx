import { useEffect, useState } from 'react'
import { api } from '../lib/api'

type GalleryItem = {
  id: string
  title: string | null
  image_url: string
  caption: string | null
}

export function Gallery() {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ items: GalleryItem[] }>('/gallery')
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="container-luma py-14">
      <h1 className="text-3xl font-bold text-luma-900 sm:text-4xl">Gallery</h1>
      <p className="mt-3 max-w-2xl text-stone-600">
        Photos from welfare events and member activities.
      </p>

      {loading && <div className="py-16 text-center text-stone-500">Loading…</div>}
      {error && <div className="py-16 text-center text-red-600">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="py-16 text-center text-stone-500">
          No photos yet. We will add pictures from upcoming events.
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((g) => (
          <figure key={g.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <img src={g.image_url} alt={g.title ?? 'Luma Welfare event'} className="h-56 w-full object-cover" />
            <figcaption className="px-4 py-3">
              {g.title && <div className="text-sm font-semibold text-luma-900">{g.title}</div>}
              {g.caption && <div className="mt-0.5 text-xs text-stone-500">{g.caption}</div>}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}