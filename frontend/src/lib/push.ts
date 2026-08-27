/**
 * Web Push API Manager for Luma Welfare
 *
 * Handles:
 * - Requesting push notification permission
 * - Subscribing to Web Push
 * - Managing subscription lifecycle
 * - Checking push support
 *
 * VAPID_PUBLIC_KEY must be set as VITE_VAPID_PUBLIC_KEY env variable.
 */

import { api } from './api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Get the current push permission status
 */
export function getPushPermission(): NotificationPermission {
  if (!isPushSupported()) return 'denied'
  return Notification.permission
}

/**
 * Request push notification permission
 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return 'denied'

  const result = await Notification.requestPermission()
  return result
}

/**
 * Convert VAPID public key to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Push] VAPID_PUBLIC_KEY not configured')
    return false
  }

  try {
    // Get the service worker registration
    const registration = await navigator.serviceWorker.ready

    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription()

    // If already subscribed, check if it's still valid
    if (subscription) {
      // Verify the subscription is still active by sending it to the server
      const isValid = await verifySubscription(subscription)
      if (isValid) return true

      // Subscription is invalid, unsubscribe and create new one
      await subscription.unsubscribe()
      subscription = null
    }

    // Create new subscription
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    // Send subscription to server
    const success = await sendSubscriptionToServer(subscription)
    return success
  } catch (err) {
    console.error('[Push] Subscription failed:', err)
    return false
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (!subscription) return true

    // Unsubscribe from browser
    const success = await subscription.unsubscribe()
    if (!success) return false

    // Notify server
    await api('/member/push-subscriptions?all=true', {
      method: 'DELETE',
      auth: true,
    })

    return true
  } catch (err) {
    console.error('[Push] Unsubscribe failed:', err)
    return false
  }
}

/**
 * Get current push subscription
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null

  try {
    const registration = await navigator.serviceWorker.ready
    return await registration.pushManager.getSubscription()
  } catch {
    return null
  }
}

/**
 * Check if user is currently subscribed to push
 */
export async function isPushSubscribed(): Promise<boolean> {
  const subscription = await getPushSubscription()
  return subscription !== null
}

/**
 * Send subscription to server for storage
 */
async function sendSubscriptionToServer(subscription: PushSubscription): Promise<boolean> {
  try {
    const subscriptionJson = subscription.toJSON()
    const keys = subscriptionJson.keys

    if (!keys?.p256dh || !keys?.auth) {
      console.error('[Push] Missing subscription keys')
      return false
    }

    await api('/member/push-subscriptions', {
      method: 'POST',
      auth: true,
      body: {
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    })

    return true
  } catch (err) {
    console.error('[Push] Failed to send subscription to server:', err)
    return false
  }
}

/**
 * Verify that an existing subscription is still valid
 */
async function verifySubscription(subscription: PushSubscription): Promise<boolean> {
  try {
    const response = await api<{ subscriptions: Array<{ id: string; endpoint: string }> }>('/member/push-subscriptions', {
      auth: true,
    })

    // Check if this endpoint is registered on the server
    return response.subscriptions.some(
      (s) => s.endpoint === subscription.endpoint
    )
  } catch {
    return true // Assume valid if server check fails
  }
}

/**
 * Auto-subscribe if permission was previously granted
 * Call this on app startup after service worker is ready
 */
export async function autoSubscribeIfPermitted(): Promise<void> {
  if (!isPushSupported()) return
  if (Notification.permission !== 'granted') return

  // Wait for service worker to be ready
  try {
    await navigator.serviceWorker.ready

    // Check if already subscribed
    const subscribed = await isPushSubscribed()
    if (subscribed) return

    // Permission was granted but not subscribed — try to subscribe
    await subscribeToPush()
  } catch {
    // Non-critical — ignore
  }
}
