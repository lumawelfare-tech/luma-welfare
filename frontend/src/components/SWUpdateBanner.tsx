import { useEffect, useState } from 'react'
import { applySWUpdate } from '../lib/pwa'

/**
 * Displays a banner when a service worker update is available.
 * Appears at the top of the page and lets the user reload to apply the update.
 */
export function SWUpdateBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    function handleUpdate() {
      setShow(true)
    }

    window.addEventListener('sw-update', handleUpdate)
    return () => window.removeEventListener('sw-update', handleUpdate)
  }, [])

  if (!show) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="rounded-xl border border-luma-200 bg-white p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-luma-50 text-luma-600 flex-shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Update Available</p>
            <p className="mt-0.5 text-xs text-gray-500">A new version of Luma Welfare is ready.</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => applySWUpdate()}
            className="flex-1 rounded-lg bg-luma-700 px-3 py-2 text-xs font-semibold text-white hover:bg-luma-800 transition-colors min-h-[36px]"
          >
            Reload Now
          </button>
          <button
            onClick={() => setShow(false)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[36px]"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
