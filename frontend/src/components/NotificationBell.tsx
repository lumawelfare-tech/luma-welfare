import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

type Notification = {
  id: string
  channel: string
  subject: string | null
  body: string
  status: string
  created_at: string
  sent_at: string | null
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Poll unread count every 30 seconds
  useEffect(() => {
    let mounted = true
    function fetchCount() {
      api<{ unread_count: number }>('/member/notifications?unread=true', { auth: true })
        .then((d) => { if (mounted) setUnreadCount(d.unread_count ?? 0) })
        .catch(() => {})
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  // Load notifications when dropdown opens
  useEffect(() => {
    if (!open) return
    setLoading(true)
    api<{ notifications: Notification[] }>('/member/notifications', { auth: true })
      .then((d) => {
        setNotifications(d.notifications ?? [])
        setUnreadCount((d.notifications ?? []).filter(n => n.status === 'queued').length)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function markAllRead() {
    try {
      await api('/member/notifications?read_all=true', { method: 'PATCH', auth: true })
      setNotifications(prev => prev.map(n => ({ ...n, status: 'sent', sent_at: new Date().toISOString() })))
      setUnreadCount(0)
    } catch {
      // Silently fail
    }
  }

  async function markRead(id: string) {
    try {
      await api(`/member/notifications?id=${id}`, { method: 'PATCH', auth: true })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'sent', sent_at: new Date().toISOString() } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      // Silently fail
    }
  }

  function timeAgo(dateStr: string): string {
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diff = Math.floor((now - then) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs font-medium text-luma-600 hover:text-luma-700">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-400">No notifications yet.</div>
            )}
            {!loading && notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => { if (n.status === 'queued') markRead(n.id) }}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  n.status === 'queued' ? 'bg-luma-50/30' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  {n.status === 'queued' && (
                    <div className="mt-1 h-2 w-2 rounded-full bg-luma-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-900">{n.subject ?? 'Notification'}</div>
                    <div className="mt-0.5 text-xs text-gray-500 line-clamp-2">{n.body}</div>
                    <div className="mt-1 text-[10px] text-gray-400">{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 px-4 py-2.5">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-medium text-luma-600 hover:text-luma-700"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
