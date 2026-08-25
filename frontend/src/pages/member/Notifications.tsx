import { useEffect, useState } from 'react'
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
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Mark all read ({unreadCount})
          </button>
        )}
      </div>

      {loading && (
        <div className="mt-8 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button onClick={() => { setError(null); setLoading(true); load() }} className="ml-3 font-medium underline">Retry</button>
        </div>
      )}

      {!loading && !error && notifications.length === 0 && (
        <div className="mt-12 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">No notifications yet</h2>
          <p className="mt-2 text-sm text-gray-500">You'll see updates about your claims, payments, and membership here.</p>
        </div>
      )}

      {!loading && !error && notifications.length > 0 && (
        <div className="mt-6 space-y-2">
          {notifications.map((n) => (
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
                      <span className="h-2 w-2 rounded-full bg-luma-500" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{n.body}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                    {n.status === 'queued' && (
                      <button
                        onClick={() => markRead(n.id)}
                        disabled={markingId === n.id}
                        className="text-xs font-medium text-luma-600 hover:text-luma-700 disabled:opacity-50"
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
