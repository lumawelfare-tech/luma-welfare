import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AdminLogin } from './AdminLogin'

/**
 * Admin-gated routes. Server-side authorization remains authoritative
 * (every admin API endpoint independently verifies the admins table).
 * This is a convenience layer — it never grants access on its own.
 *
 * Unauthenticated → show Admin Login inline at /admin (no redirect)
 * Authenticated but not admin → redirect to /dashboard
 * Authenticated admin → render children (Outlet)
 */
export function RequireAdmin() {
  const { member, isAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-stone-500">
        Checking your account…
      </div>
    )
  }

  // Admins may not have a members record (e.g. the original admin account).
  // Check isAdmin first so superadmins are not stuck on the login page.
  if (isAdmin) {
    return <Outlet />
  }

  if (!member) {
    return <AdminLogin />
  }

  // Authenticated but not admin
  return <Navigate to="/dashboard" replace />
}
