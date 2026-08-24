import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)
  const [validSession, setValidSession] = useState<boolean | null>(null)

  // Check if the user has a valid recovery session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setValidSession(!!session)
    })
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Validate password
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain at least one letter and one number.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setSuccess(true)
      // Redirect to login after a short delay
      setTimeout(() => {
        navigate('/login', {
          replace: true,
          state: { passwordReset: true },
        })
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password. The link may have expired.')
    } finally {
      setBusy(false)
    }
  }

  // Loading state while checking session
  if (validSession === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center py-16">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    )
  }

  // No valid session — link may be expired or invalid
  if (!validSession) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center py-16">
        <div className="w-full max-w-md px-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-bold text-gray-900">Link Expired</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              This password reset link has expired or is invalid. Please request a new one.
            </p>
            <Link
              to="/forgot-password"
              className="mt-5 inline-block rounded-xl bg-luma-700 px-6 py-3 text-sm font-bold text-white hover:bg-luma-800 transition-all"
            >
              Request New Link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center py-16">
        <div className="w-full max-w-md px-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-bold text-gray-900">Password Reset Successful</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Your password has been updated. Redirecting to sign in…
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-md px-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-xl">
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-700 font-bold text-white text-lg">
              LW
            </span>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Reset Password</h1>
            <p className="mt-2 text-sm text-gray-500">
              Enter your new password below.
            </p>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-gray-700">New Password</label>
              <input
                id="new-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-luma-500 focus:bg-white focus:ring-2 focus:ring-luma-500/20 transition-all"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-gray-700">Confirm Password</label>
              <input
                id="confirm-password"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-luma-500 focus:bg-white focus:ring-2 focus:ring-luma-500/20 transition-all"
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-luma-700 py-3 text-sm font-bold text-white hover:bg-luma-800 disabled:opacity-60 transition-all shadow-sm"
            >
              {busy ? 'Resetting…' : 'Reset Password'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            <Link to="/login" className="font-semibold text-luma-700 hover:underline">
              Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
