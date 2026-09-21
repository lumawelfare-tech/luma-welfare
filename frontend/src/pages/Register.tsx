import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { useHead } from '../lib/seo'
import { fieldClass, alertErrorClass } from '../components/PageHero'
import { MotionSection } from '../components/MotionSection'
import { legalConfig } from '../config/legal'

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
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof form | 'consent', string>>>({})
  const [busy, setBusy] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }))
  }

  function validate(): boolean {
    const next: Partial<Record<keyof typeof form | 'consent', string>> = {}
    if (!form.fullName.trim()) next.fullName = 'Enter your full name.'
    if (!form.email.trim()) next.email = 'Enter your email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.'
    const phoneDigits = form.phone.replace(/\D/g, '')
    let phoneNorm = phoneDigits
    if (phoneDigits.startsWith('254') && phoneDigits.length >= 12) phoneNorm = `0${phoneDigits.slice(3, 12)}`
    else if (phoneDigits.length === 9 && /^[17]/.test(phoneDigits)) phoneNorm = `0${phoneDigits}`
    if (!phoneNorm) next.phone = 'Enter your phone number.'
    else if (!/^0[17]\d{8}$/.test(phoneNorm)) next.phone = 'Enter a valid Kenyan phone (e.g. 0712345678).'
    const idDigits = form.idNumber.replace(/\D/g, '')
    if (!idDigits) next.idNumber = 'Enter your National ID number.'
    else if (!/^\d{7,8}$/.test(idDigits)) next.idNumber = 'National ID must be 7–8 digits.'
    if (form.password.length < 8) next.password = 'Password must be at least 8 characters.'
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      next.password = 'Password must contain at least one letter and one number.'
    }
    if (form.password !== form.confirm) next.confirm = 'Passwords do not match.'
    if (!acceptedPrivacy || !acceptedTerms) {
      next.consent = 'Accept the Privacy Policy and Terms & Conditions to continue.'
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!validate()) return

    const phoneDigits = form.phone.replace(/\D/g, '')
    let phone = phoneDigits
    if (phoneDigits.startsWith('254') && phoneDigits.length >= 12) phone = `0${phoneDigits.slice(3, 12)}`
    else if (phoneDigits.length === 9 && /^[17]/.test(phoneDigits)) phone = `0${phoneDigits}`
    const idNumber = form.idNumber.replace(/\D/g, '')

    setBusy(true)
    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone,
        idNumber,
        password: form.password,
        acceptedPrivacy: true,
        acceptedTerms: true,
        privacyPolicyVersion: legalConfig.privacyPolicyVersion,
        termsVersion: legalConfig.termsVersion,
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
    <div className="flex min-h-[60vh] items-center justify-center py-12 sm:py-16">
      <MotionSection as="div" className="w-full max-w-[720px] px-4">
        <div className="glass-modal p-6 sm:p-8">
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-700 text-lg font-bold text-white shadow-sm shadow-luma-700/30">
              LW
            </span>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Join Luma Welfare</h1>
            <p className="mt-2 text-sm text-gray-600">
              Create an account to start contributing
            </p>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
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
                <label htmlFor="reg-id" className="mb-1.5 block text-sm font-medium text-gray-700">National ID number</label>
                <input
                  id="reg-id"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.idNumber}
                  onChange={(e) => set('idNumber', e.target.value)}
                  placeholder="7–8 digit National ID"
                  aria-invalid={!!fieldErrors.idNumber}
                  aria-describedby={fieldErrors.idNumber ? 'reg-id-error' : undefined}
                  className={fieldClass}
                />
                {fieldErrors.idNumber && <p id="reg-id-error" className="mt-1 text-xs text-red-700" role="alert">{fieldErrors.idNumber}</p>}
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
            </div>

            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <label className="flex items-start gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-luma-700 focus:ring-luma-600"
                  checked={acceptedPrivacy}
                  onChange={(e) => {
                    setAcceptedPrivacy(e.target.checked)
                    setFieldErrors((fe) => ({ ...fe, consent: undefined }))
                  }}
                />
                <span>
                  I have read and agree to the{' '}
                  <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-luma-800 hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-luma-700 focus:ring-luma-600"
                  checked={acceptedTerms}
                  onChange={(e) => {
                    setAcceptedTerms(e.target.checked)
                    setFieldErrors((fe) => ({ ...fe, consent: undefined }))
                  }}
                />
                <span>
                  I have read and agree to the{' '}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-luma-800 hover:underline">
                    Terms &amp; Conditions
                  </Link>
                  .
                </span>
              </label>
              {fieldErrors.consent && <p className="text-xs text-red-700" role="alert">{fieldErrors.consent}</p>}
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
              className="w-full rounded-xl bg-luma-700 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-luma-800 disabled:opacity-60"
            >
              {busy ? 'Creating account…' : 'Create Account'}
            </motion.button>
          </form>

          <p className="mt-5 text-center text-sm text-gray-600">
            Already a member?{' '}
            <Link to="/login" className="font-semibold text-luma-800 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </MotionSection>
    </div>
  )
}
