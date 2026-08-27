/**
 * PWA Service Worker Registration
 *
 * Registers the service worker and handles update prompts.
 * Only runs in production and in supported browsers.
 */

export function registerSW() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  // Only register in production
  if (import.meta.env.DEV) return

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      })

      // Check for updates periodically (every 60 minutes)
      setInterval(() => {
        registration.update()
      }, 60 * 60 * 1000)

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content available — notify the user
            window.dispatchEvent(new CustomEvent('sw-update', { detail: { registration } }))
          }
        })
      })
    } catch (err) {
      // Service worker registration failed — non-critical
      console.debug('SW registration skipped:', err instanceof Error ? err.message : err)
    }
  })
}

/**
 * Prompt the user to apply the waiting service worker update.
 */
export async function applySWUpdate() {
  if (!navigator.serviceWorker?.controller) return

  const registration = await navigator.serviceWorker.getRegistration()
  if (registration?.waiting) {
    registration.waiting.postMessage('skipWaiting')
    // Reload to activate the new service worker
    window.location.reload()
  }
}
