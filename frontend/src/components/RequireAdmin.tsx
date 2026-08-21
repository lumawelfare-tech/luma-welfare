import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Admin-gated routes. Server-side authorization remains authoritative
 * (every admin API endpoint independently verifies the admins table).
 * This is a convenience layer — it never grants access on its own.
 *
 * Unauthenticated → /login
 * Authenticated but not admin → /dashboard
 * Authenticated admin → render children (Outlet)
 */
export function RequireAdmin() {
  const { member, isAdmin, loading } = useAuth()
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

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
