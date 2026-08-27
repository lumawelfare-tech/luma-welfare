import { useEffect, useState } from 'react'
import { onSyncEvent, isOffline, isSyncSupported } from '../lib/sync'

/**
 * Displays a status indicator when requests are queued for background sync.
 * Shows offline status and queued request count.
 */
export function SyncStatus() {
  const [queuedCount, setQueuedCount] = useState(0)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (!isSyncSupported()) return

    const unsubscribes = [
      // Request queued
      onSyncEvent('request-queued', () => {
        setQueuedCount((c) => c + 1)
        setShowBanner(true)
      }),

      // Sync success
      onSyncEvent('sync-success', () => {
        setQueuedCount((c) => Math.max(0, c - 1))
        setLastSync(new Date().toLocaleTimeString())
      }),

      // Sync failed
      onSyncEvent('sync-failed', () => {
        setQueuedCount((c) => Math.max(0, c - 1))
      }),
    ]

    return () => unsubscribes.forEach((unsub) => unsub())
  }, [])

  // Auto-hide banner after 5 seconds if no queued requests
  useEffect(() => {
    if (queuedCount === 0 && showBanner) {
      const timer = setTimeout(() => setShowBanner(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [queuedCount, showBanner])

  // Don't show anything if no queued requests and not offline
  if (!showBanner && queuedCount === 0 && !isOffline()) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-sm">
      <div className={`rounded-xl border p-3 shadow-lg transition-all ${
        isOffline()
          ? 'border-amber-200 bg-amber-50'
          : queuedCount > 0
            ? 'border-luma-200 bg-luma-50'
            : 'border-emerald-200 bg-emerald-50'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 ${
            isOffline()
              ? 'bg-amber-100 text-amber-600'
              : queuedCount > 0
                ? 'bg-luma-100 text-luma-600'
                : 'bg-emerald-100 text-emerald-600'
          }`}>
            {isOffline() ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3" />
              </svg>
            ) : queuedCount > 0 ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {isOffline() ? (
              <>
                <p className="text-sm font-semibold text-amber-800">You're offline</p>
                <p className="text-xs text-amber-600">Changes will sync when connection restores</p>
              </>
            ) : queuedCount > 0 ? (
              <>
                <p className="text-sm font-semibold text-luma-800">Syncing changes…</p>
                <p className="text-xs text-luma-600">{queuedCount} request{queuedCount === 1 ? '' : 's'} pending</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-emerald-800">Changes synced</p>
                {lastSync && <p className="text-xs text-emerald-600">Last sync: {lastSync}</p>}
              </>
            )}
          </div>
          {queuedCount === 0 && !isOffline() && (
            <button
              onClick={() => setShowBanner(false)}
              className="text-xs text-gray-400 hover:text-gray-600 min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
