import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useHead } from '../lib/seo'

type GalleryItem = {
  id: string
  title: string | null
  image_url: string
  caption: string | null
}

export function Gallery() {
  useHead('Gallery', 'Photos from Luma Welfare events and member activities.')
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ items: GalleryItem[] }>('/gallery?resource=gallery')
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      {/* Page Hero */}
      <section className="bg-gradient-to-br from-luma-800 to-luma-900 py-16 lg:py-20">
        <div className="container-luma">
          <span className="text-sm font-semibold uppercase tracking-wider text-luma-300">Visual Stories</span>
          <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">Gallery</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            Photos from welfare events and member activities.
          </p>
          <div className="mt-3 h-1 w-12 rounded-full bg-luma-400" />
        </div>
      </section>

      <div className="container-luma py-14">
        {loading && <div className="py-16 text-center text-gray-500">Loading…</div>}
        {error && <div className="py-16 text-center text-red-600">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </div>
            <p className="mt-4 text-gray-500">No photos yet. We will add pictures from upcoming events.</p>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((g) => (
            <figure key={g.id} className="group overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all hover:shadow-lg hover:border-luma-200">
              <div className="overflow-hidden">
                <img src={g.image_url} alt={g.title ?? 'Luma Welfare event'} className="h-56 w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              </div>
              <figcaption className="px-5 py-4">
                {g.title && <div className="font-bold text-gray-900">{g.title}</div>}
                {g.caption && <div className="mt-1 text-xs text-gray-500">{g.caption}</div>}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  )
}
