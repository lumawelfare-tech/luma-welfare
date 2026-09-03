import { useEffect, useState, useRef } from 'react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'

type Notification = {
  id: string
  channel: string
  subject: string | null
  body: string
  status: string
  created_at: string
  sent_at: string | null
}

export function AdminNotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch initial unread count + subscribe to Realtime for live updates
  useEffect(() => {
    let mounted = true

    // Initial fetch
    api<{ unread_count: number }>('/admin/notifications?unread=true', { auth: true })
      .then((d) => { if (mounted) setUnreadCount(d.unread_count ?? 0) })
      .catch(() => {})

    // Subscribe to new admin notifications via Supabase Realtime
    const channel = supabase
      .channel('admin-notifications-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        if (!mounted) return
        const rec = payload.new as { member_id?: string; channel?: string; status?: string; subject?: string; body?: string }
        // Only count admin-channel notifications
        if (rec.channel === 'admin' && rec.status === 'queued') {
          setUnreadCount(prev => prev + 1)
          // Prepend to notifications list if dropdown is open
          setNotifications(prev => {
            if (prev.length === 0) return prev
            return [{
              id: (rec as any).id ?? crypto.randomUUID(),
              channel: rec.channel ?? 'admin',
              subject: rec.subject ?? null,
              body: rec.body ?? '',
              status: rec.status ?? 'queued',
              created_at: (rec as any).created_at ?? new Date().toISOString(),
              sent_at: null,
            }, ...prev].slice(0, 50)
          })
        }
      })
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [])

  // Load notifications when dropdown opens
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line oxc/react/set-state-in-effect — setLoading(true) guards against stale renders when dropdown opens; API call follows
    setLoading(true)
    api<{ notifications: Notification[] }>('/admin/notifications', { auth: true })
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
      await api('/admin/notifications?read_all=true', { method: 'PATCH', auth: true })
      setNotifications(prev => prev.map(n => ({ ...n, status: 'sent', sent_at: new Date().toISOString() })))
      setUnreadCount(0)
    } catch {
      // Silently fail
    }
  }

  async function markRead(id: string) {
    try {
      await api(`/admin/notifications?id=${id}`, { method: 'PATCH', auth: true })
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

  function notifIcon(subject: string | null) {
    if (subject?.includes('Failed') || subject?.includes('Error')) {
      return (
        <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-red-100 flex-shrink-0">
          <svg className="h-3.5 w-3.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
      )
    }
    return (
      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-luma-100 flex-shrink-0">
        <svg className="h-3.5 w-3.5 text-luma-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative rounded-lg p-2 transition-colors ${
          unreadCount > 0
            ? 'text-red-600 hover:bg-red-50'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
        }`}
        aria-label="Admin notifications"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">System Alerts</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">{unreadCount} new</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs font-medium text-luma-600 hover:text-luma-700">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-400">No system alerts.</div>
            )}
            {!loading && notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => { if (n.status === 'queued') markRead(n.id) }}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  n.status === 'queued' ? 'bg-red-50/30' : ''
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {notifIcon(n.subject)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-gray-900">{n.subject ?? 'Alert'}</span>
                      {n.status === 'queued' && (
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500 line-clamp-2">{n.body}</div>
                    <div className="mt-1 text-[10px] text-gray-400">{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
