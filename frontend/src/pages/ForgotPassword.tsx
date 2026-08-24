import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resetError) throw resetError
      setSent(true)
    } catch (err) {
      // Show neutral message even on error to prevent email enumeration
      setSent(true)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center py-16">
        <div className="w-full max-w-md px-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-luma-100 text-luma-600">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-bold text-gray-900">Check your email</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              If an account exists for <strong>{email}</strong>, a password reset link has been sent.
              Check your inbox and follow the instructions.
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Didn't receive the email? Check your spam folder or try again.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-block rounded-xl bg-luma-700 px-6 py-3 text-sm font-bold text-white hover:bg-luma-800 transition-all"
            >
              Back to Sign In
            </Link>
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
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Forgot Password?</h1>
            <p className="mt-2 text-sm text-gray-500">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
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
              {busy ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Remember your password?{' '}
            <Link to="/login" className="font-semibold text-luma-700 hover:underline">
              Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
