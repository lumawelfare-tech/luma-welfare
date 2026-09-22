import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useHead } from '../lib/seo'
import { AuthCard } from '../components/PageHero'
import { clearPendingApplication } from '../lib/pendingApplication'
import { memberStatusLabel } from '../lib/applicationPrograms'

/**
 * Shown after email verification while membership remains pending_approval.
 * Matches official form confirmation: APPLICATION RECEIVED + application number.
 */
export function ApplicationStatus() {
  useHead('Application status', undefined, { noindex: true })
  const { member, registrationFeePaid, logout } = useAuth()

  useEffect(() => {
    clearPendingApplication()
  }, [])

  const appNo = member?.application_number ?? '—'

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-lg px-4">
        <AuthCard>
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-700 font-bold text-white text-lg">
              LW
            </span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-luma-700">
              Application received
            </p>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">Thank you for applying</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Your application has been received and will be reviewed according to LUMA Welfare
              membership requirements.
            </p>
          </div>

          <dl className="mt-8 space-y-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Application number</dt>
              <dd className="font-semibold text-gray-900">{appNo}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Membership status</dt>
              <dd className="font-semibold text-amber-800">{memberStatusLabel(member?.status ?? 'pending_approval')}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Registration fee</dt>
              <dd className="font-semibold text-gray-900">
                {registrationFeePaid ? 'Verified' : 'Awaiting verification'}
              </dd>
            </div>
          </dl>

          <p className="mt-6 text-sm text-gray-500">
            An administrator will verify your details and payment, then issue your membership number.
            You will be able to use the member portal once your application is approved.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/contact"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-luma-700 px-5 text-sm font-semibold text-white hover:bg-luma-800"
            >
              Contact support
            </Link>
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-200 px-5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </AuthCard>
      </div>
    </div>
  )
}
