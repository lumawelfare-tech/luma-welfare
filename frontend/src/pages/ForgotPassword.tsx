import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { AuthCard, fieldClass, alertErrorClass } from '../components/PageHero'
import { useHead } from '../lib/seo'
import { lumaPress } from '../lib/lumaMotion'

export function ForgotPassword() {
  useHead('Forgot Password', undefined, { noindex: true })
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const reduceMotion = useReducedMotion()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim()) {
      setError('Enter your email address.')
      return
    }
    setBusy(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resetError) throw resetError
      setSent(true)
    } catch {
      // Neutral message to prevent email enumeration
      setSent(true)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <AuthCard>
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-luma-100 text-luma-700">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">Check your email</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            If an account exists for <strong>{email}</strong>, a password reset link has been sent.
            Check your inbox and follow the instructions.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Didn&apos;t receive the email? Check your spam folder or try again.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block rounded-xl bg-luma-700 px-6 py-3 text-sm font-bold text-white hover:bg-luma-800 transition-all"
          >
            Back to Sign In
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-700 font-bold text-white text-lg shadow-sm shadow-luma-700/30">
          LW
        </span>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Forgot Password?</h1>
        <p className="mt-2 text-sm text-gray-600">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <div>
          <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
          <input
            id="reset-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null) }}
            placeholder="you@example.com"
            className={fieldClass}
          />
        </div>

        {error && (
          <div className={alertErrorClass} role="alert">
            {error}
          </div>
        )}

        <motion.button
          type="submit"
          disabled={busy}
          whileTap={lumaPress.default(Boolean(reduceMotion))}
          className="w-full rounded-xl bg-luma-700 py-3 text-sm font-bold text-white hover:bg-luma-800 disabled:opacity-60 transition-all shadow-sm"
        >
          {busy ? 'Sending…' : 'Send Reset Link'}
        </motion.button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Remember your password?{' '}
        <Link to="/login" className="font-semibold text-luma-800 hover:underline">
          Back to Sign In
        </Link>
      </p>
    </AuthCard>
  )
}
