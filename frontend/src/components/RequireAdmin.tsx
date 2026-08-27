import { Navigate, Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { api, ApiError } from '../lib/api'
import { AdminLogin } from './AdminLogin'

/**
 * Admin-gated routes. Server-side authorization remains authoritative
 * (every admin API endpoint independently verifies the admins table).
 * This is a convenience layer — it never grants access on its own.
 *
 * Unauthenticated → show Admin Login inline at /admin (no redirect)
 * Authenticated but not admin → redirect to /dashboard
 * Authenticated admin without 2FA verified → redirect to 2FA setup
 * Authenticated admin with 2FA verified → render children (Outlet)
 */
export function RequireAdmin() {
  const { member, isAdmin, twoFaVerified, setTwoFaVerified, loading } = useAuth()
  const [requires2fa, setRequires2fa] = useState(false)

  // Check 2FA status for admins
  useEffect(() => {
    if (!isAdmin || loading) return
    let cancelled = false

    async function check2fa() {
      try {
        const d = await api<{ two_factor_enabled: boolean; two_factor_verified: boolean }>('/admin/2fa', { auth: true })
        if (cancelled) return
        if (d.two_factor_enabled && !d.two_factor_verified) {
          setRequires2fa(true)
        } else {
          setTwoFaVerified(true)
        }
      } catch {
        if (!cancelled) setTwoFaVerified(true) // If 2FA check fails, allow access (server-side still enforces)
      }
    }

    check2fa()
    return () => { cancelled = true }
  }, [isAdmin, loading, setTwoFaVerified])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-stone-500">
        Checking your account…
      </div>
    )
  }

  // Admins may not have a members record (e.g. the original admin account).
  // Check isAdmin first so superadmins are not stuck on the login page.
  if (isAdmin) {
    // If 2FA is required but not verified, show 2FA verification flow
    if (requires2fa && !twoFaVerified) {
      return <TwoFaVerification onVerified={() => { setTwoFaVerified(true); setRequires2fa(false) }} />
    }
    return <Outlet />
  }

  if (!member) {
    return <AdminLogin />
  }

  // Authenticated but not admin
  return <Navigate to="/dashboard" replace />
}

/**
 * Inline 2FA verification for admin route access.
 * Shows a code input form that verifies the TOTP code server-side.
 */
function TwoFaVerification({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleVerify() {
    if (code.length !== 6) {
      setError('Please enter a 6-digit code.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await api('/admin/2fa/verify', { method: 'POST', auth: true, body: { code } })
      onVerified()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Invalid code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-bold text-gray-900">Two-Factor Authentication</h2>
          <p className="mt-2 text-sm text-gray-500">Enter the 6-digit code from your authenticator app to access the admin portal.</p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="mt-6">
          <label htmlFor="2fa-code" className="block text-sm font-medium text-gray-700">Verification Code</label>
          <input
            id="2fa-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]*"
            autoFocus
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerify() }}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-lg font-mono tracking-[0.3em] shadow-sm focus:border-luma-500 focus:ring-luma-500"
            placeholder="000000"
          />
        </div>

        <button
          onClick={handleVerify}
          disabled={loading || code.length !== 6}
          className="mt-4 w-full rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Verifying…' : 'Verify & Continue'}
        </button>
      </div>
    </div>
  )
}
