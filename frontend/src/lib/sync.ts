/**
 * Background Sync Utility for Luma Welfare
 *
 * Handles communication with the service worker for background sync:
 * - Listens for sync events (request queued, sync success, sync failed)
 * - Provides methods to check sync queue status
 * - Triggers manual sync when needed
 *
 * Usage:
 *   import { initSync, onSyncEvent } from '../lib/sync'
 *
 *   // Initialize sync listeners
 *   initSync()
 *
 *   // Listen for sync events
 *   onSyncEvent('sync-success', (data) => console.log('Synced:', data))
 *   onSyncEvent('request-queued', (data) => showToast('Request queued for retry'))
 */

type SyncEventType = 'request-queued' | 'sync-success' | 'sync-failed' | 'sync-queue-status'

interface SyncEvent {
  type: SyncEventType
  id?: number
  url?: string
  method?: string
  status?: number
  error?: string
  count?: number
  requests?: Array<{ id: number; url: string; method: string; retries: number }>
}

type SyncCallback = (data: SyncEvent) => void

const listeners: Map<SyncEventType, Set<SyncCallback>> = new Map()
let initialized = false

/**
 * Initialize sync event listeners
 * Call once on app startup
 */
export function initSync() {
  if (initialized) return
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  initialized = true

  // Listen for messages from service worker
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<SyncEvent>) => {
    const data = event.data
    if (!data?.type) return

    const callbacks = listeners.get(data.type)
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(data)
        } catch (err) {
          console.error('[Sync] Callback error:', err)
        }
      }
    }
  })
}

/**
 * Register a callback for a sync event type
 */
export function onSyncEvent(type: SyncEventType, callback: SyncCallback): () => void {
  if (!listeners.has(type)) {
    listeners.set(type, new Set())
  }
  listeners.get(type)!.add(callback)

  // Return unsubscribe function
  return () => {
    listeners.get(type)?.delete(callback)
  }
}

/**
 * Request the service worker to register a background sync
 */
export async function requestSync(): Promise<boolean> {
  if (!navigator.serviceWorker?.controller) return false

  try {
    navigator.serviceWorker.controller.postMessage('triggerSync')
    return true
  } catch {
    return false
  }
}

/**
 * Get the current sync queue status
 */
export function getSyncQueueStatus(): Promise<{ count: number; requests: Array<{ id: number; url: string; method: string; retries: number }> }> {
  return new Promise((resolve) => {
    if (!navigator.serviceWorker?.controller) {
      resolve({ count: 0, requests: [] })
      return
    }

    // Set up one-time listener for response
    const unsubscribe = onSyncEvent('sync-queue-status', (data) => {
      unsubscribe()
      resolve({
        count: data.count ?? 0,
        requests: data.requests ?? [],
      })
    })

    // Request status from service worker
    navigator.serviceWorker.controller.postMessage('getSyncQueueStatus')

    // Timeout after 2 seconds
    setTimeout(() => {
      unsubscribe()
      resolve({ count: 0, requests: [] })
    }, 2000)
  })
}

/**
 * Check if the app is currently offline
 */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

/**
 * Check if Background Sync API is supported
 */
export function isSyncSupported(): boolean {
  return typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'sync' in navigator.serviceWorker
}

/**
 * Wrapper for fetch that handles offline queuing
 * Use this for write operations that should be retried
 */
export async function syncFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // If online, try normal fetch first
  if (navigator.onLine) {
    try {
      return await fetch(url, options)
    } catch (err) {
      // Network error while online — might be transient
      // The service worker will handle queuing if needed
      throw err
    }
  }

  // Offline — the service worker will queue this via background sync
  // Just make the request; the SW intercepts it
  return fetch(url, options)
}
