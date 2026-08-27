import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { isPushSupported, requestPushPermission, subscribeToPush, unsubscribeFromPush, isPushSubscribed } from '../../lib/push'

type Prefs = {
  email_enabled: boolean
  sms_enabled: boolean
  in_app_enabled: boolean
  push_enabled: boolean
}

const channels = [
  {
    key: 'push_enabled' as const,
    label: 'Push Notifications',
    description: 'Receive instant notifications on your device (even when the app is closed)',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
    pushOnly: true,
  },
  {
    key: 'email_enabled' as const,
    label: 'Email',
    description: 'Receive notifications via email',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    key: 'sms_enabled' as const,
    label: 'SMS',
    description: 'Receive notifications via text message',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
  },
  {
    key: 'in_app_enabled' as const,
    label: 'In-App',
    description: 'Receive notifications inside the member portal',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
    required: true,
  },
] as const

export function NotificationPreferences() {
  useHead('Notification Preferences', undefined, { noindex: true })
  const [prefs, setPrefs] = useState<Prefs>({ email_enabled: true, sms_enabled: true, in_app_enabled: true, push_enabled: true })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pushSupported] = useState(() => isPushSupported())
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  useEffect(() => {
    api<{ preferences: Prefs }>('/member/notification-prefs', { auth: true })
      .then((d) => setPrefs(d.preferences))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))

    // Check push subscription status
    if (pushSupported) {
      isPushSubscribed().then(setPushSubscribed)
    }
  }, [pushSupported])

  async function toggleChannel(key: keyof Prefs) {
    if (key === 'in_app_enabled') return // Cannot disable in-app

    // Handle push toggle specially
    if (key === 'push_enabled') {
      await handlePushToggle()
      return
    }

    const newValue = !prefs[key]
    const newPrefs = { ...prefs, [key]: newValue }

    // Optimistic update
    setPrefs(newPrefs)
    setSuccess(false)
    setError(null)
    setSaving(true)

    try {
      const result = await api<{ preferences: Prefs; message?: string }>(
        '/member/notification-prefs',
        {
          method: 'PATCH',
          auth: true,
          body: { [key]: newValue },
        },
      )
      setPrefs(result.preferences)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e) {
      setPrefs(prefs)
      setError(e instanceof Error ? e.message : 'Could not update preferences.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePushToggle() {
    setPushLoading(true)
    setError(null)
    setSuccess(false)

    try {
      if (pushSubscribed) {
        // Unsubscribe
        const success = await unsubscribeFromPush()
        if (success) {
          setPushSubscribed(false)
          setPrefs((p) => ({ ...p, push_enabled: false }))
          setSuccess(true)
          setTimeout(() => setSuccess(false), 3000)
        } else {
          setError('Could not disable push notifications.')
        }
      } else {
        // Request permission and subscribe
        const permission = await requestPushPermission()

        if (permission === 'denied') {
          setError('Push notifications are blocked. Please enable them in your browser settings.')
          return
        }

        if (permission === 'default') {
          // User hasn't decided yet — permission prompt was shown
          // Check if they granted it
          const newPermission = await requestPushPermission()
          if (newPermission !== 'granted') {
            setError('Push notification permission was denied.')
            return
          }
        }

        const success = await subscribeToPush()
        if (success) {
          setPushSubscribed(true)
          setPrefs((p) => ({ ...p, push_enabled: true }))
          setSuccess(true)
          setTimeout(() => setSuccess(false), 3000)
        } else {
          setError('Could not enable push notifications. Please try again.')
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Push notification error.')
    } finally {
      setPushLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="h-8 w-64 rounded bg-gray-200 animate-pulse" />
          <div className="mt-2 h-4 w-48 rounded bg-gray-100 animate-pulse" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Notification Preferences</h1>
        <p className="mt-1 text-sm text-gray-500">
          Choose how you'd like to receive notifications about your membership, contributions, and claims.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2" role="alert">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2" role="status">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Preferences saved successfully.
        </div>
      )}

      <div className="space-y-3">
        {channels.map((ch) => {
          // Skip push channel if not supported
          if ('pushOnly' in ch && ch.pushOnly && !pushSupported) return null

          const isEnabled = ch.key === 'push_enabled' ? pushSubscribed : prefs[ch.key]
          const isRequired = 'required' in ch && ch.required
          const isSavingThis = ch.key === 'push_enabled' ? pushLoading : saving

          return (
            <div
              key={ch.key}
              className={`rounded-xl border bg-white p-4 sm:p-5 transition-colors ${
                isEnabled ? 'border-gray-200' : 'border-gray-100 bg-gray-50/50'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${
                    isEnabled ? 'bg-luma-50 text-luma-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {ch.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{ch.label}</h3>
                      {isRequired && (
                        <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Required</span>
                      )}
                      {ch.key === 'push_enabled' && !pushSupported && (
                        <span className="text-[10px] font-medium text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">Not supported</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{ch.description}</p>
                  </div>
                </div>

                {/* Toggle switch */}
                <button
                  onClick={() => toggleChannel(ch.key)}
                  disabled={isRequired || isSavingThis || (ch.key === 'push_enabled' && !pushSupported)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-luma-500 focus:ring-offset-2 disabled:cursor-not-allowed ${
                    isEnabled ? 'bg-luma-600' : 'bg-gray-200'
                  } ${isRequired ? 'opacity-70' : ''}`}
                  role="switch"
                  aria-checked={isEnabled}
                  aria-label={`${ch.label} notifications ${isEnabled ? 'enabled' : 'disabled'}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">About notifications</h3>
        <ul className="space-y-2 text-xs text-gray-500">
          <li className="flex items-start gap-2">
            <svg className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
            <span><strong>Push notifications</strong> appear on your device even when the app is closed. Great for payment confirmations and claim updates.</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>You'll receive notifications about contribution reminders, claim updates, and membership changes.</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
            <span>Your notification preferences are stored securely. We never share your contact details.</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>In-app notifications cannot be turned off so you always stay informed inside the portal.</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
