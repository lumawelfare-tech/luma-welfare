import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LegalConsentGate } from './LegalConsentGate'

/**
 * Member-gated routes. Server-side authorization remains authoritative.
 * Client checks only redirect for UX. Re-consent gate when legal versions change.
 */
export function RequireMember() {
  const { member, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-stone-500">
        Checking your account…
      </div>
    )
  }

  if (!member) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (member.status === 'pending_approval') {
    return (
      <Navigate
        to="/verify-email"
        state={{ email: member.email ?? '' }}
        replace
      />
    )
  }

  if (member.status === 'suspended' || member.status === 'closed') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div role="alert" className="max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Your account is {member.status}. Contact Luma Welfare support for help.
        </div>
      </div>
    )
  }

  return (
    <LegalConsentGate>
      <Outlet />
    </LegalConsentGate>
  )
}
