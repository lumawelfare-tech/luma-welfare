import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { useHead } from '../lib/seo'
import { AuthCard, fieldClass, alertErrorClass } from '../components/PageHero'

export function Register() {
  useHead('Register', undefined, { noindex: true })
  const { register } = useAuth()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    idNumber: '',
    password: '',
    confirm: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof form, string>>>({})
  const [busy, setBusy] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }))
  }

  function validate(): boolean {
    const next: Partial<Record<keyof typeof form, string>> = {}
    if (!form.fullName.trim()) next.fullName = 'Enter your full name.'
    if (!form.email.trim()) next.email = 'Enter your email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.'
    if (!form.phone.trim()) next.phone = 'Enter your phone number.'
    if (form.password.length < 8) next.password = 'Password must be at least 8 characters.'
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      next.password = 'Password must contain at least one letter and one number.'
    }
    if (form.password !== form.confirm) next.confirm = 'Passwords do not match.'
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!validate()) return

    setBusy(true)
    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        idNumber: form.idNumber.trim() || undefined,
        password: form.password,
      })
      navigate('/verify-email', {
        state: { email: form.email.trim() },
        replace: true,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard>
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-700 font-bold text-white text-lg shadow-sm shadow-luma-700/30">
          LW
        </span>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Join Luma Welfare</h1>
        <p className="mt-2 text-sm text-gray-600">
          Create an account to start contributing
        </p>
      </div>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <div>
          <label htmlFor="reg-name" className="mb-1.5 block text-sm font-medium text-gray-700">Full name</label>
          <input
            id="reg-name"
            required
            autoComplete="name"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            placeholder="Your full name"
            aria-invalid={!!fieldErrors.fullName}
            aria-describedby={fieldErrors.fullName ? 'reg-name-error' : undefined}
            className={fieldClass}
          />
          {fieldErrors.fullName && <p id="reg-name-error" className="mt-1 text-xs text-red-700" role="alert">{fieldErrors.fullName}</p>}
        </div>
        <div>
          <label htmlFor="reg-email" className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
          <input
            id="reg-email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="you@example.com"
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'reg-email-error' : undefined}
            className={fieldClass}
          />
          {fieldErrors.email && <p id="reg-email-error" className="mt-1 text-xs text-red-700" role="alert">{fieldErrors.email}</p>}
        </div>
        <div>
          <label htmlFor="reg-phone" className="mb-1.5 block text-sm font-medium text-gray-700">
            Phone (e.g. 0712345678)
          </label>
          <input
            id="reg-phone"
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="0712 345 678"
            aria-invalid={!!fieldErrors.phone}
            aria-describedby={fieldErrors.phone ? 'reg-phone-error' : undefined}
            className={fieldClass}
          />
          {fieldErrors.phone && <p id="reg-phone-error" className="mt-1 text-xs text-red-700" role="alert">{fieldErrors.phone}</p>}
        </div>
        <div>
          <label htmlFor="reg-id" className="mb-1.5 block text-sm font-medium text-gray-700">ID number (optional)</label>
          <input
            id="reg-id"
            value={form.idNumber}
            onChange={(e) => set('idNumber', e.target.value)}
            placeholder="National ID"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="reg-password" className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
          <input
            id="reg-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            placeholder="Min. 8 characters"
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? 'reg-password-error' : 'reg-password-hint'}
            className={fieldClass}
          />
          <p id="reg-password-hint" className="mt-1 text-xs text-gray-500">At least 8 characters, with at least one letter and one number.</p>
          {fieldErrors.password && <p id="reg-password-error" className="mt-1 text-xs text-red-700" role="alert">{fieldErrors.password}</p>}
        </div>
        <div>
          <label htmlFor="reg-confirm" className="mb-1.5 block text-sm font-medium text-gray-700">Confirm password</label>
          <input
            id="reg-confirm"
            type="password"
            required
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => set('confirm', e.target.value)}
            placeholder="Repeat your password"
            aria-invalid={!!fieldErrors.confirm}
            aria-describedby={fieldErrors.confirm ? 'reg-confirm-error' : undefined}
            className={fieldClass}
          />
          {fieldErrors.confirm && <p id="reg-confirm-error" className="mt-1 text-xs text-red-700" role="alert">{fieldErrors.confirm}</p>}
        </div>

        {error && (
          <div className={alertErrorClass} role="alert">
            {error}
          </div>
        )}

        <motion.button
          type="submit"
          disabled={busy}
          whileTap={reduceMotion ? undefined : { scale: 0.98 }}
          className="w-full rounded-xl bg-luma-700 py-3 text-sm font-bold text-white hover:bg-luma-800 disabled:opacity-60 transition-all shadow-sm"
        >
          {busy ? 'Creating account…' : 'Create Account'}
        </motion.button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Already a member?{' '}
        <Link to="/login" className="font-semibold text-luma-800 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  )
}
