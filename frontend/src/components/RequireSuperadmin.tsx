import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Cosmetic gate for superadmin-only admin UI routes.
 * Edge Functions remain authoritative — never grant access from this alone.
 */
export function RequireSuperadmin() {
  const { isAdmin, isSuperadmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-stone-500">
        Checking your account…
      </div>
    )
  }

  if (!isAdmin || !isSuperadmin) {
    return <Navigate to="/admin/dashboard" replace />
  }

  return <Outlet />
}
