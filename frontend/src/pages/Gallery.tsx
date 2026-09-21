import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useHead } from '../lib/seo'
import { PageHero } from '../components/PageHero'
import { MotionSection, MotionCard } from '../components/MotionSection'
import { SkeletonCard } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'

type GalleryItem = {
  id: string
  title: string | null
  image_url: string
  caption: string | null
}

export function Gallery() {
  useHead('Gallery', 'Photos from Luma Welfare events and member activities.', {
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Gallery', path: '/gallery' },
    ],
  })
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api<{ items: GalleryItem[] }>('/gallery?resource=gallery')
      .then((d) => setItems(d.items))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load gallery.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <PageHero
        eyebrow="Visual Stories"
        title="Gallery"
        description="Photos from welfare events and member activities."
      />

      <MotionSection as="div" className="container-luma py-14">
        {loading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </div>
        )}

        {!loading && error && (
          <EmptyState
            title="Couldn’t load gallery"
            message={error}
            icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            action={{ label: 'Retry', onClick: load }}
          />
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            title="No photos yet"
            message="We will add pictures from upcoming events."
            icon="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
            action={{ label: 'Retry', onClick: load }}
          />
        )}

        {!loading && !error && items.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((g) => (
              <MotionCard key={g.id}>
                <figure className="glass-card group overflow-hidden">
                  <div className="overflow-hidden">
                    <img
                      src={g.image_url}
                      alt={g.title ?? 'Luma Welfare event'}
                      className="h-56 w-full object-cover transition-transform duration-[var(--motion-normal)] ease-[var(--luma-ease-out)] motion-reduce:transition-none group-hover:scale-[1.03]"
                    />
                  </div>
                  <figcaption className="px-5 py-4">
                    {g.title && <div className="font-bold text-gray-900">{g.title}</div>}
                    {g.caption && <div className="mt-1 text-xs text-gray-600">{g.caption}</div>}
                  </figcaption>
                </figure>
              </MotionCard>
            ))}
          </div>
        )}
      </MotionSection>
    </div>
  )
}
