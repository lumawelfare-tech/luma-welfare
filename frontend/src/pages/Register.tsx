import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { useHead } from '../lib/seo'
import { fieldClass, alertErrorClass } from '../components/PageHero'
import { MotionSection } from '../components/MotionSection'
import { legalConfig } from '../config/legal'
import { lumaPress } from '../lib/lumaMotion'
import { APPLICATION_PROGRAM_OPTIONS } from '../lib/applicationPrograms'
import { writePendingApplication } from '../lib/pendingApplication'

type FormState = {
  fullName: string
  idNumber: string
  dateOfBirth: string
  gender: string
  maritalStatus: string
  county: string
  location: string
  residentialAddress: string
  phone: string
  whatsappPhone: string
  email: string
  altPhone: string
  emergencyContactName: string
  emergencyContactRelationship: string
  emergencyContactPhone: string
  emergencyContactAltPhone: string
  familyCoverage: string
  password: string
  confirm: string
}

/**
 * Official LUMA online membership registration — maps to the published form fields.
 */
export function Register() {
  useHead('Membership application', undefined, { noindex: true })
  const { register } = useAuth()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [form, setForm] = useState<FormState>({
    fullName: '',
    idNumber: '',
    dateOfBirth: '',
    gender: '',
    maritalStatus: '',
    county: '',
    location: '',
    residentialAddress: '',
    phone: '',
    whatsappPhone: '',
    email: '',
    altPhone: '',
    emergencyContactName: '',
    emergencyContactRelationship: '',
    emergencyContactPhone: '',
    emergencyContactAltPhone: '',
    familyCoverage: 'individual',
    password: '',
    confirm: '',
  })
  const [programs, setPrograms] = useState<string[]>([])
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acceptedConstitution, setAcceptedConstitution] = useState(false)
  const [confirmSelfSubmission, setConfirmSelfSubmission] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleProgram(code: string) {
    setPrograms((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!acceptedPrivacy || !acceptedTerms || !acceptedConstitution || !confirmSelfSubmission) {
      setError('Accept the declarations and confirm self-submission to continue.')
      return
    }

    setBusy(true)
    try {
      const result = await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        idNumber: form.idNumber.trim(),
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        maritalStatus: form.maritalStatus,
        county: form.county.trim(),
        location: form.location.trim(),
        residentialAddress: form.residentialAddress.trim(),
        whatsappPhone: form.whatsappPhone.trim() || form.phone.trim(),
        altPhone: form.altPhone.trim() || undefined,
        emergencyContactName: form.emergencyContactName.trim(),
        emergencyContactRelationship: form.emergencyContactRelationship.trim(),
        emergencyContactPhone: form.emergencyContactPhone.trim(),
        emergencyContactAltPhone: form.emergencyContactAltPhone.trim() || undefined,
        familyCoverage: form.familyCoverage || undefined,
        applicationProgramCodes: programs,
        password: form.password,
        acceptedPrivacy: true as const,
        acceptedTerms: true as const,
        acceptedConstitution: true as const,
        confirmSelfSubmission: true as const,
        privacyPolicyVersion: legalConfig.privacyPolicyVersion,
        termsVersion: legalConfig.termsVersion,
      })
      if (result.applicationNumber) {
        writePendingApplication({
          email: form.email.trim(),
          applicationNumber: result.applicationNumber,
          registrationFee: result.registrationFee,
        })
      }
      navigate('/verify-email', {
        state: {
          email: form.email.trim(),
          applicationNumber: result.applicationNumber,
          membershipStatus: result.membershipStatus ?? 'pending_verification',
          registrationFee: result.registrationFee,
        },
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const input = fieldClass

  return (
    <MotionSection className="py-12 sm:py-16">
      <div className="container-luma max-w-2xl">
        <div className="mb-8 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-luma-700">Membership application</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Join LUMA Welfare</h1>
          <p className="mt-2 text-sm text-gray-600">
            Complete this form accurately. Submitting does not automatically approve benefits —
            administrators review applications and verify payment.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-10">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">1. Personal information</h2>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-fullName">Full name</label>
              <input id="reg-fullName" required className={input} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-id">National ID / Passport</label>
                <input id="reg-id" required className={input} value={form.idNumber} onChange={(e) => set('idNumber', e.target.value)} inputMode="numeric" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-dob">Date of birth</label>
                <input id="reg-dob" type="date" required className={input} value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-gender">Gender</label>
                <select id="reg-gender" required className={input} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                  <option value="">Select…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-marital">Marital status</label>
                <select id="reg-marital" required className={input} value={form.maritalStatus} onChange={(e) => set('maritalStatus', e.target.value)}>
                  <option value="">Select…</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-county">County</label>
                <input id="reg-county" required className={input} value={form.county} onChange={(e) => set('county', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-town">Town / area</label>
                <input id="reg-town" required className={input} value={form.location} onChange={(e) => set('location', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-address">Residential address</label>
              <textarea id="reg-address" required rows={2} className={input} value={form.residentialAddress} onChange={(e) => set('residentialAddress', e.target.value)} />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">2. Contact information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-phone">Mobile number</label>
                <input id="reg-phone" required className={input} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0712345678" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-wa">WhatsApp number</label>
                <input id="reg-wa" className={input} value={form.whatsappPhone} onChange={(e) => set('whatsappPhone', e.target.value)} placeholder="Same as mobile if blank" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-email">Email</label>
                <input id="reg-email" type="email" required className={input} value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-alt">Alternative contact</label>
                <input id="reg-alt" className={input} value={form.altPhone} onChange={(e) => set('altPhone', e.target.value)} />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">3. Emergency contact / next of kin</h2>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-ec-name">Full name</label>
              <input id="reg-ec-name" required className={input} value={form.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-ec-rel">Relationship</label>
                <input id="reg-ec-rel" required className={input} value={form.emergencyContactRelationship} onChange={(e) => set('emergencyContactRelationship', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-ec-phone">Phone</label>
                <input id="reg-ec-phone" required className={input} value={form.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-ec-alt">Alternative phone</label>
              <input id="reg-ec-alt" className={input} value={form.emergencyContactAltPhone} onChange={(e) => set('emergencyContactAltPhone', e.target.value)} />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">4. Programs & family coverage</h2>
            <p className="text-sm text-gray-500">
              Select packages you are interested in. Subscriptions are confirmed after approval.
              Family / dependant details are collected in the member portal after membership is approved.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {APPLICATION_PROGRAM_OPTIONS.map((p) => (
                <li key={p.code}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={programs.includes(p.code)}
                      onChange={() => toggleProgram(p.code)}
                    />
                    <span>{p.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-coverage">Family coverage</label>
              <select id="reg-coverage" className={input} value={form.familyCoverage} onChange={(e) => set('familyCoverage', e.target.value)}>
                <option value="individual">Individual</option>
                <option value="nuclear">Nuclear family</option>
                <option value="extended">Extended family</option>
              </select>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Account password</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-pass">Password</label>
                <input id="reg-pass" type="password" required autoComplete="new-password" className={input} value={form.password} onChange={(e) => set('password', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="reg-confirm">Confirm password</label>
                <input id="reg-confirm" type="password" required autoComplete="new-password" className={input} value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">7. Member declaration</h2>
            <label className="flex gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={acceptedConstitution} onChange={(e) => setAcceptedConstitution(e.target.checked)} />
              <span>I have read and agree to the LUMA Welfare Constitution and Membership Terms &amp; Conditions.</span>
            </label>
            <label className="flex gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={acceptedPrivacy} onChange={(e) => setAcceptedPrivacy(e.target.checked)} />
              <span>
                I accept the{' '}
                <Link to="/privacy" className="font-semibold text-luma-700 hover:underline">Privacy Policy</Link>
                {' '}and consent to use of my information for membership administration.
              </span>
            </label>
            <label className="flex gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />
              <span>
                I accept the{' '}
                <Link to="/terms" className="font-semibold text-luma-700 hover:underline">Terms &amp; Conditions</Link>.
              </span>
            </label>
            <label className="flex gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={confirmSelfSubmission} onChange={(e) => setConfirmSelfSubmission(e.target.checked)} />
              <span>I confirm that I am submitting this application myself.</span>
            </label>
          </section>

          {error && <div className={alertErrorClass} role="alert">{error}</div>}

          <motion.button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-luma-700 px-5 text-sm font-bold text-white hover:bg-luma-800 disabled:opacity-60 sm:w-auto"
            {...(reduceMotion ? {} : lumaPress)}
          >
            {busy ? 'Submitting…' : 'Submit membership application'}
          </motion.button>

          <p className="text-center text-sm text-gray-500 sm:text-left">
            Already applied?{' '}
            <Link to="/login" className="font-semibold text-luma-700 hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </MotionSection>
  )
}
