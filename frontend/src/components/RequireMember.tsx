import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Member-gated routes. The admin area is further restricted server-side; the
// client-side check only redirects visitors to login.
//
// Members whose `status` is `pending_approval` haven't completed email
// verification and are routed to the OTP verification screen.
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

  return <Outlet />
}
