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
      <div className="container-luma flex justify-center py-16">
        <div className="w-full max-w-md rounded-2xl border border-luma-200 bg-luma-50 p-8 text-center">
          <h1 className="text-xl font-bold text-luma-900">Account created</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-700">
            Check your email to confirm your address. After that, an admin will approve your
            membership. Once approved, you can join packages from your dashboard.
          </p>
          <Link to="/login" className="mt-5 inline-block rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700">
            Go to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container-luma flex justify-center py-16">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8">
        <h1 className="text-2xl font-bold text-luma-900">Join Luma Welfare</h1>
        <p className="mt-2 text-sm text-stone-600">
          Create an account to start contributing. An admin approves your membership before you
          can join packages. Already a member?{' '}
          <Link to="/login" className="font-semibold text-luma-700 hover:underline">
            Sign in
          </Link>
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Full name</label>
            <input
              required
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Phone (e.g. 0712345678)
            </label>
            <input
              required
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">ID number (optional)</label>
            <input
              value={form.idNumber}
              onChange={(e) => set('idNumber', e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500"
            />
            <p className="mt-1 text-xs text-stone-500">At least 8 characters, with a letter and a number.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Confirm password</label>
            <input
              type="password"
              required
              value={form.confirm}
              onChange={(e) => set('confirm', e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-luma-500"
            />
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            disabled={busy}
            className="w-full rounded-md bg-luma-600 py-2.5 text-sm font-semibold text-white hover:bg-luma-700 disabled:opacity-60"
          >
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}