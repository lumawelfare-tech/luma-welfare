import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useHead } from '../lib/seo'
import { PageHero } from '../components/PageHero'
import { MotionSection, MotionCard } from '../components/MotionSection'
import { SkeletonCard } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'

type NewsItem = {
  id: string
  title: string
  body: string
  type: 'news' | 'event'
  event_date: string | null
  published_at: string | null
}

export function News() {
  useHead('News & Events', 'Updates from the Luma Welfare office and upcoming member events.', {
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'News & Events', path: '/news' },
    ],
  })
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api<{ items: NewsItem[] }>('/news?resource=news')
      .then((d) => setItems(d.items))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load news.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <PageHero
        eyebrow="Latest Updates"
        title="News & Events"
        description="Updates from the welfare office and upcoming member events."
      />

      <MotionSection as="div" className="container-luma py-14">
        {loading && (
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} lines={4} />
            ))}
          </div>
        )}

        {!loading && error && (
          <EmptyState
            title="Couldn’t load news"
            message={error}
            icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            action={{ label: 'Retry', onClick: load }}
          />
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            title="No announcements yet"
            message="Check back soon for updates from the welfare office."
            icon="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            action={{ label: 'Retry', onClick: load }}
          />
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-5">
            {items.map((n) => (
              <MotionCard key={n.id} className="glass-card p-7" hover={false}>
                <article>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        n.type === 'event' ? 'bg-gold-400/20 text-gold-600' : 'bg-luma-50 text-luma-800'
                      }`}
                    >
                      {n.type === 'event' ? 'Event' : 'News'}
                    </span>
                    {n.event_date && (
                      <time className="text-xs text-gray-600">{new Date(n.event_date).toDateString()}</time>
                    )}
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-gray-900">{n.title}</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">{n.body}</p>
                </article>
              </MotionCard>
            ))}
          </div>
        )}
      </MotionSection>
    </div>
  )
}
