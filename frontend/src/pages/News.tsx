import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useHead } from '../lib/seo'

type NewsItem = {
  id: string
  title: string
  body: string
  type: 'news' | 'event'
  event_date: string | null
  published_at: string | null
}

export function News() {
  useHead('News & Events', 'Updates from the Luma Welfare office and upcoming member events.')
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ items: NewsItem[] }>('/news')
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="container-luma py-14">
      <h1 className="text-3xl font-bold text-luma-900 sm:text-4xl">News & Events</h1>
      <p className="mt-3 max-w-2xl text-stone-600">
        Updates from the welfare office and upcoming member events.
      </p>

      {loading && <div className="py-16 text-center text-stone-500">Loading…</div>}
      {error && <div className="py-16 text-center text-red-600">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="py-16 text-center text-stone-500">
          No announcements yet. Check back soon.
        </div>
      )}

      <div className="mt-8 space-y-4">
        {items.map((n) => (
          <article key={n.id} className="rounded-xl border border-stone-200 bg-white p-6">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  n.type === 'event' ? 'bg-gold-400/20 text-gold-600' : 'bg-luma-50 text-luma-700'
                }`}
              >
                {n.type === 'event' ? 'Event' : 'News'}
              </span>
              {n.event_date && (
                <time className="text-xs text-stone-500">{new Date(n.event_date).toDateString()}</time>
              )}
            </div>
            <h2 className="mt-3 text-lg font-semibold text-luma-900">{n.title}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-700">{n.body}</p>
          </article>
        ))}
      </div>
    </div>
  )
}