import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useHead } from '../../lib/seo'

type Notification = {
  id: string
  channel: string
  subject: string | null
  body: string
  status: string
  created_at: string
  sent_at: string | null
}

export function Notifications() {
  useHead('Notifications', undefined, { noindex: true })
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  async function load() {
    try {
      const d = await api<{ notifications: Notification[] }>('/member/notifications', { auth: true })
      setNotifications(d.notifications ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications.')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line oxc/react/set-state-in-effect — loading initialized true; setLoading(false) in finally after await
  useEffect(() => { load() }, [])

  async function markRead(id: string) {
    setMarkingId(id)
    try {
      await api(`/member/notifications?id=${id}`, { method: 'PATCH', auth: true })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'sent', sent_at: new Date().toISOString() } : n))
    } catch {
      // Silently fail
    } finally {
      setMarkingId(null)
    }
  }

  async function markAllRead() {
    try {
      await api('/member/notifications?read_all=true', { method: 'PATCH', auth: true })
      setNotifications(prev => prev.map(n => ({ ...n, status: 'sent', sent_at: new Date().toISOString() })))
    } catch {
      // Silently fail
    }
  }

  const unreadCount = notifications.filter(n => n.status === 'queued').length
  const filtered = filter === 'unread'
    ? notifications.filter(n => n.status === 'queued')
    : notifications

  function timeAgo(dateStr: string): string {
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diff = Math.floor((now - then) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
    return new Date(dateStr).toLocaleDateString()
  }

  function channelIcon(channel: string) {
    switch (channel) {
      case 'email': return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
      )
      case 'sms': return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
      )
      default: return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
      )
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500">Stay updated on your claims, payments, and membership.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/notification-preferences" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px] flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Settings
          </Link>
          {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px] flex items-center"
          >
            Mark all read ({unreadCount})
          </button>
        )}
        </div>
      </div>

      {/* Filter tabs */}
      {!loading && notifications.length > 0 && (
        <div className="mt-6 flex gap-1 rounded-lg bg-gray-100 p-1" role="tablist">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors min-h-[44px] ${
              filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            role="tab"
            aria-selected={filter === 'all'}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors min-h-[44px] ${
              filter === 'unread' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            role="tab"
            aria-selected={filter === 'unread'}
          >
            Unread ({unreadCount})
          </button>
        </div>
      )}

      {loading && (
        <div className="mt-8 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2" role="alert">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          <span className="flex-1">{error}</span>
          <button onClick={() => { setError(null); setLoading(true); load() }} className="font-medium underline flex-shrink-0">Retry</button>
        </div>
      )}

      {!loading && !error && notifications.length === 0 && (
        <div className="mt-12 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-luma-50 text-luma-400">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">You're all caught up!</h2>
          <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
            When there are updates about your contributions, claims, or membership, they'll appear here.
          </p>
        </div>
      )}

      {!loading && !error && notifications.length > 0 && filtered.length === 0 && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-gray-900">No unread notifications</h3>
          <p className="mt-1 text-xs text-gray-500">You've read all your notifications.</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="mt-4 space-y-2">
          {filtered.map((n) => (
            <div
              key={n.id}
              className={`rounded-xl border p-4 transition-all ${
                n.status === 'queued'
                  ? 'border-luma-200 bg-luma-50/30 hover:bg-luma-50/60'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
                  n.status === 'queued' ? 'bg-luma-100 text-luma-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {channelIcon(n.channel)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">{n.subject ?? 'Notification'}</h3>
                    {n.status === 'queued' && (
                      <span className="h-2 w-2 rounded-full bg-luma-500" aria-label="Unread" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{n.body}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                    {n.status === 'queued' && (
                      <button
                        onClick={() => markRead(n.id)}
                        disabled={markingId === n.id}
                        className="text-xs font-medium text-luma-600 hover:text-luma-700 disabled:opacity-50 min-h-[44px] flex items-center"
                      >
                        {markingId === n.id ? 'Marking…' : 'Mark as read'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
