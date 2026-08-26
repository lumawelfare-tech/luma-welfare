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
    api<{ items: NewsItem[] }>('/news?resource=news')
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      {/* Page Hero */}
      <section className="bg-gradient-to-br from-luma-800 to-luma-900 py-16 lg:py-20">
        <div className="container-luma">
          <span className="text-sm font-semibold uppercase tracking-wider text-luma-300">Latest Updates</span>
          <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">News & Events</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            Updates from the welfare office and upcoming member events.
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <p className="mt-4 text-gray-500">No announcements yet. Check back soon.</p>
          </div>
        )}

        <div className="space-y-5">
          {items.map((n) => (
            <article key={n.id} className="rounded-2xl border border-gray-200 bg-white p-7 transition-all hover:shadow-md hover:border-luma-200">
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    n.type === 'event' ? 'bg-gold-400/20 text-gold-600' : 'bg-luma-50 text-luma-700'
                  }`}
                >
                  {n.type === 'event' ? 'Event' : 'News'}
                </span>
                {n.event_date && (
                  <time className="text-xs text-gray-500">{new Date(n.event_date).toDateString()}</time>
                )}
              </div>
              <h2 className="mt-3 text-xl font-bold text-gray-900">{n.title}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">{n.body}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
