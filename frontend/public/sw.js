/**
 * Luma Welfare Service Worker
 *
 * Caching strategy:
 * - App shell (HTML, CSS, JS): Cache-first with network fallback
 * - Static assets (images, fonts): Cache-first
 * - API calls: Network-only with background sync retry
 * - Navigation: Network-first with cache fallback (offline shell)
 *
 * Background Sync:
 * - Failed write operations (POST/PATCH/DELETE) are queued in IndexedDB
 * - When connectivity restores, the sync event retries queued requests
 * - Read operations (GET) are not synced (data may be stale)
 *
 * Important: Financial/payment operations always require network.
 * This service worker provides offline shell + retry for failed writes.
 */

const CACHE_NAME = 'luma-welfare-v1'
const STATIC_CACHE = 'luma-static-v1'
const SYNC_QUEUE_DB = 'luma-sync-queue'
const SYNC_QUEUE_STORE = 'requests'
const SYNC_TAG = 'luma-retry-sync'

// App shell assets to pre-cache on install
const APP_SHELL = [
  '/',
  '/index.html',
]

// Assets to cache on first use (Vite-generated with content hashes)
const CACHEABLE_ASSETS = /\.(js|css|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|ico)$/i

// API paths that should NEVER be cached (financial data)
const API_PATHS = [
  '/member/dashboard',
  '/member/contributions',
  '/member/claims',
  '/member/notifications',
  '/member/profile',
  '/contributions',
  '/payments',
  '/auth/me',
]

// Paths that indicate financial/sensitive operations — always network
const SENSITIVE_PATHS = [
  '/payments-initiate',
  '/payments-callback',
  '/member/registration-fee',
  '/member/claims',
]

// Methods that can be synced via background sync
const SYNCABLE_METHODS = ['POST', 'PATCH', 'DELETE']

// Maximum retry attempts for queued requests
const MAX_RETRIES = 3

// Push notification click action URL
const PUSH_CLICK_URL = '/notifications'

// ============================================================================
// IndexedDB Sync Queue
// ============================================================================

/**
 * Open the sync queue database
 */
function openSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_QUEUE_DB, 1)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const store = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('syncTag', 'syncTag', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Add a request to the sync queue
 */
async function queueRequest(requestData) {
  try {
    const db = await openSyncDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite')
      const store = tx.objectStore(SYNC_QUEUE_STORE)
      const entry = {
        ...requestData,
        createdAt: Date.now(),
        retries: 0,
        syncTag: SYNC_TAG,
      }
      const req = store.add(entry)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close()
    })
  } catch (err) {
    console.error('[SW] Failed to queue request:', err)
    return null
  }
}

/**
 * Get all queued requests
 */
async function getQueuedRequests() {
  try {
    const db = await openSyncDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SYNC_QUEUE_STORE, 'readonly')
      const store = tx.objectStore(SYNC_QUEUE_STORE)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close()
    })
  } catch (err) {
    console.error('[SW] Failed to get queued requests:', err)
    return []
  }
}

/**
 * Update a queued request (e.g., increment retries)
 */
async function updateQueuedRequest(id, updates) {
  try {
    const db = await openSyncDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite')
      const store = tx.objectStore(SYNC_QUEUE_STORE)
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const entry = getReq.result
        if (entry) {
          Object.assign(entry, updates)
          store.put(entry)
        }
        resolve()
      }
      getReq.onerror = () => reject(getReq.error)
      tx.oncomplete = () => db.close()
    })
  } catch (err) {
    console.error('[SW] Failed to update queued request:', err)
  }
}

/**
 * Remove a queued request
 */
async function removeQueuedRequest(id) {
  try {
    const db = await openSyncDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite')
      const store = tx.objectStore(SYNC_QUEUE_STORE)
      store.delete(id)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  } catch (err) {
    console.error('[SW] Failed to remove queued request:', err)
  }
}

// ============================================================================
// Install & Activate
// ============================================================================

/**
 * Install — pre-cache app shell
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

/**
 * Activate — clean up old caches
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

// ============================================================================
// Background Sync
// ============================================================================

/**
 * Background sync event — retry queued requests
 */
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(retryQueuedRequests())
  }
})

/**
 * Retry all queued requests
 */
async function retryQueuedRequests() {
  const requests = await getQueuedRequests()
  const clients = await self.clients.matchAll()

  for (const entry of requests) {
    try {
      // Check if we've exceeded max retries
      if (entry.retries >= MAX_RETRIES) {
        console.warn(`[SW] Max retries reached for request: ${entry.url}`)
        // Notify client of permanent failure
        notifyClients(clients, {
          type: 'sync-failed',
          id: entry.id,
          url: entry.url,
          error: 'Max retries exceeded',
        })
        await removeQueuedRequest(entry.id)
        continue
      }

      // Reconstruct the request
      const fetchOptions = {
        method: entry.method,
        headers: entry.headers ? JSON.parse(entry.headers) : {},
      }

      // Only include body for methods that support it
      if (entry.body && SYNCABLE_METHODS.includes(entry.method)) {
        fetchOptions.body = entry.body
      }

      const response = await fetch(entry.url, fetchOptions)

      if (response.ok || response.status < 500) {
        // Success or client error (not retryable) — remove from queue
        console.log(`[SW] Synced request: ${entry.method} ${entry.url} (${response.status})`)
        await removeQueuedRequest(entry.id)

        // Notify client of success
        notifyClients(clients, {
          type: 'sync-success',
          id: entry.id,
          url: entry.url,
          status: response.status,
        })
      } else {
        // Server error — retry later
        console.warn(`[SW] Sync failed (will retry): ${entry.method} ${entry.url} (${response.status})`)
        await updateQueuedRequest(entry.id, { retries: entry.retries + 1 })
      }
    } catch (err) {
      // Network error — retry later
      console.warn(`[SW] Sync error (will retry): ${entry.method} ${entry.url}`, err)
      await updateQueuedRequest(entry.id, { retries: entry.retries + 1 })
    }
  }
}

/**
 * Send message to all clients
 */
function notifyClients(clients, message) {
  for (const client of clients) {
    client.postMessage(message)
  }
}

// ============================================================================
// Fetch Handler
// ============================================================================

/**
 * Fetch — routing strategy
 */
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip cross-origin requests (Supabase, Resend, M-Pesa, etc.)
  if (url.origin !== self.location.origin) return

  // Skip chrome-extension and other non-http schemes
  if (!url.protocol.startsWith('http')) return

  // 1. Write operations — network with background sync fallback
  if (SYNCABLE_METHODS.includes(request.method)) {
    event.respondWith(networkWithSyncFallback(request))
    return
  }

  // GET requests follow caching strategy

  // Skip non-GET requests (already handled above)
  if (request.method !== 'GET') return

  // 2. API calls — network only (financial data must be fresh)
  if (isApiCall(url.pathname)) {
    event.respondWith(networkOnly(request))
    return
  }

  // 3. Sensitive operations — network only
  if (isSensitivePath(url.pathname)) {
    event.respondWith(networkOnly(request))
    return
  }

  // 4. Navigation requests — network first, cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  // 5. Static assets (JS, CSS, images) — cache first
  if (CACHEABLE_ASSETS.test(url.pathname)) {
    event.respondWith(cacheFirst(request))
    return
  }

  // 6. Everything else — network first
  event.respondWith(networkFirst(request))
})

// ============================================================================
// Caching Strategies
// ============================================================================

/**
 * Network with sync fallback: try network, queue for background sync on failure
 * Only for write operations (POST, PATCH, DELETE)
 */
async function networkWithSyncFallback(request) {
  try {
    const response = await fetch(request)
    return response
  } catch (err) {
    // Network failed — queue for background sync
    const requestData = {
      url: request.url,
      method: request.method,
      headers: JSON.stringify(Object.fromEntries(request.headers.entries())),
      body: request.method !== 'DELETE' ? await request.clone().text().catch(() => null) : null,
    }

    const id = await queueRequest(requestData)

    // Register background sync
    if ('sync' in self.registration) {
      try {
        await self.registration.sync.register(SYNC_TAG)
      } catch (syncErr) {
        console.warn('[SW] Background sync registration failed:', syncErr)
      }
    }

    // Notify client that request was queued
    const clients = await self.clients.matchAll()
    notifyClients(clients, {
      type: 'request-queued',
      id,
      url: request.url,
      method: request.method,
    })

    // Return a synthetic response indicating the request was queued
    return new Response(
      JSON.stringify({
        message: 'Request queued for retry when connection restores',
        code: 'OFFLINE_QUEUED',
        queued: true,
        id,
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

/**
 * Cache-first: serve from cache, fall back to network
 * Good for static assets that don't change
 */
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Return offline fallback for images
    if (request.destination === 'image') {
      return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect fill="#f3f4f6" width="100" height="100"/><text fill="#9ca3af" font-family="sans-serif" font-size="12" text-anchor="middle" x="50" y="54">Offline</text></svg>',
        { headers: { 'Content-Type': 'image/svg+xml' } }
      )
    }
    return new Response('Offline', { status: 503 })
  }
}

/**
 * Network-first: try network, fall back to cache
 * Good for pages that should be fresh but have offline fallback
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached

    // Return offline shell for navigation
    if (request.mode === 'navigate') {
      const offlineShell = await caches.match('/')
      if (offlineShell) return offlineShell
    }

    return new Response('Offline — Please check your connection', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}

/**
 * Network-only: always go to network
 * Good for API calls and financial operations
 */
async function networkOnly(request) {
  try {
    return await fetch(request)
  } catch {
    return new Response(
      JSON.stringify({ message: 'Offline — Please check your connection', code: 'OFFLINE' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if pathname is an API call
 */
function isApiCall(pathname) {
  return API_PATHS.some((api) => pathname.startsWith(api)) ||
    pathname.startsWith('/api/') ||
    pathname.includes('?') // Query params indicate dynamic data
}

/**
 * Check if pathname is a sensitive operation
 */
function isSensitivePath(pathname) {
  return SENSITIVE_PATHS.some((path) => pathname.startsWith(path))
}

// ============================================================================
// Push Notifications
// ============================================================================

/**
 * Push event — display push notification
 */
self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    data = {
      title: 'Luma Welfare',
      body: event.data.text(),
    }
  }

  const title = data.title || 'Luma Welfare'
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/favicon.png',
    tag: data.tag || 'luma-notification',
    renotify: true,
    vibrate: [100, 50, 100],
    data: {
      url: data.url || PUSH_CLICK_URL,
      notificationId: data.notificationId || null,
    },
    actions: [
      { action: 'open', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

/**
 * Notification click event — open the relevant page
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const url = event.notification.data?.url || PUSH_CLICK_URL

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Check if the app is already open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Open new window
      self.clients.openWindow(url)
    })
  )
})

/**
 * Notification close event — log for analytics
 */\self.addEventListener('notificationclose', (event) => {
  // Optional: track notification dismissal
})

// ============================================================================
// Message Handler
// ============================================================================

/**
 * Listen for messages from the main thread
 */
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting()
  }

  // Allow clients to request cache cleanup
  if (event.data === 'clearCache') {
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    )
  }

  // Allow clients to trigger sync manually
  if (event.data === 'triggerSync') {
    if ('sync' in self.registration) {
      self.registration.sync.register(SYNC_TAG)
    }
  }

  // Allow clients to check sync queue status
  if (event.data === 'getSyncQueue') {
    getQueuedRequests().then((requests) => {
      const clients = self.clients.matchAll()
      clients.then((clientList) => {
        for (const client of clientList) {
          client.postMessage({
            type: 'sync-queue-status',
            count: requests.length,
            requests: requests.map(r => ({ id: r.id, url: r.url, method: r.method, retries: r.retries })),
          })
        }
      })
    })
  }
})
