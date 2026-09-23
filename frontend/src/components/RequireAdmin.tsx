import { Navigate, Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { api, ApiError, setAdmin2faStepUpToken } from '../lib/api'
import { AdminLogin } from './AdminLogin'

/**
 * Admin-gated routes. Server-side authorization remains authoritative
 * (every admin API endpoint independently verifies the admins table + 2FA step-up).
 * This is a convenience layer — it never grants access on its own.
 */
export function RequireAdmin() {
  const { member, isAdmin, twoFaVerified, setTwoFaVerified, loading } = useAuth()
  const [requires2fa, setRequires2fa] = useState(false)
  const [requires2faSetup, setRequires2faSetup] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!isAdmin || loading) return
    let cancelled = false

    async function check2fa() {
      setChecking(true)
      setCheckError(null)
      try {
        const d = await api<{ two_factor_enabled: boolean }>('/admin/2fa', { auth: true })
        if (cancelled) return
        if (d.two_factor_enabled) {
          setRequires2fa(true)
          setRequires2faSetup(false)
        } else {
          setRequires2fa(false)
          setRequires2faSetup(true)
          setTwoFaVerified(false)
        }
      } catch {
        // Fail closed — never grant admin UI when the 2FA status check fails
        if (!cancelled) {
          setTwoFaVerified(false)
          setRequires2fa(false)
          setRequires2faSetup(false)
          setCheckError('Unable to verify admin security settings. Please refresh and try again.')
        }
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    check2fa()
    return () => { cancelled = true }
  }, [isAdmin, loading, setTwoFaVerified])

  if (loading || (isAdmin && checking && !twoFaVerified && !requires2fa && !requires2faSetup && !checkError)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-stone-500">
        Checking your account…
      </div>
    )
  }

  if (isAdmin) {
    if (checkError) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center px-4">
          <div role="alert" className="max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {checkError}
          </div>
        </div>
      )
    }
    if (requires2faSetup && !twoFaVerified) {
      return (
        <TwoFaSetup onEnabled={() => {
          setTwoFaVerified(true)
          setRequires2faSetup(false)
        }} />
      )
    }
    if (requires2fa && !twoFaVerified) {
      return <TwoFaVerification onVerified={() => { setTwoFaVerified(true); setRequires2fa(false) }} />
    }
    return <Outlet />
  }

  if (!member) {
    return <AdminLogin />
  }

  return <Navigate to="/dashboard" replace />
}

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
      const result = await api<{
        verified?: boolean
        step_up_token?: string
        step_up_expires_at?: number
      }>('/admin/2fa?action=verify', { method: 'POST', auth: true, body: { code } })
      if (result.step_up_token) {
        setAdmin2faStepUpToken(result.step_up_token, result.step_up_expires_at)
      }
      onVerified()
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) {
          setError('Incorrect verification code. Please check your authenticator app and try again.')
        } else if (e.status === 400) {
          setError('This verification request has expired. Please try again.')
        } else {
          setError('Two-factor authentication is temporarily unavailable. Please try again or contact the system administrator.')
        }
      } else {
        setError('Two-factor authentication is temporarily unavailable. Please try again or contact the system administrator.')
      }
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
          <div role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
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

function TwoFaSetup({ onEnabled }: { onEnabled: () => void }) {
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const d = await api<{ secret: string }>('/admin/2fa?action=setup', { method: 'POST', auth: true })
        if (!cancelled) setSecret(d.secret)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Could not start 2FA setup. Please refresh.')
        }
      } finally {
        if (!cancelled) setStarting(false)
      }
    }
    start()
    return () => { cancelled = true }
  }, [])

  async function handleEnable() {
    if (code.length !== 6) {
      setError('Please enter the 6-digit code from your authenticator app.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await api<{
        step_up_token?: string
        step_up_expires_at?: number
      }>('/admin/2fa?action=enable', { method: 'POST', auth: true, body: { code } })
      if (result.step_up_token) {
        setAdmin2faStepUpToken(result.step_up_token, result.step_up_expires_at)
      }
      onEnabled()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not enable 2FA. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h2 className="text-lg font-bold text-gray-900">Set up two-factor authentication</h2>
          <p className="mt-2 text-sm text-gray-500">
            Staff accounts must enable 2FA. Add this secret to your authenticator app, then enter a code.
          </p>
        </div>

        {starting && <p className="mt-4 text-center text-sm text-stone-500">Preparing setup…</p>}

        {secret && (
          <div className="mt-4">
            <label htmlFor="2fa-secret" className="block text-sm font-medium text-gray-700">Authenticator secret</label>
            <input
              id="2fa-secret"
              readOnly
              value={secret}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
            />
          </div>
        )}

        {error && (
          <div role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="mt-6">
          <label htmlFor="2fa-setup-code" className="block text-sm font-medium text-gray-700">Verification Code</label>
          <input
            id="2fa-setup-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]*"
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleEnable() }}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-lg font-mono tracking-[0.3em] shadow-sm focus:border-luma-500 focus:ring-luma-500"
            placeholder="000000"
          />
        </div>

        <button
          onClick={handleEnable}
          disabled={loading || starting || !secret || code.length !== 6}
          className="mt-4 w-full rounded-lg bg-luma-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Enabling…' : 'Enable 2FA & Continue'}
        </button>
      </div>
    </div>
  )
}
