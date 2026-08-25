import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'

export function Register() {
  const { register } = useAuth()
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    idNumber: '',
    password: '',
    confirm: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setError('Password must contain at least one letter and one number.')
      return
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        idNumber: form.idNumber.trim() || undefined,
        password: form.password,
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center py-16">
        <div className="w-full max-w-md px-4">
          <div className="rounded-3xl border border-luma-200 bg-luma-50 p-8 text-center shadow-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-luma-100 text-luma-600">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-bold text-gray-900">Account Created!</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Check your email to confirm your address. Once your email is confirmed, you can sign in and complete your KSh 300 one-time activation fee to access available welfare packages.
            </p>
            <Link to="/login" className="mt-6 inline-block rounded-xl bg-luma-700 px-6 py-3 text-sm font-bold text-white hover:bg-luma-800 transition-all">
              Go to Sign In
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
          {/* Logo */}
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-700 font-bold text-white text-lg">
              LW
            </span>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Join Luma Welfare</h1>
            <p className="mt-2 text-sm text-gray-500">
              Create an account to start contributing
            </p>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Full name</label>
              <input
                required
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-luma-500 focus:bg-white focus:ring-2 focus:ring-luma-500/20 transition-all"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-luma-500 focus:bg-white focus:ring-2 focus:ring-luma-500/20 transition-all"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Phone (e.g. 0712345678)
              </label>
              <input
                required
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="0712 345 678"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-luma-500 focus:bg-white focus:ring-2 focus:ring-luma-500/20 transition-all"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">ID number (optional)</label>
              <input
                value={form.idNumber}
                onChange={(e) => set('idNumber', e.target.value)}
                placeholder="National ID"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-luma-500 focus:bg-white focus:ring-2 focus:ring-luma-500/20 transition-all"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-luma-500 focus:bg-white focus:ring-2 focus:ring-luma-500/20 transition-all"
              />
              <p className="mt-1 text-xs text-gray-400">At least 8 characters, with at least one letter and one number.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirm password</label>
              <input
                type="password"
                required
                value={form.confirm}
                onChange={(e) => set('confirm', e.target.value)}
                placeholder="Repeat your password"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-luma-500 focus:bg-white focus:ring-2 focus:ring-luma-500/20 transition-all"
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              disabled={busy}
              className="w-full rounded-xl bg-luma-700 py-3 text-sm font-bold text-white hover:bg-luma-800 disabled:opacity-60 transition-all shadow-sm"
            >
              {busy ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already a member?{' '}
            <Link to="/login" className="font-semibold text-luma-700 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
