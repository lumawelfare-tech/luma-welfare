import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'

export function Login() {
  const { login, signInWithGoogle, member, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [searchParams] = useSearchParams()
  const passwordReset = searchParams.get('passwordReset') === 'true' || (location.state as Record<string, unknown>)?.passwordReset === true

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await login(email.trim(), password)
      if (result.isAdmin) {
        navigate('/admin', { replace: true })
      } else {
        navigate(from, { replace: true })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    setGoogleBusy(true)
    try {
      await signInWithGoogle()
      // User will be redirected to Google, then back to the app
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed. Try again.')
      setGoogleBusy(false)
    }
  }

  if (member) {
    navigate(isAdmin ? '/admin' : '/dashboard', { replace: true })
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-md px-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-xl">
          {/* Logo */}
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-700 font-bold text-white text-lg">
              LW
            </span>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Welcome Back</h1>
            <p className="mt-2 text-sm text-gray-500">
              Sign in to your Luma Welfare account
            </p>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-luma-500 focus:bg-white focus:ring-2 focus:ring-luma-500/20 transition-all"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="login-password" className="text-sm font-medium text-gray-700">Password</label>
                <Link to="/forgot-password" className="text-xs font-medium text-luma-600 hover:text-luma-700 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-luma-500 focus:bg-white focus:ring-2 focus:ring-luma-500/20 transition-all"
              />
            </div>

            {passwordReset && (
              <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
                Password reset successful. You can now sign in with your new password.
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || googleBusy}
              className="w-full rounded-xl bg-luma-700 py-3 text-sm font-bold text-white hover:bg-luma-800 disabled:opacity-60 transition-all shadow-sm"
            >
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-medium text-gray-400 uppercase">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Google Sign-In */}
          <button
            onClick={handleGoogle}
            disabled={busy || googleBusy}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-all shadow-sm"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleBusy ? 'Connecting…' : 'Continue with Google'}
          </button>

          <p className="mt-6 text-center text-sm text-gray-500">
            Not a member yet?{' '}
            <Link to="/register" className="font-semibold text-luma-700 hover:underline">
              Join now
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
